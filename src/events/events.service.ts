import { Injectable, Inject, forwardRef, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { StripePaymentService } from '../payments/stripe-payment.service';
import * as https from 'https';

const EB_API = (
  process.env.EVENTBRITE_API_BASE || 'https://www.eventbriteapi.com/v3'
).replace(/\/$/, '');
const TM_API = (
  process.env.TICKETMASTER_API_BASE ||
  'https://app.ticketmaster.com/discovery/v2'
).replace(/\/$/, '');

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WorkOrdersService))
    private workOrdersService: WorkOrdersService,
    private readonly stripePaymentService: StripePaymentService,
  ) {}

  // in-memory TM paging cursor for cron
  private tmRolling = {
    countryCodes: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL'],
    countryIndex: 0,
    page: 0,
  };

  private async fetchJson(url: string): Promise<any> {
    return await new Promise((resolve) => {
      try {
        https
          .get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                if (res.statusCode && res.statusCode >= 400) {
                  resolve({ 
                    error: `HTTP ${res.statusCode}: ${parsed.fault?.faultString || parsed.error || data.substring(0, 200)}` 
                  });
                } else {
                  resolve(parsed);
                }
              } catch (e) {
                resolve({ error: `Parse error: ${String(e)}` });
              }
            });
          })
          .on('error', (err) => resolve({ error: String(err) }));
      } catch (e) {
        resolve({ error: String(e) });
      }
    });
  }

  private async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async fetchWithRetries(
    url: string,
    tries = 3,
    backoffMs = 800,
  ): Promise<any> {
    let last: any;
    for (let i = 0; i < tries; i++) {
      const res = await this.fetchJson(url);
      if (!res?.error) return res;
      last = res.error;
      await this.sleep(backoffMs * (i + 1));
    }
    return { error: last ?? 'fetch failed' };
  }

  // advisory lock so syncs don't overlap across instances
  private async tryAcquireLock(lockKey = 774411): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT pg_try_advisory_lock(${lockKey}) as locked`,
      );
      return !!rows?.[0]?.locked;
    } catch {
      return false;
    }
  }
  private async releaseLock(lockKey = 774411): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `SELECT pg_advisory_unlock(${lockKey})`,
      );
    } catch {}
  }

  async list(limit?: number) {
    try {
      const useLimit =
        Number.isFinite(limit as number) && (limit as number) > 0
          ? (limit as number)
          : undefined;

      // local + external; hide flagged from public search
      const [localEvents, externalEvents] = await Promise.all([
        this.prisma.event.findMany({
          where: { isFlagged: false }, // Exclude flagged events
          orderBy: { createdAt: 'desc' },
          ...(useLimit ? { take: useLimit } : {}),
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            zipcode: true,
            startDate: true,
            endDate: true,
            basePrice: true,
            coverImage: true,
            images: true,
          },
        }),
        this.prisma.externalEvent.findMany({
          ...(useLimit ? { take: useLimit } : {}),
          orderBy: { startDate: 'asc' },
          where: { source: 'TICKETMASTER' },
        }),
      ]);

      const processedLocalEvents = localEvents.map((e: any) => ({
        ...e,
        basePrice:
          typeof e.basePrice === 'object' && e.basePrice !== null
            ? Number(e.basePrice)
            : e.basePrice,
        source: 'LOCAL',
        sourceId: e.id,
        externalUrl: null,
        price: e.basePrice ? `$${e.basePrice}` : null,
        city: e.address || e.city || '',
        zipcode: e.zipcode || null,
      }));

      // normalize external shape to match local
      const processedExternalEvents = externalEvents.map((event) => ({
        id: event.id,
        title: event.title,
        address: event.city, // Map city to address for consistency
        startDate: event.startDate,
        endDate: null,
        basePrice: null,
        coverImage: event.coverImage,
        images: [],
        source: 'TICKETMASTER',
        sourceId: event.sourceId,
        externalUrl: event.externalUrl,
        price: event.price,
      }));

      const combinedEvents = [
        ...processedLocalEvents,
        ...processedExternalEvents,
      ];

      // newest startDate first
      const sortedEvents = combinedEvents.sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA; // Most recent first
      });

      // optional limit
      return useLimit ? sortedEvents.slice(0, useLimit) : sortedEvents;
    } catch (error) {
      console.error('Failed to list events:', error);
      return [] as any[];
    }
  }

  async search(params: {
    what?: string;
    where?: string;
    zipcode?: string;
    when?: string;
    priceMin?: number;
    priceMax?: number;
    skip?: number;
    limit?: number;
  }): Promise<{ events: any[]; total: number }> {
    try {
      const {
        what,
        where,
        zipcode,
        when,
        priceMin,
        priceMax,
        skip = 0,
        limit = 20,
      } = params;

      const useLimit = Math.max(1, Math.min(100, Number(limit) || 20));
      const useSkip = Math.max(0, Number(skip) || 0);

      // local filters (exclude flagged)
      const localWhere: any = { isFlagged: false };
      if (what) {
        localWhere.title = { contains: what, mode: 'insensitive' };
      }
      // zip + where => AND; otherwise OR
      if (zipcode || where) {
        const andParts: any[] = [];
        if (zipcode) {
          andParts.push({
            OR: [
              { zipcode: { contains: zipcode, mode: 'insensitive' } },
              { address: { contains: zipcode, mode: 'insensitive' } },
            ],
          });
        }
        if (where) {
          andParts.push({
            OR: [
              { address: { contains: where, mode: 'insensitive' } },
              { city: { contains: where, mode: 'insensitive' } },
            ],
          });
        }
        if (andParts.length === 1) {
          localWhere.OR = andParts[0].OR;
        } else if (andParts.length > 1) {
          localWhere.AND = andParts;
        }
      }
      if (when) {
        const whenDate = new Date(when);
        const nextDay = new Date(whenDate);
        nextDay.setDate(nextDay.getDate() + 1);
        localWhere.startDate = {
          gte: whenDate,
          lt: nextDay,
        };
      }
      if (priceMin !== undefined || priceMax !== undefined) {
        localWhere.basePrice = {};
        if (priceMin !== undefined) {
          localWhere.basePrice.gte = priceMin;
        }
        if (priceMax !== undefined) {
          localWhere.basePrice.lte = priceMax;
        }
      }

      // TM external filters
      const externalWhere: any = { source: 'TICKETMASTER' };
      if (what) {
        externalWhere.title = { contains: what, mode: 'insensitive' };
      }
      if (where) {
        externalWhere.city = { contains: where, mode: 'insensitive' };
      }
      if (when) {
        const whenDate = new Date(when);
        const nextDay = new Date(whenDate);
        nextDay.setDate(nextDay.getDate() + 1);
        externalWhere.startDate = {
          gte: whenDate,
          lt: nextDay,
        };
      }

      // over-fetch so combined+sorted page is full enough
      const fetchLimit = useSkip + useLimit + 50; // Fetch enough to cover skip + limit + buffer

      const [localEvents, localCount] = await Promise.all([
        this.prisma.event.findMany({
          where: localWhere,
          orderBy: { createdAt: 'desc' },
          take: fetchLimit,
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            zipcode: true,
            startDate: true,
            endDate: true,
            basePrice: true,
            coverImage: true,
            images: true,
          },
        }),
        this.prisma.event.count({ where: localWhere }),
      ]);

      // skip TM when zip-filtering (no zip on ExternalEvent)
      let externalEvents: any[] = [];
      let externalCount = 0;
      if (!zipcode) {
        const [extEvents, extCount] = await Promise.all([
          this.prisma.externalEvent.findMany({
            where: externalWhere,
            orderBy: { startDate: 'asc' },
            take: fetchLimit,
            select: {
              id: true,
              source: true,
              sourceId: true,
              title: true,
              startDate: true,
              city: true,
              coverImage: true,
              externalUrl: true,
              price: true,
              createdAt: true,
            },
          }),
          this.prisma.externalEvent.count({ where: externalWhere }),
        ]);
        externalEvents = extEvents;
        externalCount = extCount;
      }

      const processedLocalEvents = localEvents.map((e: any) => ({
        ...e,
        basePrice:
          typeof e.basePrice === 'object' && e.basePrice !== null
            ? Number(e.basePrice)
            : e.basePrice,
        source: 'LOCAL',
        sourceId: e.id,
        externalUrl: null,
        price: e.basePrice ? `$${e.basePrice}` : null,
        city: e.address || e.city || '',
        zipcode: e.zipcode || null,
      }));

      // normalize externals; price filter applied below
      let processedExternalEvents = externalEvents.map((event) => ({
        id: event.id,
        title: event.title,
        address: event.city,
        startDate: event.startDate,
        endDate: null,
        basePrice: null,
        coverImage: event.coverImage,
        images: [],
        source: 'TICKETMASTER',
        sourceId: event.sourceId,
        externalUrl: event.externalUrl,
        price: event.price,
        city: event.city || '',
      }));

      // price filter on externals
      if (priceMin !== undefined || priceMax !== undefined) {
        processedExternalEvents = processedExternalEvents.filter((event) => {
          if (!event.price) return false;
          const priceStr = event.price.toString().toLowerCase();
          let numericPrice: number | undefined;
          if (priceStr === 'free') {
            numericPrice = 0;
          } else {
            const match = priceStr.match(/([0-9]+(?:\.[0-9]+)?)/);
            if (match) numericPrice = Number(match[1]);
          }
          if (numericPrice === undefined) return false;
          if (priceMin !== undefined && numericPrice < priceMin) return false;
          if (priceMax !== undefined && numericPrice > priceMax) return false;
          return true;
        });
      }

      const combinedEvents = [
        ...processedLocalEvents,
        ...processedExternalEvents,
      ];

      // newest startDate first
      const sortedEvents = combinedEvents.sort((a, b) => {
        const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
        const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
        return dateB - dateA;
      });

      const paginatedEvents = sortedEvents.slice(useSkip, useSkip + useLimit);

      // approximate total across two sources
      const total = localCount + externalCount;

      return {
        events: paginatedEvents,
        total,
      };
    } catch (error) {
      console.error('Failed to search events:', error);
      return { events: [], total: 0 };
    }
  }

  async create(input: any) {
    const organizer = await this.prisma.user.upsert({
      where: {
        email_role: {
          email: input.organizerEmail,
          role: 'ORGANIZER',
        },
      },
      update: {},
      create: { email: input.organizerEmail, role: 'ORGANIZER' },
    });

    const created = await this.prisma.event.create({
      data: {
        title: input.title,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        city: input.location || null, // Store location in city field for now
        basePrice: input.basePrice ?? null,
        coverImage: input.coverImage,
        images: input.images ?? [],
        status: input.status || 'DRAFT',
        visibility: input.visibility || 'PUBLIC',
        description: input.description ?? null,
        venue: input.location ?? null,
        address: input.address ?? input.location ?? null,
        zipcode: input.zipcode ?? null,
        timezone: input.timezone ?? null,
        organizerId: organizer.id,
        category: input.category || 'OTHER',
      },
      select: {
        id: true,
        title: true,
        city: true,
        startDate: true,
        endDate: true,
        basePrice: true,
        coverImage: true,
        images: true,
        status: true,
        visibility: true,
      },
    });
    return created;
  }

  async delete(id: string) {
    try {
      console.log('🗑️ Attempting to delete event with ID:', id);

      const event = await this.prisma.event.findUnique({ where: { id } });
      if (!event) {
        console.error('❌ Event not found with ID:', id);
        return { ok: false, error: 'Event not found' };
      }

      console.log('✅ Event found, deleting:', event.title);

      // wipe dependents first (FK order)
      const bookings = await this.prisma.booking.findMany({
        where: { eventId: id },
        select: { id: true },
      });
      const bookingIds = bookings.map((b) => b.id);

      if (bookingIds.length > 0) {
        console.log(
          `🗑️ Deleting ${bookingIds.length} tickets for ${bookingIds.length} bookings...`,
        );
        await this.prisma.ticket.deleteMany({
          where: { bookingId: { in: bookingIds } },
        });

        console.log(`🗑️ Deleting ${bookingIds.length} bookings...`);
        await this.prisma.booking.deleteMany({
          where: { eventId: id },
        });
      }

      const servicesCount = await this.prisma.eventService.count({
        where: { eventId: id },
      });
      if (servicesCount > 0) {
        console.log(`🗑️ Deleting ${servicesCount} services...`);
        await this.prisma.eventService.deleteMany({
          where: { eventId: id },
        });
      }

      const reviewsCount = await this.prisma.review.count({
        where: { eventId: id },
      });
      if (reviewsCount > 0) {
        console.log(`🗑️ Deleting ${reviewsCount} reviews...`);
        await this.prisma.review.deleteMany({
          where: { eventId: id },
        });
      }

      const rfqsCount = await this.prisma.rFQ.count({
        where: { eventId: id },
      });
      if (rfqsCount > 0) {
        console.log(`🗑️ Deleting ${rfqsCount} RFQs...`);
        await this.prisma.rFQ.deleteMany({
          where: { eventId: id },
        });
      }

      console.log('🗑️ Deleting event...');
      await this.prisma.event.delete({ where: { id } });

      console.log('✅ Event and all related records deleted successfully');
      return { ok: true };
    } catch (e: any) {
      console.error('❌ Error deleting event:', e);
      console.error('Error details:', {
        code: e?.code,
        message: e?.message,
        meta: e?.meta,
      });
      return { ok: false, error: e?.message || 'Unknown error' };
    }
  }

  async listByOrganizerEmail(email: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        role: 'ORGANIZER',
      },
    });
    if (!user) return [] as any[];
    const rows = await this.prisma.event.findMany({
      where: { organizerId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        address: true,
        startDate: true,
        endDate: true,
        basePrice: true,
        coverImage: true,
        images: true,
        visibility: true,
        isFlagged: true,
        flagReason: true,
        flaggedAt: true,
        unflagRequestStatus: true,
      },
    });
    return rows.map((e: any) => ({
      ...e,
      basePrice:
        typeof e.basePrice === 'object' && e.basePrice !== null
          ? Number(e.basePrice)
          : e.basePrice,
    }));
  }

  async update(id: string, body: any) {
    console.log('🔧 Backend update called with:', { id, body });
    // only Prisma-safe columns
    const data: any = {};

    if (typeof body?.title === 'string') data.title = body.title;
    if (typeof body?.description === 'string' || body?.description === null)
      data.description = body.description ?? null;
    if (typeof body?.coverImage === 'string') data.coverImage = body.coverImage;
    if (typeof body?.timezone === 'string') data.timezone = body.timezone;

    if (Array.isArray(body?.images)) data.images = body.images;
    if (body?.pricingTiers !== undefined) data.pricingTiers = body.pricingTiers; // JSON

    if (body?.basePrice !== undefined && body.basePrice !== null)
      data.basePrice = body.basePrice;

    if (typeof body?.status === 'string') data.status = body.status;
    if (typeof body?.visibility === 'string') data.visibility = body.visibility;

    if (typeof body?.startDate === 'string')
      data.startDate = new Date(body.startDate);
    if (typeof body?.endDate === 'string')
      data.endDate = new Date(body.endDate);

    // normalize location fields
    if (typeof body?.location === 'string' && body.location.trim()) {
      data.address = body.location;
      data.city = body.location;
      data.venue = body.location;
    }
    if (typeof body?.address === 'string' && body.address.trim())
      data.address = body.address;
    if (typeof body?.city === 'string' && body.city.trim())
      data.city = body.city;
    if (typeof body?.venue === 'string' && body.venue.trim())
      data.venue = body.venue;

    if (typeof body?.featuredOnHomepage === 'boolean') {
      data.featuredOnHomepage = body.featuredOnHomepage;
    }

    console.log('🔧 Final data being saved:', data);
    return this.prisma.event.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        address: true,
        startDate: true,
        endDate: true,
        basePrice: true,
        coverImage: true,
        images: true,
        status: true,
        visibility: true,
      },
    });
  }

  async getById(id: string) {
    return this.prisma.event.findUnique({ where: { id } });
  }

  // homepage feature toggle (max 5)
  async toggleHomepageFeature(eventId: string, featured: boolean): Promise<any> {
    if (featured) {
      // cap at 5 featured
      const featuredCount = await this.prisma.event.count({
        where: { featuredOnHomepage: true },
      });
      
      if (featuredCount >= 5) {
        throw new HttpException(
          'Maximum of 5 events can be featured on homepage. Please remove one first.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    return this.prisma.event.update({
      where: { id: eventId },
      data: { featuredOnHomepage: featured },
      select: {
        id: true,
        title: true,
        featuredOnHomepage: true,
      },
    });
  }

  // featured homepage events
  async getFeaturedEvents(): Promise<any[]> {
    return this.prisma.event.findMany({
      where: {
        featuredOnHomepage: true,
        isFlagged: false, // Don't show flagged events
        status: 'PUBLISHED', // Only published events
      },
      orderBy: {
        createdAt: 'desc', // Most recently featured first
      },
      take: 5, // Enforce limit
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        city: true,
        address: true,
        basePrice: true,
        coverImage: true,
        images: true,
        category: true,
        status: true,
        visibility: true,
        featuredOnHomepage: true,
      },
    });
  }

  // sold vs remaining per pricing tier
  async getTicketAvailability(
    eventId: string,
  ): Promise<
    Record<string, { total: number; sold: number; remaining: number }>
  > {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { pricingTiers: true },
      });

      if (!event || !event.pricingTiers || !Array.isArray(event.pricingTiers)) {
        return {};
      }

      const availability: Record<
        string,
        { total: number; sold: number; remaining: number }
      > = {};

      const bookings = await this.prisma.booking.findMany({
        where: {
          eventId,
          paymentStatus: 'COMPLETED',
        },
        include: {
          tickets: {
            select: {
              tier: true,
            },
          },
        },
      });

      const soldCounts: Record<string, number> = {};
      for (const booking of bookings) {
        for (const ticket of booking.tickets) {
          const tierName = ticket.tier || 'default';
          soldCounts[tierName] = (soldCounts[tierName] || 0) + 1;
        }
      }

      for (const tier of event.pricingTiers) {
        // pricingTiers is JSON
        const tierObj = tier as any;
        const tierName = (tierObj?.name || 'default') as string;
        const total = (tierObj?.quantity || 0) as number;
        const sold = soldCounts[tierName] || 0;
        const remaining = Math.max(0, total - sold);

        availability[tierName] = {
          total,
          sold,
          remaining,
        };
      }

      return availability;
    } catch (error) {
      console.error('Error getting ticket availability:', error);
      return {};
    }
  }

  async preview(id: string) {
    const ev = await this.prisma.event.findUnique({ where: { id } });
    if (!ev) return null;
    return {
      id: ev.id,
      title: ev.title,
      startDate: ev.startDate,
      endDate: ev.endDate,
      address: ev.address,
      coverImage: ev.coverImage,
      images: ev.images,
      basePrice: ev.basePrice,
      description: ev.description,
      status: ev.status,
      visibility: ev.visibility,
    };
  }

  // organizer ticket sales rollup
  async getOrganizerTicketSales(organizerId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        paymentStatus: 'COMPLETED',
        event: {
          organizerId,
        },
      },
      select: {
        totalAmount: true,
        currency: true,
        event: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    const summaryMap: Record<
      string,
      {
        eventId: string;
        title: string;
        ticketsSold: number;
        earnings: number;
        currency: string;
      }
    > = {};

    for (const booking of bookings) {
      const eventId = booking.event.id;
      const title = booking.event.title || 'Untitled Event';
      const amount = Number(booking.totalAmount || 0);
      const currency = booking.currency || 'USD';

      if (!summaryMap[eventId]) {
        summaryMap[eventId] = {
          eventId,
          title,
          ticketsSold: 0,
          earnings: 0,
          currency,
        };
      }
      summaryMap[eventId].ticketsSold += 1; // booking as a proxy for tickets; adjust if per-ticket needed
      summaryMap[eventId].earnings += amount;
    }

    return Object.values(summaryMap).sort((a, b) => b.earnings - a.earnings);
  }

  // bookings across organizer's events
  async getOrganizerBookings(organizerId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        event: {
          organizerId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        tickets: {
          select: {
            id: true,
            ticketNumber: true,
            price: true,
            tier: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      totalAmount: Number(booking.totalAmount),
      currency: booking.currency,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      createdAt: booking.createdAt.toISOString(),
      user: booking.user,
      event: booking.event,
      tickets: booking.tickets.map((ticket) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        price: Number(ticket.price),
        tier: ticket.tier,
        status: ticket.status,
      })),
    }));
  }

  // vendors linked to organizer's events
  async getOrganizerEventVendors(organizerId: string) {
    const events = await this.prisma.event.findMany({
      where: {
        organizerId,
      },
      include: {
        vendors: {
          include: {
            vendor: {
              select: {
                id: true,
                businessName: true,
                category: true,
              },
            },
          },
        },
      },
    });

    return events.map((event) => ({
      eventId: event.id,
      eventTitle: event.title,
      vendors: event.vendors.map((ev) => ({
        id: ev.id,
        status: ev.status,
        vendor: ev.vendor,
      })),
    }));
  }

  // create RFQ on an event
  async createRFQ(
    eventId: string,
    organizerId: string,
    data: {
      title: string;
      description: string;
      category: string;
      budget?: number;
      currency?: string;
      requirements?: any;
      deadline?: Date;
      eventDate?: Date;
      postalCode?: string;
    },
  ) {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        organizerId: organizerId,
      },
    });

    if (!event) {
      throw new HttpException(
        'Event not found or you do not have permission to create RFQ for this event',
        404,
      );
    }

    if (event.isFlagged) {
      throw new HttpException(
        'This event has been flagged. RFQs cannot be created for flagged events.',
        400,
      );
    }

    return await this.prisma.rFQ.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category as any,
        budget: data.budget,
        currency: data.currency || 'USD',
        requirements: data.requirements,
        deadline: data.deadline,
        eventDate: data.eventDate,
        ...(data.postalCode && { postalCode: data.postalCode }),
        eventId: eventId,
        organizerId: organizerId,
        status: 'OPEN',
      } as any,
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  // organizer unflag request
  async requestUnflag(eventId: string, reason: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new HttpException('Event not found', 404);
    }

    if (!event.isFlagged) {
      throw new HttpException('Event is not flagged', 400);
    }

    return await this.prisma.event.update({
      where: { id: eventId },
      data: {
        unflagRequestReason: reason,
        unflagRequestStatus: 'PENDING',
      },
    });
  }

  // RFQs for organizer's events
  async getOrganizerRFQs(organizerId: string) {
    const rfqs = await this.prisma.rFQ.findMany({
      where: {
        organizerId,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
          },
        },
        proposals: {
          include: {
            vendor: {
              select: {
                id: true,
                businessName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rfqs.map((rfq: any) => ({
      id: rfq.id,
      title: rfq.title,
      description: rfq.description,
      category: rfq.category,
      budget: rfq.budget ? Number(rfq.budget) : null,
      currency: rfq.currency || 'USD',
      postalCode: rfq.postalCode || null,
      status: rfq.status,
      eventDate: rfq.eventDate?.toISOString() || null,
      deadline: rfq.deadline?.toISOString() || null,
      createdAt: rfq.createdAt.toISOString(),
      eventId: rfq.eventId,
      event: rfq.event,
      proposals: rfq.proposals.map((proposal: any) => ({
        id: proposal.id,
        title: proposal.title,
        price: Number(proposal.price),
        status: proposal.status,
        vendor: proposal.vendor,
      })),
    }));
  }

  // organizer Stripe Connect Express
  async createOrganizerStripeConnectAccount(
    userId: string,
  ): Promise<{ accountId: string; onboardingUrl: string }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          stripeAccountId: true,
          stripeConnectEnabled: true,
          role: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      if (user.role !== 'ORGANIZER') {
        throw new Error('User is not an organizer');
      }

      // reuse existing Connect account
      if (user.stripeAccountId && user.stripeConnectEnabled) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const accountLink = await this.stripePaymentService.createAccountLink(
          user.stripeAccountId,
          `${frontendUrl}/dashboard?refresh=true`,
          `${frontendUrl}/dashboard?return=true`,
        );
        return {
          accountId: user.stripeAccountId,
          onboardingUrl: accountLink.url,
        };
      }

      const businessName =
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.email;

      const account = await this.stripePaymentService.createConnectAccount({
        email: user.email,
        businessName: businessName,
        businessType: 'individual', // Organizers are typically individuals
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const accountLink = await this.stripePaymentService.createAccountLink(
        account.id,
        `${frontendUrl}/dashboard?refresh=true`,
        `${frontendUrl}/dashboard?return=true`,
      );

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          stripeAccountId: account.id,
          stripeConnectOnboardingUrl: accountLink.url,
          stripeConnectEnabled: false, // Will be set to true after onboarding completion
        },
      });

      return {
        accountId: account.id,
        onboardingUrl: accountLink.url,
      };
    } catch (error: any) {
      console.error(
        'Error creating Stripe Connect account for organizer:',
        error,
      );
      throw error;
    }
  }

  // Connect onboarding / charges status
  async checkOrganizerStripeConnectStatus(
    userId: string,
  ): Promise<{ enabled: boolean; details: any }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          stripeAccountId: true,
          stripeConnectEnabled: true,
          role: true,
        },
      });

      if (!user || user.role !== 'ORGANIZER' || !user.stripeAccountId) {
        return { enabled: false, details: null };
      }

      const account = await this.stripePaymentService.getAccountStatus(
        user.stripeAccountId,
      );

      // ready once charges or payouts are active
      const isEnabled =
        user.stripeConnectEnabled === true ||
        (account.details_submitted &&
          (account.charges_enabled || account.payouts_enabled));

      if (isEnabled !== user.stripeConnectEnabled) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            stripeConnectEnabled: isEnabled,
          },
        });
      }

      return {
        enabled: isEnabled,
        details: {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
        },
      };
    } catch (error: any) {
      console.error(
        'Error checking Stripe Connect status for organizer:',
        error,
      );
      return { enabled: false, details: null };
    }
  }

  async fetchEventbriteEvents(
    params: { q?: string; city?: string; page?: number } = {},
  ) {
    const token = process.env.EVENTBRITE_TOKEN;
    if (!token) {
      return { events: [], pagination: { has_more_items: false } };
    }
    try {
      const url = new URL(`${EB_API}/events/search/`);
      if (params.q) url.searchParams.set('q', params.q);
      if (params.city) {
        url.searchParams.set('location.address', params.city);
        url.searchParams.set('location.within', '100km');
      }
      // upcoming, soonest first
      url.searchParams.set('start_date.range_start', new Date().toISOString());
      url.searchParams.set('sort_by', 'date');
      url.searchParams.set('page', String(params.page || 1));
      url.searchParams.set('expand', 'venue,category,subcategory,format');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        return { events: [], pagination: { has_more_items: false } };
      }
      const data = await res.json();
      const mapped = (data.events || []).map((e: any) => ({
        source: 'EVENTBRITE' as const,
        sourceId: e.id,
        title: e.name?.text || 'Untitled',
        startDate: e.start?.utc || e.start?.local,
        city:
          e.venue?.address?.city ||
          e.venue?.address?.localized_address_display ||
          '',
        coverImage: e.logo?.original?.url || e.logo?.url || null,
        externalUrl: e.url,
        raw: e,
      }));
      return {
        events: mapped,
        pagination: data.pagination || { has_more_items: false },
      };
    } catch (e) {
      console.error('Eventbrite fetch failed:', e);
      return { events: [], pagination: { has_more_items: false } };
    }
  }

  async upsertExternalEvents(
    items: Array<{
      source: 'EVENTBRITE';
      sourceId: string;
      title: string;
      startDate?: string;
      city?: string;
      coverImage?: string | null;
      externalUrl?: string | null;
      raw?: any;
    }>,
  ) {
    if (!items?.length) return { inserted: 0, updated: 0 };
    let inserted = 0;
    let updated = 0;
    for (const it of items) {
      const exists = await this.prisma.externalEvent.findUnique({
        where: { sourceId: it.sourceId },
      });
      if (exists) {
        await this.prisma.externalEvent.update({
          where: { sourceId: it.sourceId },
          data: {
            title: it.title,
            startDate: it.startDate ? new Date(it.startDate) : null,
            city: it.city || null,
            coverImage: it.coverImage || null,
            externalUrl: it.externalUrl || null,
            raw: it.raw ?? undefined,
          },
        });
        updated++;
      } else {
        await this.prisma.externalEvent.create({
          data: {
            source: 'EVENTBRITE',
            sourceId: it.sourceId,
            title: it.title,
            startDate: it.startDate ? new Date(it.startDate) : null,
            city: it.city || null,
            coverImage: it.coverImage || null,
            externalUrl: it.externalUrl || null,
            raw: it.raw ?? undefined,
          },
        });
        inserted++;
      }
    }
    return { inserted, updated };
  }

  // async listStoredExternal(limit?: number) {

  async listStoredExternal(limit?: number, skip?: number) {
    const useLimit =
      Number.isFinite(limit as number) && (limit as number) > 0
        ? (limit as number)
        : 20;
    const useSkip =
      Number.isFinite(skip as number) && (skip as number) >= 0
        ? (skip as number)
        : 0;

    const rows = await this.prisma.externalEvent.findMany({
      where: { source: 'TICKETMASTER' },
      orderBy: { startDate: 'asc' },
      take: useLimit,
      skip: useSkip,
      select: {
        id: true,
        source: true,
        sourceId: true,
        title: true,
        startDate: true,
        city: true,
        coverImage: true,
        externalUrl: true,
        price: true,
        createdAt: true,
      },
    });
    // only keep TM-provided URLs (constructed ones often 404)
    return rows.map((r) => ({ ...r, source: 'TICKETMASTER' as const }));
  }

  async countStoredExternalTicketmaster() {
    return this.prisma.externalEvent.count({
      where: { source: 'TICKETMASTER' },
    });
  }

  private async getLatestTicketmasterStartDateISO(): Promise<string | null> {
    const row = await this.prisma.externalEvent.findFirst({
      where: { source: 'TICKETMASTER', startDate: { not: null } },
      orderBy: { startDate: 'desc' },
      select: { startDate: true },
    });
    return row?.startDate ? new Date(row.startDate as any).toISOString() : null;
  }

  async syncTicketmasterNextBatch(): Promise<{
    fetched: number;
    inserted: number;
    updated: number;
    page: number;
  }> {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) return { fetched: 0, inserted: 0, updated: 0, page: 0 };

    const size = 200;
    let page = 0; // only used for reporting

    // continue after latest stored startDate
    const lastISO = await this.getLatestTicketmasterStartDateISO();
    const startParam = lastISO
      ? `&startDateTime=${encodeURIComponent(lastISO)}`
      : '';
    const baseParams = `apikey=${apiKey}&size=${size}&sort=date,asc&includeTest=no&locale=*${startParam}`;
    const countries = ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL'];
    let countryIndex = 0;
    let nextUrl: string | null =
      `${TM_API}/events.json?${baseParams}&countryCode=${countries[countryIndex]}`;
    let fetched = 0;
    let inserted = 0;
    let updated = 0;

    while (nextUrl && inserted < 200) {
      const data = await new Promise<any>((resolve, reject) => {
        https
          .get(nextUrl as string, (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
              try {
                resolve(JSON.parse(buf));
              } catch (e) {
                reject(e);
              }
            });
          })
          .on('error', reject);
      });

      const rawEvents = Array.isArray(data?._embedded?.events)
        ? data._embedded.events
        : [];
      const events = rawEvents.map((e: any) => ({
        source: 'TICKETMASTER' as const,
        sourceId: e.id,
        title: e.name || 'Untitled Event',
        startDate: e.dates?.start?.dateTime || e.dates?.start?.localDate,
        city:
          e._embedded?.venues?.[0]?.city?.name ||
          e._embedded?.venues?.[0]?.address?.city ||
          '',
        coverImage: e.images?.[0]?.url || null,
        externalUrl: e.url || null,
        price: e.priceRanges?.[0]
          ? `${e.priceRanges[0].min}-${e.priceRanges[0].max} ${e.priceRanges[0].currency}`
          : null,
        raw: e,
      }));

      fetched += events.length;
      const result = await this.upsertTicketmasterEvents(events);
      inserted += result.inserted;
      updated += result.updated;
      page += 1;

      const nextHref = data?._links?.next?.href as string | undefined;
      if (nextHref) {
        nextUrl = `${TM_API}${nextHref}${nextHref.includes('apikey=') ? '' : `&apikey=${apiKey}`}`;
      } else {
        countryIndex += 1;
        nextUrl =
          countryIndex < countries.length
            ? `${TM_API}/events.json?${baseParams}&countryCode=${countries[countryIndex]}`
            : null;
      }
    }

    return { fetched, inserted, updated, page };
  }

  // rolling sync: one page per call, then advance cursor
  async syncTicketmasterRolling(size = 100): Promise<{
    country: string;
    page: number;
    fetched: number;
    inserted: number;
    updated: number;
  }> {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      console.error('[TM Sync] No API key found');
      return { country: 'NA', page: 0, fetched: 0, inserted: 0, updated: 0 };
    }

    const country =
      this.tmRolling.countryCodes[
        this.tmRolling.countryIndex % this.tmRolling.countryCodes.length
      ];
    const page = this.tmRolling.page;
    
    const TM_API_BASE = (
      process.env.TICKETMASTER_API_BASE ||
      'https://app.ticketmaster.com/discovery/v2'
    ).replace(/\/$/, '');
    
    let url = `${TM_API_BASE}/events.json?apikey=${apiKey}&size=${size}&page=${page}&sort=date,asc`;
    // countryCode optional (some countries empty)
    url += `&countryCode=${country}`;
    
    console.log(`[TM Sync] Fetching: country=${country}, page=${page}`);
    console.log(`[TM Sync] Full URL: ${url.replace(apiKey, 'API_KEY_HIDDEN')}`);
    
    let data: any;
    try {
      data = await new Promise((resolve, reject) => {
        https
          .get(url, (res) => {
            let responseData = '';
            console.log(`[TM Sync] HTTP Status: ${res.statusCode}`);
            res.on('data', (chunk) => (responseData += chunk));
            res.on('end', () => {
              try {
                const parsed = JSON.parse(responseData);
                if (res.statusCode && res.statusCode >= 400) {
                  console.error(`[TM Sync] HTTP Error ${res.statusCode}:`, parsed);
                  resolve({ error: `HTTP ${res.statusCode}: ${parsed.fault?.faultString || parsed.error || responseData.substring(0, 200)}` });
                } else {
                  resolve(parsed);
                }
              } catch (e) {
                console.error(`[TM Sync] Parse error:`, e);
                resolve({ error: `Parse error: ${String(e)}` });
              }
            });
          })
          .on('error', (err) => {
            console.error(`[TM Sync] Request error:`, err);
            resolve({ error: String(err) });
          });
      });
    } catch (error) {
      console.error(`[TM Sync] Exception:`, error);
      data = { error: String(error) };
    }
    
    if (!data) {
      console.error(`[TM Sync] No data returned from API`);
      this.advanceRollingState();
      return { country, page, fetched: 0, inserted: 0, updated: 0 };
    }
    
    if (data.error) {
      console.error(`[TM Sync] API error:`, data.error);
      this.advanceRollingState();
      return { country, page, fetched: 0, inserted: 0, updated: 0 };
    }
    
    console.log(`[TM Sync] API response: page=${data?.page?.number}, totalPages=${data?.page?.totalPages}, totalElements=${data?.page?.totalElements}`);
    console.log(`[TM Sync] Has _embedded: ${!!data?._embedded}, Has events: ${!!data?._embedded?.events}`);

    const rawEvents = Array.isArray(data?._embedded?.events)
      ? data._embedded.events
      : [];
    
    console.log(`[TM Sync] Raw events received: ${rawEvents.length}`);
    if (rawEvents.length === 0) {
      console.log(`[TM Sync] No events found. Response structure:`, JSON.stringify({
        page: data?.page,
        hasEmbedded: !!data?._embedded,
        embeddedKeys: data?._embedded ? Object.keys(data._embedded) : [],
        topLevelKeys: Object.keys(data || {}),
      }).substring(0, 1000));
    }
    
    const events = rawEvents
      .map((e: any) => {
        try {
          return {
            source: 'TICKETMASTER' as const,
            sourceId: String(e?.id || ''),
            title: String(e?.name || 'Untitled Event'),
            startDate:
              e?.dates?.start?.dateTime ||
              e?.dates?.start?.localDate ||
              undefined,
            city:
              e?._embedded?.venues?.[0]?.city?.name ||
              e?._embedded?.venues?.[0]?.address?.city ||
              '',
            coverImage: e?.images?.[0]?.url || null,
            externalUrl: e?.url || null,
            price:
              Array.isArray(e?.priceRanges) && e.priceRanges[0]
                ? `${e.priceRanges[0].min}-${e.priceRanges[0].max} ${e.priceRanges[0].currency}`
                : null,
            raw: e,
          };
        } catch (err) {
          return null;
        }
      })
      .filter(Boolean) as Array<{
      source: 'TICKETMASTER';
      sourceId: string;
      title: string;
      startDate?: string | undefined;
      city?: string;
      coverImage?: string | null;
      externalUrl?: string | null;
      price?: string | null;
      raw?: any;
    }>;

    let inserted = 0;
    let updated = 0;
    try {
      const result = await this.upsertTicketmasterEvents(events);
      inserted = result.inserted;
      updated = result.updated;
    } catch (e) {
      // fall back to per-row upsert
      for (const it of events) {
        try {
          const res = await this.upsertTicketmasterEvents([it]);
          inserted += res.inserted;
          updated += res.updated;
        } catch {}
      }
    }

    // advance page / country cursor
    const pageInfo = data?.page as { totalPages?: number } | undefined;
    const totalPages =
      typeof pageInfo?.totalPages === 'number'
        ? pageInfo.totalPages
        : undefined;
    this.tmRolling.page += 1;
    if (
      events.length === 0 ||
      (totalPages !== undefined && this.tmRolling.page >= totalPages)
    ) {
      this.tmRolling.page = 0;
      this.tmRolling.countryIndex =
        (this.tmRolling.countryIndex + 1) % this.tmRolling.countryCodes.length;
    }

    return { country, page, fetched: events.length, inserted, updated };
  }

  private advanceRollingState() {
    this.tmRolling.page += 1;
    if (this.tmRolling.page > 50) {
      this.tmRolling.page = 0;
      this.tmRolling.countryIndex =
        (this.tmRolling.countryIndex + 1) %
        this.tmRolling.countryCodes.length;
    }
  }

  // full TM sync under advisory lock
  async syncTicketmasterFullReliable(
    countryCodes: string[] = [
      'US',
      'CA',
      'GB',
      'AU',
      'DE',
      'FR',
      'ES',
      'IT',
      'NL',
    ],
    pageSize = 200,
  ) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) return { ok: false, error: 'Missing TICKETMASTER_API_KEY' };

    const gotLock = await this.tryAcquireLock(884422);
    if (!gotLock) {
      return { ok: false, error: 'Another sync is running' };
    }
    let totalFetched = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    try {
      for (const country of countryCodes) {
        let page = 0;
        for (;;) {
          const url = `${TM_API}/events.json?apikey=${apiKey}&size=${pageSize}&page=${page}&countryCode=${country}&sort=date,asc&includeTest=no&locale=*`;
          const data = await this.fetchWithRetries(url, 3, 800);
          if (!data || data.error) break;
          const rawEvents = Array.isArray(data?._embedded?.events)
            ? data._embedded.events
            : [];
          if (!rawEvents.length) break;

          const items = rawEvents.map((e: any) => ({
            source: 'TICKETMASTER' as const,
            sourceId: String(e?.id || ''),
            title: String(e?.name || 'Untitled Event'),
            startDate:
              e?.dates?.start?.dateTime ||
              e?.dates?.start?.localDate ||
              undefined,
            city:
              e?._embedded?.venues?.[0]?.city?.name ||
              e?._embedded?.venues?.[0]?.address?.city ||
              '',
            coverImage: e?.images?.[0]?.url || null,
            externalUrl: e?.url || null,
            price:
              Array.isArray(e?.priceRanges) && e.priceRanges[0]
                ? `${e.priceRanges[0].min}-${e.priceRanges[0].max} ${e.priceRanges[0].currency}`
                : null,
            raw: e,
          }));

          totalFetched += items.length;

          // split existing vs new
          const ids = items.map((x) => x.sourceId);
          const existing = await this.prisma.externalEvent.findMany({
            where: { sourceId: { in: ids } },
            select: { sourceId: true },
          });
          const existingSet = new Set(existing.map((r) => r.sourceId));
          const toCreate = items.filter((x) => !existingSet.has(x.sourceId));
          const toUpdate = items.filter((x) => existingSet.has(x.sourceId));

          if (toCreate.length) {
            await this.prisma.externalEvent.createMany({
              data: toCreate.map((it) => ({
                source: 'TICKETMASTER',
                sourceId: it.sourceId,
                title: it.title,
                startDate: it.startDate ? new Date(it.startDate) : null,
                city: it.city || null,
                coverImage: it.coverImage || null,
                externalUrl: it.externalUrl || null,
                price: it.price || null,
                raw: it.raw ?? undefined,
              })),
              skipDuplicates: true,
            });
            totalInserted += toCreate.length;
          }
          // small update batches (pool-friendly)
          const CHUNK_SIZE = 25;
          for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
            const chunk = toUpdate.slice(i, i + CHUNK_SIZE).map((it) =>
              this.prisma.externalEvent.update({
                where: { sourceId: it.sourceId },
                data: {
                  title: it.title,
                  startDate: it.startDate ? new Date(it.startDate) : null,
                  city: it.city || null,
                  coverImage: it.coverImage || null,
                  externalUrl: it.externalUrl || null,
                  price: it.price || null,
                  raw: it.raw ?? undefined,
                },
              }),
            );
            const results = await this.prisma.$transaction(chunk);
            totalUpdated += results.length;
          }

          const totalPages =
            typeof data?.page?.totalPages === 'number'
              ? data.page.totalPages
              : undefined;
          page += 1;
          if (totalPages !== undefined && page >= totalPages) break;
        }
      }
      return {
        ok: true,
        fetched: totalFetched,
        inserted: totalInserted,
        updated: totalUpdated,
      };
    } catch (e: any) {
      return {
        ok: false,
        error: e?.message || String(e),
        fetched: totalFetched,
        inserted: totalInserted,
        updated: totalUpdated,
      };
    } finally {
      await this.releaseLock(884422);
    }
  }

  async getAllEvents(limit = 5000) {
    const [localEvents, externalEvents] = await Promise.all([
      this.prisma.event.findMany({
        take: Math.floor(limit / 2),
        orderBy: { startDate: 'asc' },
        where: { status: 'PUBLISHED' },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          city: true,
          basePrice: true,
          coverImage: true,
          status: true,
          visibility: true,
          description: true,
          venue: true,
          address: true,
          timezone: true,
          category: true,
          organizer: {
            select: {
              email: true,
            },
          },
        },
      }),
      this.prisma.externalEvent.findMany({
        take: Math.floor(limit / 2),
        orderBy: { startDate: 'asc' },
        where: { source: 'TICKETMASTER' },
      }),
    ]);

    const combinedEvents = [
      ...localEvents.map((event) => ({
        ...event,
        source: 'LOCAL',
        sourceId: event.id,
        externalUrl: null,
        price: event.basePrice ? `$${event.basePrice}` : null,
      })),
      ...externalEvents.map((event) => ({
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: null,
        city: event.city,
        basePrice: null,
        coverImage: event.coverImage,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        description: null,
        venue: event.city,
        address: null,
        timezone: null,
        category: 'OTHER',
        organizer: { email: 'ticketmaster@external.com' },
        source: 'TICKETMASTER',
        sourceId: event.sourceId,
        externalUrl: event.externalUrl,
        price: event.price,
      })),
    ];

    return combinedEvents.sort((a, b) => {
      const dateA = a.startDate ? new Date(a.startDate).getTime() : 0;
      const dateB = b.startDate ? new Date(b.startDate).getTime() : 0;
      return dateA - dateB;
    });
  }

  async getTrendingEvents(limit = 6) {
  // trending mix of local + external
    const [localEvents, externalEvents] = await Promise.all([
      this.prisma.event.findMany({
        take: Math.floor(limit / 2),
        orderBy: { createdAt: 'desc' },
        where: { status: 'PUBLISHED' },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          city: true,
          basePrice: true,
          coverImage: true,
          status: true,
          visibility: true,
          description: true,
          venue: true,
          address: true,
          timezone: true,
          category: true,
          organizer: {
            select: {
              email: true,
            },
          },
        },
      }),
      this.prisma.externalEvent.findMany({
        take: Math.floor(limit / 2),
        orderBy: { createdAt: 'desc' },
        where: { source: 'TICKETMASTER' },
      }),
    ]);

    const combinedEvents = [
      ...localEvents.map((event) => ({
        ...event,
        source: 'LOCAL',
        sourceId: event.id,
        externalUrl: null,
        price: event.basePrice ? `$${event.basePrice}` : null,
      })),
      ...externalEvents.map((event) => ({
        id: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: null,
        city: event.city,
        basePrice: null,
        coverImage: event.coverImage,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        description: null,
        venue: event.city,
        address: null,
        timezone: null,
        category: 'OTHER',
        organizer: { email: 'ticketmaster@external.com' },
        source: 'TICKETMASTER',
        sourceId: event.sourceId,
        externalUrl: event.externalUrl,
        price: event.price,
      })),
    ];

    // shuffle then take limit
    return combinedEvents.sort(() => Math.random() - 0.5).slice(0, limit);
  }

  async fetchTicketmasterEvents(
    params: {
      keyword?: string;
      city?: string;
      size?: number;
      page?: number;
    } = {},
  ) {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      console.warn(
        'TICKETMASTER_API_KEY is not set. Skipping Ticketmaster fetch.',
      );
      return {
        events: [],
        page: { totalElements: 0 },
        error: 'TICKETMASTER_API_KEY environment variable is not set',
      };
    }

    try {
      const TM_API_BASE = (
        process.env.TICKETMASTER_API_BASE ||
        'https://app.ticketmaster.com/discovery/v2'
      ).replace(/\/$/, '');
      let url = `${TM_API_BASE}/events.json?apikey=${apiKey}`;
      url += `&size=${params.size || 20}`;
      url += `&page=${params.page || 0}`;
      url += `&sort=date,asc`;

      if (params.keyword)
        url += `&keyword=${encodeURIComponent(params.keyword)}`;
      if (params.city) url += `&city=${encodeURIComponent(params.city)}`;

      console.log('Fetching from URL:', url);

      const data = (await new Promise((resolve, reject) => {
        https
          .get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            });
          })
          .on('error', reject);
      })) as any;

      console.log('Received data keys:', Object.keys(data));
      console.log('Events count:', data._embedded?.events?.length || 0);
      const mapped = (data._embedded?.events || []).map((e: any) => ({
        source: 'TICKETMASTER' as const,
        sourceId: e.id,
        title: e.name || 'Untitled Event',
        startDate: e.dates?.start?.dateTime || e.dates?.start?.localDate,
        city:
          e._embedded?.venues?.[0]?.city?.name ||
          e._embedded?.venues?.[0]?.address?.city ||
          '',
        coverImage: e.images?.[0]?.url || null,
        externalUrl: e.url || null,
        price: e.priceRanges?.[0]
          ? `${e.priceRanges[0].min}-${e.priceRanges[0].max} ${e.priceRanges[0].currency}`
          : null,
        raw: e,
      }));

      return {
        events: mapped,
        page: data.page || { totalElements: 0 },
      };
    } catch (error) {
      console.error('Error fetching Ticketmaster events:', error);
      return {
        events: [],
        page: { totalElements: 0 },
        error: error instanceof Error ? error.message : 'Unknown error',
        debug: { error: String(error) },
      };
    }
  }

  async upsertTicketmasterEvents(
    items: Array<{
      source: 'TICKETMASTER';
      sourceId: string;
      title: string;
      startDate?: string;
      city?: string;
      coverImage?: string | null;
      externalUrl?: string | null;
      price?: string | null;
      raw?: any;
    }>,
  ) {
    if (!items?.length) return { inserted: 0, updated: 0 };
    let inserted = 0;
    let updated = 0;

    for (const it of items) {
      const exists = await this.prisma.externalEvent.findUnique({
        where: { sourceId: it.sourceId },
      });

      if (exists) {
        await this.prisma.externalEvent.update({
          where: { sourceId: it.sourceId },
          data: {
            title: it.title,
            startDate: it.startDate ? new Date(it.startDate) : null,
            city: it.city || null,
            coverImage: it.coverImage || null,
            externalUrl: it.externalUrl || null,
            price: it.price || null,
            raw: it.raw ?? undefined,
          },
        });
        updated++;
      } else {
        await this.prisma.externalEvent.create({
          data: {
            source: 'TICKETMASTER',
            sourceId: it.sourceId,
            title: it.title,
            startDate: it.startDate ? new Date(it.startDate) : null,
            city: it.city || null,
            coverImage: it.coverImage || null,
            externalUrl: it.externalUrl || null,
            price: it.price || null,
            raw: it.raw ?? undefined,
          },
        });
        inserted++;
      }
    }
    return { inserted, updated };
  }

  async syncAllTicketmasterPages(): Promise<number> {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) return 0;

    const size = 200; // Ticketmaster page size limit
    let totalUpserts = 0;

    // walk several country codes
    const countryCodes = ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL'];

    for (const countryCode of countryCodes) {
      let nextUrl: string | null =
        `${TM_API}/events.json?apikey=${apiKey}&size=${size}&countryCode=${countryCode}&sort=date,asc&locale=*`;
      let iterations = 0;
      const maxIterations = 500; // per-country safety cap

      while (nextUrl) {
        iterations++;
        if (iterations > maxIterations) break;

        const data = await new Promise<any>((resolve, reject) => {
          https
            .get(nextUrl as string, (res) => {
              let buf = '';
              res.on('data', (c) => (buf += c));
              res.on('end', () => {
                try {
                  resolve(JSON.parse(buf));
                } catch (e) {
                  reject(e);
                }
              });
            })
            .on('error', reject);
        });

        const rawEvents = Array.isArray(data?._embedded?.events)
          ? data._embedded.events
          : [];
        const events = rawEvents.map((e: any) => ({
          source: 'TICKETMASTER' as const,
          sourceId: e.id,
          title: e.name || 'Untitled Event',
          startDate: e.dates?.start?.dateTime || e.dates?.start?.localDate,
          city:
            e._embedded?.venues?.[0]?.city?.name ||
            e._embedded?.venues?.[0]?.address?.city ||
            '',
          coverImage: e.images?.[0]?.url || null,
          externalUrl: e.url || null,
          price: e.priceRanges?.[0]
            ? `${e.priceRanges[0].min}-${e.priceRanges[0].max} ${e.priceRanges[0].currency}`
            : null,
          raw: e,
        }));

        if (events.length > 0) {
          const result = await this.upsertTicketmasterEvents(events);
          totalUpserts += (result.inserted || 0) + (result.updated || 0);
        }

        const nextHref = data?._links?.next?.href as string | undefined;
        nextUrl = nextHref
          ? `${TM_API}${nextHref}${nextHref.includes('apikey=') ? '' : `&apikey=${apiKey}`}`
          : null;
      }
    }

    return totalUpserts;
  }

  // admin utilities
  async purgeEvents(keyword?: string) {
    try {
      if (keyword && keyword.trim().length > 0) {
        const res = await this.prisma.event.deleteMany({
          where: { title: { contains: keyword, mode: 'insensitive' } },
        });
        return {
          ok: true,
          deleted: res.count,
          message: `Deleted ${res.count} events with keyword "${keyword}"`,
        };
      }
      const res = await this.prisma.event.deleteMany({});
      return {
        ok: true,
        deleted: res.count,
        message: `Deleted ${res.count} events`,
      };
    } catch (error) {
      console.error('Purge events error:', error);
      return {
        ok: false,
        deleted: 0,
        message: 'Failed to delete events',
        error: error.message,
      };
    }
  }

  async deleteByTitles(titles: string[]) {
    try {
      if (!Array.isArray(titles) || titles.length === 0) {
        return { ok: false, deleted: 0, message: 'No titles provided' };
      }
      const res = await this.prisma.event.deleteMany({
        where: { title: { in: titles } },
      });
      return { ok: true, deleted: res.count };
    } catch (error) {
      return { ok: false, deleted: 0, error: (error as Error).message };
    }
  }

  async deleteByTitlesContainsInsensitive(titles: string[]) {
    try {
      if (!Array.isArray(titles) || titles.length === 0) {
        return { ok: false, deleted: 0, message: 'No titles provided' };
      }
      const filters = titles
        .map((t) => (t || '').trim())
        .filter((t) => t.length > 0)
        .map((t) => ({ title: { contains: t, mode: 'insensitive' as const } }));
      if (!filters.length)
        return { ok: false, deleted: 0, message: 'No valid titles' };
      const res = await this.prisma.event.deleteMany({
        where: { OR: filters },
      });
      return { ok: true, deleted: res.count };
    } catch (error) {
      return { ok: false, deleted: 0, error: (error as Error).message };
    }
  }

  async countEvents() {
    return await this.prisma.event.count();
  }

  async seedSampleEvents() {
    const organizer = await this.prisma.user.upsert({
      where: {
        email_role: {
          email: 'seed@evenz.com',
          role: 'ORGANIZER',
        },
      },
      update: {},
      create: { email: 'seed@evenz.com', role: 'ORGANIZER' },
    });

    const samples = [
      {
        title: 'Community Football Match',
        description: 'Local teams clash in a friendly but competitive game.',
        startDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        city: 'Lahore',
        coverImage: 'https://picsum.photos/seed/ball/1200/600',
      },
      {
        title: 'Acoustic Night',
        description: 'Chill acoustic sessions with indie artists.',
        startDate: new Date(Date.now() + 6 * 24 * 3600 * 1000),
        city: 'New York',
        coverImage: 'https://picsum.photos/seed/acoustic/1200/600',
      },
      {
        title: 'Tech Meetup',
        description: 'Networking and lightning talks for developers.',
        startDate: new Date(Date.now() + 9 * 24 * 3600 * 1000),
        city: 'San Francisco',
        coverImage: 'https://picsum.photos/seed/meet/1200/600',
      },
    ];

    for (const s of samples) {
      await this.prisma.event.create({
        data: {
          title: s.title,
          description: s.description,
          category: 'CONFERENCE',
          startDate: s.startDate,
          city: s.city,
          coverImage: s.coverImage,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          organizerId: organizer.id,
        },
      });
    }
    return { inserted: samples.length };
  }

  // event services
  async createEventService(
    eventId: string,
    data: {
      title: string;
      description?: string;
      category: string;
      budget?: number;
      currency?: string;
      postalCode?: string;
    },
  ) {
    return await this.prisma.eventService.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category as any,
        budget: data.budget,
        currency: data.currency || 'USD',
        postalCode: data.postalCode,
        eventId: eventId,
      },
    });
  }

  async getEventServices(eventId: string) {
    return await this.prisma.eventService.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateEventService(
    serviceId: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      budget?: number;
      currency?: string;
      postalCode?: string;
      status?: string;
    },
  ) {
    return await this.prisma.eventService.update({
      where: { id: serviceId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.category && { category: data.category as any }),
        ...(data.budget !== undefined && { budget: data.budget }),
        ...(data.currency && { currency: data.currency }),
        ...(data.postalCode !== undefined && { postalCode: data.postalCode }),
        ...(data.status && { status: data.status as any }),
      },
    });
  }

  async deleteEventService(serviceId: string) {
    return await this.prisma.eventService.delete({
      where: { id: serviceId },
    });
  }

  // service bidding
  async createServiceBid(
    eventServiceId: string,
    userId: string,
    data: {
      bidAmount: number;
      currency: string;
      message: string;
      attachments?: string[];
    },
  ) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { userId: userId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeConnectEnabled: true,
      },
    });

    if (!vendor) {
      throw new Error('User is not a vendor');
    }

    // require vendor Connect before bidding
    if (!vendor.stripeAccountId || !vendor.stripeConnectEnabled) {
      throw new HttpException(
        'Please set up your Stripe Connect account before bidding. Go to Payouts & Withdrawals to complete the setup.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingBid = await this.prisma.serviceBid.findFirst({
      where: {
        eventServiceId: eventServiceId,
        vendorId: vendor.id,
      },
    });

    if (existingBid) {
      throw new Error('You have already submitted a bid for this service');
    }

    const eventService = await this.prisma.eventService.findUnique({
      where: { id: eventServiceId },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            isFlagged: true,
            organizerId: true,
            organizer: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!eventService) {
      throw new Error('Event service not found');
    }

    if (eventService.event.isFlagged) {
      throw new HttpException(
        'This event has been flagged. Bidding is not allowed on flagged events.',
        400,
      );
    }

    const bid = await this.prisma.serviceBid.create({
      data: {
        eventServiceId: eventServiceId,
        vendorId: vendor.id,
        userId: userId,
        bidAmount: data.bidAmount,
        currency: data.currency,
        message: data.message,
        attachments: data.attachments || [],
      },
      include: {
        vendor: {
          select: {
            businessName: true,
            category: true,
            averageRating: true,
            totalReviews: true,
          },
        },
      },
    });

    // notify vendor: bid submitted
    try {
      await this.prisma.notification.create({
        data: {
          userId: userId,
          title: 'Bid Submitted',
          message: `You submitted a bid of ${data.currency} ${data.bidAmount} for "${eventService?.title || 'service'}"`,
          type: 'VENDOR_PROPOSAL',
          metadata: {
            type: 'BID_SUBMITTED',
            bidId: bid.id,
            eventServiceId: eventServiceId,
            serviceTitle: eventService?.title || 'Service',
            eventTitle: eventService?.event?.title || 'Event',
            bidAmount: data.bidAmount,
            currency: data.currency,
          },
        },
      });
    } catch (error) {
      console.error('Failed to create notification for bid submission:', error);
    }

    // notify organizer: new bid
    const organizerId = eventService?.event?.organizerId;
    if (organizerId) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: organizerId,
            title: 'New Bid Received',
            message: `${bid.vendor?.businessName || 'A vendor'} placed a bid of ${data.currency} ${data.bidAmount} for "${eventService?.title || 'service'}" on ${eventService?.event?.title || 'your event'}.`,
            type: 'VENDOR_PROPOSAL',
            metadata: {
              type: 'BID_RECEIVED',
              bidId: bid.id,
              eventServiceId: eventServiceId,
              eventId: eventService?.event?.id,
              serviceTitle: eventService?.title || 'Service',
              eventTitle: eventService?.event?.title || 'Event',
              vendorName: bid.vendor?.businessName,
              bidAmount: data.bidAmount,
              currency: data.currency,
            },
          },
        });
      } catch (error) {
        console.error('Failed to create organizer notification for new bid:', error);
      }
    }

    return bid;
  }

  async getServiceBids(eventServiceId: string) {
    return await this.prisma.serviceBid.findMany({
      where: { eventServiceId },
      include: {
        vendor: {
          select: {
            businessName: true,
            category: true,
            averageRating: true,
            totalReviews: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateBidStatus(
    bidId: string,
    status: string,
    paymentIntentId?: string,
  ) {
    const bid = await this.prisma.serviceBid.findUnique({
      where: { id: bidId },
      include: {
        vendor: {
          include: {
            user: true,
          },
        },
        eventService: {
          include: {
            event: {
              include: {
                organizer: true,
              },
            },
          },
        },
      },
    });

    if (!bid) {
      throw new Error('Bid not found');
    }

    const updatedBid = await this.prisma.serviceBid.update({
      where: { id: bidId },
      data: { status: status as any },
      include: {
        vendor: {
          select: {
            businessName: true,
            category: true,
            averageRating: true,
            totalReviews: true,
          },
        },
      },
    });

    // on accept: escrow, work order, reject other bids
    if (status === 'ACCEPTED') {
      console.log('🎯 Bid accepted, creating work order...', {
        bidId,
        organizerId: bid.eventService.event.organizerId,
        vendorId: bid.vendorId,
        eventId: bid.eventService.event.id,
      });
      // escrow payment required to accept
      if (status === 'ACCEPTED' && !paymentIntentId) {
        throw new Error(
          'Payment intent ID is required when accepting a bid. Please complete payment first.',
        );
      }

      try {
        const workOrder = await this.workOrdersService.createWorkOrderFromBid(
          bidId,
          bid.eventService.event.organizerId,
          paymentIntentId,
        );
        console.log('✅ Work order created successfully:', workOrder.id);
      } catch (error) {
        console.error('❌ Failed to create work order:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        if (error instanceof HttpException) {
          throw error;
        }
        // don't block accept if work-order create fails
      }
      console.log(
        '🎉 Creating bid acceptance notification for vendor:',
        bid.vendor.userId,
      );
      console.log('🎉 Vendor business name:', bid.vendor.businessName);
      console.log('🎉 Event service title:', bid.eventService.title);

      try {
        const notification = await this.prisma.notification.create({
          data: {
            userId: bid.vendor.userId,
            title: 'Bid Accepted! 🎉',
            message: `Your bid for "${bid.eventService.title}" has been accepted by ${bid.eventService.event.organizer.firstName} ${bid.eventService.event.organizer.lastName}. Click to respond and discuss details.`,
            type: 'VENDOR_PROPOSAL',
            metadata: {
              bidId: bid.id,
              eventServiceId: bid.eventServiceId,
              eventId: bid.eventService.eventId,
              organizerName: `${bid.eventService.event.organizer.firstName} ${bid.eventService.event.organizer.lastName}`,
              eventTitle: bid.eventService.event.title,
              serviceTitle: bid.eventService.title,
              bidAmount: bid.bidAmount,
              currency: bid.currency,
            },
          },
        });
        console.log('🎉 Notification created successfully!', notification.id);
      } catch (error) {
        console.error('❌ Failed to create notification:', error);
      }

      // auto-reject other open bids
      const otherBids = await this.prisma.serviceBid.findMany({
        where: {
          eventServiceId: bid.eventServiceId,
          id: { not: bid.id },
          status: { in: ['PENDING', 'UNDER_REVIEW'] as any },
        },
        include: {
          vendor: { select: { userId: true, businessName: true } },
          eventService: {
            select: {
              title: true,
              event: { select: { id: true, title: true } },
            },
          },
        },
      });

      if (otherBids.length) {
        await this.prisma.serviceBid.updateMany({
          where: {
            eventServiceId: bid.eventServiceId,
            id: { not: bid.id },
            status: { in: ['PENDING', 'UNDER_REVIEW'] as any },
          },
          data: { status: 'REJECTED' as any },
        });

        for (const ob of otherBids) {
          try {
            await this.prisma.notification.create({
              data: {
                userId: ob.vendor.userId,
                title: 'Bid Rejected',
                message: `Your bid for "${ob.eventService.title}" was not selected.`,
                type: 'VENDOR_PROPOSAL',
                metadata: {
                  bidId: ob.id,
                  eventServiceId: ob.eventServiceId,
                  eventId: ob.eventService.event.id,
                },
              },
            });
          } catch (err) {
            console.error('❌ Failed to create rejection notification:', err);
          }
        }
      }

      // notify organizer of selection
      await this.prisma.notification.create({
        data: {
          userId: bid.eventService.event.organizerId,
          title: 'Vendor Selected! ✅',
          message: `You have selected ${bid.vendor.businessName} for "${bid.eventService.title}". The vendor has been notified and may respond soon.`,
          type: 'VENDOR_PROPOSAL',
          metadata: {
            bidId: bid.id,
            eventServiceId: bid.eventServiceId,
            eventId: bid.eventService.eventId,
            vendorName: bid.vendor.businessName,
            serviceTitle: bid.eventService.title,
            bidAmount: bid.bidAmount,
            currency: bid.currency,
          },
        },
      });
    }

    // notify rejected vendor
    if (status === 'REJECTED') {
      try {
        await this.prisma.notification.create({
          data: {
            userId: bid.vendor.userId,
            title: 'Bid Rejected',
            message: `Your bid for "${bid.eventService.title}" was rejected by the organizer.`,
            type: 'VENDOR_PROPOSAL',
            metadata: {
              bidId: bid.id,
              eventServiceId: bid.eventServiceId,
              eventId: bid.eventService.eventId,
            },
          },
        });
      } catch (error) {
        console.error(
          '❌ Failed to create explicit rejection notification:',
          error,
        );
      }
    }

    return updatedBid;
  }

  async updateBid(
    bidId: string,
    userId: string,
    data: {
      bidAmount?: number;
      currency?: string;
      message?: string;
    },
  ) {
    const bid = await this.prisma.serviceBid.findUnique({
      where: { id: bidId },
      include: {
        vendor: true,
      },
    });

    if (!bid) {
      throw new Error('Bid not found');
    }

    if (bid.userId !== userId && bid.vendor.userId !== userId) {
      throw new Error('You do not have permission to update this bid');
    }

    // only editable while open
    if (bid.status !== 'PENDING' && bid.status !== 'UNDER_REVIEW') {
      throw new Error('Cannot update bid that has been accepted or rejected');
    }

    const updateData: any = {};
    if (data.bidAmount !== undefined) {
      updateData.bidAmount = data.bidAmount;
    }
    if (data.currency !== undefined) {
      updateData.currency = data.currency;
    }
    if (data.message !== undefined) {
      updateData.message = data.message;
    }

    const updatedBid = await this.prisma.serviceBid.update({
      where: { id: bidId },
      data: updateData,
      include: {
        vendor: {
          select: {
            businessName: true,
            category: true,
            averageRating: true,
            totalReviews: true,
          },
        },
      },
    });

    return updatedBid;
  }

  async deleteServiceBid(bidId: string, userId: string) {
    const bid = await this.prisma.serviceBid.findUnique({
      where: { id: bidId },
      include: {
        vendor: true,
      },
    });

    if (!bid) {
      throw new Error('Bid not found');
    }

    if (bid.userId !== userId && bid.vendor.userId !== userId) {
      throw new Error('You do not have permission to delete this bid');
    }

    // only deletable while open
    if (bid.status !== 'PENDING' && bid.status !== 'UNDER_REVIEW') {
      throw new Error('Cannot delete bid that has been accepted or rejected');
    }

    return await this.prisma.serviceBid.delete({
      where: { id: bidId },
    });
  }

  async getVendorBids(vendorId: string) {
    return await this.prisma.serviceBid.findMany({
      where: { vendorId },
      include: {
        eventService: {
          select: {
            title: true,
            description: true,
            budget: true,
            currency: true,
            event: {
              select: {
                title: true,
                startDate: true,
                city: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // notifications
  async getUserNotifications(userId: string) {
    console.log('🔔 Fetching notifications for user:', userId);
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to last 50 notifications
    });
    console.log('🔔 Found notifications:', notifications.length);
    console.log(
      '🔔 Notification types:',
      notifications.map((n) => n.type),
    );
    console.log(
      '🔔 VENDOR_PROPOSAL notifications:',
      notifications.filter((n) => n.type === 'VENDOR_PROPOSAL'),
    );
    // backfill Work Submitted notifs that only have workOrderId
    const enriched = await Promise.all(
      notifications.map(async (n) => {
        const raw = n.metadata;
        let metaObj: Record<string, unknown>;
        if (typeof raw === 'string') {
          try {
            metaObj = (JSON.parse(raw) as Record<string, unknown>) || {};
          } catch {
            metaObj = {};
          }
        } else {
          metaObj = (raw as Record<string, unknown>) || {};
        }
        const isWorkSubmitted =
          metaObj.type === 'WORK_SUBMITTED' ||
          (n.title && String(n.title).toLowerCase().includes('work submitted'));
        const hasWorkOrderId = metaObj.workOrderId && String(metaObj.workOrderId).trim();
        const needsEnrichment =
          hasWorkOrderId &&
          !metaObj.eventServiceId &&
          !metaObj.quoteRequestId &&
          isWorkSubmitted;

        if (!needsEnrichment) return n;

        const workOrder = await this.prisma.workOrder.findUnique({
          where: { id: String(metaObj.workOrderId) },
          select: {
            quoteRequestId: true,
            serviceBid: {
              select: {
                eventServiceId: true,
                eventService: { select: { eventId: true } },
              },
            },
          },
        });
        if (!workOrder) return n;
        if (workOrder.serviceBid?.eventService) {
          return {
            ...n,
            metadata: {
              ...metaObj,
              eventServiceId: workOrder.serviceBid.eventServiceId,
              eventId: workOrder.serviceBid.eventService.eventId,
            } as any,
          };
        }
        if (workOrder.quoteRequestId) {
          return {
            ...n,
            metadata: {
              ...metaObj,
              quoteRequestId: workOrder.quoteRequestId,
            } as any,
          };
        }
        return n;
      }),
    );
    return enriched;
  }

    // resolve deep-link view URLs for notifs
  async getNotificationViewUrls(
    userId: string,
    notificationIds: string[],
  ): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    const notifications = await this.prisma.notification.findMany({
      where: { userId, id: { in: notificationIds } },
      select: { id: true, title: true, metadata: true },
    });
    for (const n of notifications) {
      const raw = n.metadata;
      let metaObj: Record<string, unknown>;
      if (typeof raw === 'string') {
        try {
          metaObj = (JSON.parse(raw) as Record<string, unknown>) || {};
        } catch {
          metaObj = {};
        }
      } else {
        metaObj = (raw as Record<string, unknown>) || {};
      }
      const isWorkSubmitted =
        metaObj.type === 'WORK_SUBMITTED' ||
        (n.title && String(n.title).toLowerCase().includes('work submitted'));
      if (!isWorkSubmitted || !metaObj.workOrderId) {
        result[n.id] = null;
        continue;
      }
      if (metaObj.eventId && metaObj.eventServiceId) {
        result[n.id] = `/profile/my-events/service/${metaObj.eventServiceId}/bids?eventId=${metaObj.eventId}`;
        continue;
      }
      if (metaObj.quoteRequestId) {
        result[n.id] = `/profile/my-events?tab=services&openQuoteRequestId=${metaObj.quoteRequestId}`;
        continue;
      }
      const workOrder = await this.prisma.workOrder.findUnique({
        where: { id: String(metaObj.workOrderId) },
        select: {
          quoteRequestId: true,
          serviceBid: {
            select: {
              eventServiceId: true,
              eventService: { select: { eventId: true } },
            },
          },
        },
      });
      if (workOrder?.serviceBid?.eventService) {
        result[n.id] = `/profile/my-events/service/${workOrder.serviceBid.eventServiceId}/bids?eventId=${workOrder.serviceBid.eventService.eventId}`;
      } else if (workOrder?.quoteRequestId) {
        result[n.id] = `/profile/my-events?tab=services&openQuoteRequestId=${workOrder.quoteRequestId}`;
      } else {
        result[n.id] = null;
      }
    }
    return result;
  }

  async markNotificationAsRead(userId: string, notificationId: string) {
    return await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId: userId,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });
  }

  async markAllNotificationsAsRead(userId: string) {
    return await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  async deleteNotification(userId: string, notificationId: string) {
    return await this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  }

  async getUnreadNotificationCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        userId: userId,
        read: false,
      },
    });
    return count;
  }

  // organizer event chat
  async getEventMessagesForUser(
    userId: string,
    eventId: string,
    vendorId: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event || event.organizerId !== userId)
      throw new Error('Unauthorized or event not found');
    return this.prisma.eventChatMessage.findMany({
      where: { eventId, vendorId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendEventMessageFromUser(
    userId: string,
    eventId: string,
    vendorId: string,
    message: string,
    attachments: string[] = [],
    messageType: 'NORMAL' | 'WORK_SUBMISSION' = 'NORMAL',
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event || event.organizerId !== userId)
      throw new Error('Unauthorized or event not found');
    return this.prisma.eventChatMessage.create({
      data: {
        eventId,
        vendorId,
        userId,
        senderId: userId,
        senderType: 'USER',
        message,
        attachments,
        messageType: messageType as any,
      },
    });
  }

  async getUserEventChatConversations(userId: string) {
    // unique (eventId, vendorId) threads
    const rows = await this.prisma.eventChatMessage.findMany({
      where: { userId },
      distinct: ['eventId', 'vendorId'],
      orderBy: { createdAt: 'desc' },
      select: {
        eventId: true,
        vendorId: true,
        createdAt: true,
      },
    });
    const events = await this.prisma.event.findMany({
      where: { id: { in: rows.map((r) => r.eventId) } },
      select: { id: true, title: true },
    });
    const vendors = await this.prisma.vendor.findMany({
      where: { id: { in: rows.map((r) => r.vendorId) } },
      select: { id: true, businessName: true },
    });
    const eventMap = new Map(events.map((e) => [e.id, e]));
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));
    return rows.map((r) => ({
      eventId: r.eventId,
      vendorId: r.vendorId,
      eventTitle: eventMap.get(r.eventId)?.title || 'Event',
      vendorName: vendorMap.get(r.vendorId)?.businessName || 'Vendor',
      lastMessageAt: r.createdAt,
    }));
  }

  private generateBookingNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `EVT-${timestamp}-${random}`;
  }

  private generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `TKT-${timestamp}-${random}`;
  }

  private generateQRCode(ticketNumber: string): string {
    // placeholder QR payload (swap for a real QR lib in prod)
    return `QR-${ticketNumber}`;
  }

  // scan ticket by QR / number
  async scanTicket(code: string) {
    const trimmed = (code || '').trim();
    if (!trimmed) {
      throw new HttpException('Ticket code is required', HttpStatus.BAD_REQUEST);
    }

    const ticket = await this.prisma.ticket.findFirst({
      where: {
        OR: [
          { qrCode: trimmed },
          { ticketNumber: trimmed },
          { id: trimmed },
        ],
      },
      include: {
        booking: {
          select: {
            id: true,
            bookingNumber: true,
            status: true,
            paymentStatus: true,
            event: {
              select: {
                id: true,
                title: true,
                startDate: true,
                endDate: true,
                address: true,
                city: true,
                zipcode: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new HttpException('Ticket not found', HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    const event = ticket.booking?.event || null;
    const eventStart = event?.startDate ? new Date(event.startDate) : null;
    const isEventInPast = eventStart ? eventStart.getTime() < now.getTime() : false;

    const isValid =
      ticket.status === 'ACTIVE' &&
      ticket.booking?.paymentStatus === 'COMPLETED' &&
      !ticket.usedAt;

    return {
      code: trimmed,
      matchedBy:
        ticket.qrCode === trimmed
          ? 'qrCode'
          : ticket.ticketNumber === trimmed
          ? 'ticketNumber'
          : 'id',
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        tier: ticket.tier,
        price: Number(ticket.price),
        currency: ticket.currency,
        usedAt: ticket.usedAt,
        createdAt: ticket.createdAt,
      },
      booking: ticket.booking
        ? {
            id: ticket.booking.id,
            bookingNumber: ticket.booking.bookingNumber,
            status: ticket.booking.status,
            paymentStatus: ticket.booking.paymentStatus,
          }
        : null,
      event: event
        ? {
            id: event.id,
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
            address: event.address,
            city: event.city,
            zipcode: (event as any).zipcode ?? null,
          }
        : null,
      isValid,
      isUsed: !!ticket.usedAt,
      isEventInPast,
    };
  }

  // create booking + Stripe PI
  async createEventBooking(
    eventId: string,
    userId: string,
    data: {
      tickets: Array<{
        tier: string;
        price: number;
        quantity: number;
      }>;
      customerEmail: string;
      customerName?: string;
    },
  ) {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
      });

      if (!event) {
        throw new Error('Event not found');
      }

      const subtotal = data.tickets.reduce(
        (sum, ticket) => sum + ticket.price * ticket.quantity,
        0,
      );
      const fees = Math.round(subtotal * 0.1); // 10% service fee
      const totalAmount = subtotal + fees;

      const bookingNumber = this.generateBookingNumber();

      const booking = await this.prisma.booking.create({
        data: {
          bookingNumber,
          totalAmount,
          currency: 'USD',
          fees: {
            subtotal,
            serviceFee: fees,
            total: totalAmount,
          },
          status: 'PENDING',
          paymentStatus: 'PENDING',
          userId,
          eventId,
        },
      });

      const ticketPromises: Promise<any>[] = [];
      for (const ticketData of data.tickets) {
        for (let i = 0; i < ticketData.quantity; i++) {
          const ticketNumber = this.generateTicketNumber();
          ticketPromises.push(
            this.prisma.ticket.create({
              data: {
                ticketNumber,
                qrCode: this.generateQRCode(ticketNumber),
                price: ticketData.price,
                currency: 'USD',
                tier: ticketData.tier,
                status: 'ACTIVE',
                bookingId: booking.id,
              },
            }),
          );
        }
      }

      const tickets = await Promise.all(ticketPromises);

      const paymentIntent = await this.stripePaymentService.createPaymentIntent(
        {
          amount: totalAmount,
          currency: 'usd',
          metadata: {
            bookingId: booking.id,
            eventId: event.id,
            userId,
            bookingNumber,
          },
          customerEmail: data.customerEmail,
        },
      );

      const updatedBooking = await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          paymentId: paymentIntent.paymentIntentId,
          paymentStatus: 'PROCESSING',
        },
        include: {
          tickets: true,
          event: {
            select: {
              id: true,
              title: true,
              startDate: true,
            },
          },
        },
      });

      return {
        booking: updatedBooking,
        paymentIntent: {
          clientSecret: paymentIntent.clientSecret,
          paymentIntentId: paymentIntent.paymentIntentId,
        },
      };
    } catch (error) {
      console.error('Error creating event booking:', error);
      throw error;
    }
  }

  // booking by id
  async getBookingById(bookingId: string, userId?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tickets: true,
        event: {
          select: {
            id: true,
            title: true,
            startDate: true,
            coverImage: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!booking) {
      console.error('❌ Booking not found with ID:', bookingId);
      // soft-fail lookup → null
      throw new Error(`Booking not found: ${bookingId}`);
    }

    if (userId && booking.userId !== userId) {
      throw new Error('Unauthorized');
    }

    return booking;
  }

  // mark booking paid after Stripe success
  async confirmBookingPayment(bookingId: string, paymentIntentId: string) {
    try {
      const paymentIntent =
        await this.stripePaymentService.getPaymentStatus(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        throw new Error(
          `Payment not succeeded. Status: ${paymentIntent.status}`,
        );
      }

      const booking = await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: 'COMPLETED',
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        },
        include: {
          tickets: true,
          event: {
            select: {
              id: true,
              title: true,
              startDate: true,
            },
          },
        },
      });

      return booking;
    } catch (error) {
      console.error('Error confirming booking payment:', error);
      throw error;
    }
  }

  // create booking only after payment succeeds
  async createEventBookingAfterPayment(
    eventId: string,
    userId: string,
    data: {
      tickets: Array<{
        tier: string;
        price: number;
        quantity: number;
      }>;
      customerEmail: string;
      paymentIntentId: string;
      customerName?: string;
    },
  ) {
    try {
      console.log('🎫 Creating booking after payment for event:', eventId);
      console.log('💰 Payment Intent ID:', data.paymentIntentId);
      console.log('👤 User ID:', userId);

      console.log('🔍 Verifying payment intent status...');
      const paymentIntent = await this.stripePaymentService.getPaymentStatus(
        data.paymentIntentId,
      );
      console.log('✅ Payment Intent Status:', paymentIntent.status);

      if (paymentIntent.status !== 'succeeded') {
        console.error(
          '❌ Payment not succeeded. Status:',
          paymentIntent.status,
        );
        throw new Error(
          `Payment not succeeded. Status: ${paymentIntent.status}`,
        );
      }

      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        include: {
          organizer: {
            select: {
              id: true,
              stripeAccountId: true,
              stripeConnectEnabled: true,
            },
          },
        },
      });

      if (!event) {
        throw new Error('Event not found');
      }

      const subtotal = data.tickets.reduce(
        (sum, ticket) => sum + ticket.price * ticket.quantity,
        0,
      );
      const fees = Math.round(subtotal * 0.1); // 10% service fee
      const totalAmount = subtotal + fees;
      const organizerEarnings = subtotal; // Organizer gets 100% of subtotal (platform keeps fees)

      const bookingNumber = this.generateBookingNumber();

      // booking already paid
      console.log(
        '💾 Creating booking in database with userId:',
        userId,
        'eventId:',
        eventId,
      );
      const booking = await this.prisma.booking.create({
        data: {
          bookingNumber,
          totalAmount,
          currency: 'USD',
          fees: {
            subtotal,
            serviceFee: fees,
            total: totalAmount,
          },
          status: 'CONFIRMED',
          paymentStatus: 'COMPLETED',
          paymentId: data.paymentIntentId,
          paymentMethod: 'card',
          confirmedAt: new Date(),
          userId,
          eventId,
        },
      });
      console.log('✅ Booking saved to database:', {
        id: booking.id,
        userId: booking.userId,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      });

      const ticketPromises: Promise<any>[] = [];
      for (const ticketData of data.tickets) {
        for (let i = 0; i < ticketData.quantity; i++) {
          const ticketNumber = this.generateTicketNumber();
          ticketPromises.push(
            this.prisma.ticket.create({
              data: {
                ticketNumber,
                qrCode: this.generateQRCode(ticketNumber),
                price: ticketData.price,
                currency: 'USD',
                tier: ticketData.tier,
                status: 'ACTIVE',
                bookingId: booking.id,
              },
            }),
          );
        }
      }

      const tickets = await Promise.all(ticketPromises);
      console.log(
        '✅ Created',
        tickets.length,
        'tickets for booking:',
        booking.id,
      );

      // record platform fee
      try {
        await this.prisma.platformFee.create({
          data: {
            sourceType: 'EVENT_BOOKING',
            sourceId: booking.id,
            subtotal: subtotal,
            feeAmount: fees, // The 10% platform fee
            totalAmount: totalAmount,
            currency: 'USD',
            paymentIntentId: data.paymentIntentId,
            status: 'AVAILABLE',
            metadata: {
              eventId: event.id,
              bookingId: booking.id,
              organizerId: event.organizer?.id,
              ticketCount: tickets.length,
            },
          },
        });
        console.log('✅ Platform fee recorded for event booking:', booking.id);
      } catch (feeError: any) {
        // fee record failure shouldn't fail booking
        console.error('❌ Failed to record platform fee:', feeError);
      }

      // destination charges → organizer Connect account
      if (
        event.organizer?.stripeAccountId &&
        event.organizer?.stripeConnectEnabled
      ) {
        console.log(
          '✅ Payment was sent directly to organizer Stripe Connect account via destination charge. No transfer needed.',
        );
      } else {
        console.log(
          'ℹ️ Organizer does not have Stripe Connect account set up. Payment went to platform account.',
        );
      }

      const completeBooking = await this.prisma.booking.findUnique({
        where: { id: booking.id },
        include: {
          tickets: true,
          event: {
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              coverImage: true,
              address: true,
              city: true,
            },
          },
        },
      });

      console.log('🎉 Booking created successfully:', {
        bookingId: completeBooking?.id,
        bookingNumber: completeBooking?.bookingNumber,
        ticketCount: completeBooking?.tickets?.length || 0,
        totalAmount: completeBooking?.totalAmount,
        status: completeBooking?.status,
        paymentStatus: completeBooking?.paymentStatus,
      });

      if (!completeBooking) {
        throw new Error('Failed to retrieve created booking');
      }

      console.log(
        '✅ Returning complete booking with',
        completeBooking.tickets.length,
        'tickets',
      );

      return {
        booking: completeBooking,
      };
    } catch (error) {
      console.error('❌ Error creating event booking after payment:', error);
      console.error(
        'Error stack:',
        error instanceof Error ? error.stack : 'No stack trace',
      );
      throw error;
    }
  }

  // user's completed ticket bookings
  async getUserEventBookings(userId: string) {
    try {
      console.log('🔍 Fetching event bookings for user:', userId);

      const allUserBookings = await this.prisma.booking.findMany({
        where: { userId },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          bookingNumber: true,
        },
      });
      console.log(
        '📋 All bookings for user (any status):',
        allUserBookings.length,
      );
      allUserBookings.forEach((b) => {
        console.log(
          `  - ${b.id}: status=${b.status}, paymentStatus=${b.paymentStatus}, number=${b.bookingNumber}`,
        );
      });

      const bookings = await this.prisma.booking.findMany({
        where: {
          userId,
          paymentStatus: 'COMPLETED',
        },
        include: {
          tickets: {
            select: {
              id: true,
              ticketNumber: true,
              qrCode: true,
              price: true,
              currency: true,
              tier: true,
              status: true,
              usedAt: true,
              createdAt: true,
            },
          },
          event: {
            select: {
              id: true,
              title: true,
              startDate: true,
              endDate: true,
              coverImage: true,
              address: true,
              city: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      console.log('✅ Found', bookings.length, 'bookings for user:', userId);
      bookings.forEach((booking, index) => {
        console.log(`  Booking ${index + 1}:`, {
          id: booking.id,
          bookingNumber: booking.bookingNumber,
          ticketCount: booking.tickets.length,
          eventTitle: booking.event?.title || 'No event',
          status: booking.status,
          paymentStatus: booking.paymentStatus,
        });
      });

      return bookings;
    } catch (error: any) {
      console.error('❌ Error in getUserEventBookings:', error);
      console.error('Error stack:', error.stack);
      console.error('Error message:', error.message);
      throw error;
    }
  }
}