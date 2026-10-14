import { Injectable, Inject, forwardRef, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { StripePaymentService } from '../payments/stripe-payment.service';
import { MailService } from '../mail/mail.service';
import { S3UploadService } from '../uploads/s3-upload.service';
import { ExternalVendorsService } from '../external-vendors/external-vendors.service';

@Injectable()
export class VendorsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WorkOrdersService))
    private workOrdersService: WorkOrdersService,
    private readonly stripePaymentService: StripePaymentService,
    private readonly mailService: MailService,
    private readonly s3UploadService: S3UploadService,
    private readonly externalVendorsService: ExternalVendorsService,
  ) {}

  // active + not admin-blocked
  private activeUnblockedVendorWhere(): Prisma.VendorWhereInput {
    return {
      isActive: true,
      user: { isBlocked: false },
    };
  }

  // marketplace cards need a real profile/service/avatar image
  private marketplaceOnboardedVendorWhere(): Prisma.VendorWhereInput {
    return {
      ...this.activeUnblockedVendorWhere(),
      OR: [
        {
          AND: [
            { profilePicture: { not: null } },
            { profilePicture: { not: '' } },
          ],
        },
        {
          user: {
            AND: [{ avatar: { not: null } }, { avatar: { not: '' } }],
          },
        },
        {
          newServices: {
            some: {
              status: 'PUBLISHED',
              media: { isEmpty: false },
            },
          },
        },
      ],
    };
  }

  // flip isActive off when the linked user was blocked first
  private async hideBlockedVendorProfiles(): Promise<void> {
    await this.prisma.vendor.updateMany({
      where: { isActive: true, user: { isBlocked: true } },
      data: { isActive: false },
    });
  }

  private async sendNotificationEmailToUser(
    userId: string,
    title: string,
    message: string,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (user?.email) {
        await this.mailService.sendNotificationEmail(user.email, title, message);
      }
    } catch {
      // non-blocking
    }
  }

  async list(limit = 3) {
    try {
      await this.hideBlockedVendorProfiles();
      const vendors = await this.prisma.vendor.findMany({
        where: this.activeUnblockedVendorWhere(),
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          businessName: true,
          city: true,
          category: true,
          averageRating: true,
          totalReviews: true,
          services: {
            select: { basePrice: true },
            take: 1,
            orderBy: { basePrice: 'asc' },
          },
        },
      });

      return vendors.map((v) => {
        const rawPrice = v.services?.[0]?.basePrice as any;
        const minPrice =
          typeof rawPrice === 'object' && rawPrice !== null
            ? Number(rawPrice)
            : (rawPrice as number | undefined);
        return {
          id: v.id,
          title: v.businessName,
          city: v.city,
          rating: Number(v.averageRating || 0),
          reviews: v.totalReviews || 0,
          category: v.category,
          price:
            typeof minPrice === 'number'
              ? Math.round(Number(minPrice))
              : undefined,
          image: this.categoryImage(v.category),
        };
      });
    } catch (error) {
      console.error('Failed to list vendors:', error);
      return [] as any[];
    }
  }

  // —— onboarding draft ——
  async getOnboarding(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, onboardingStatus: true },
    });
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    return {
      role: user?.role,
      onboardingStatus: user?.onboardingStatus,
      vendor,
    };
  }

  async saveBusiness(userId: string, body: any) {
    const { businessName, category, email, phone, city, description } =
      body || {};
    // flip role to VENDOR and mark onboarding in progress
    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { role: 'VENDOR', onboardingStatus: 'IN_PROGRESS' },
      });
    } catch (error: any) {
      // email unique clash — still move status forward without forcing role
      if (error?.code === 'P2002') {
        user = await this.prisma.user.update({
          where: { id: userId },
          data: { onboardingStatus: 'IN_PROGRESS' },
        });
      } else {
        throw error;
      }
    }
    const vendor = await this.prisma.vendor.upsert({
      where: { userId },
      update: { businessName, category, email, phone, city, description },
      create: {
        userId,
        businessName: businessName || 'Unnamed Business',
        category: category || 'OTHER',
        email: email || '',
        phone,
        city,
        description,
        kycStatus: 'PENDING',
      },
    });
    return {
      user: { role: user.role, onboardingStatus: user.onboardingStatus },
      vendor,
    };
  }

  async saveDocs(userId: string, body: any) {
    const { documents, notes } = body || {};
    const vendor = await this.prisma.vendor.update({
      where: { userId },
      data: { documents, notes },
    });
    return { vendor };
  }

  async verifyGoogle(userId: string, body: any) {
    const { googleBusinessUrl } = body || {};
    let status: 'PENDING' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' =
      'PENDING';
    try {
      const url = new URL(googleBusinessUrl);
      if (!/^(https?:)\/\//i.test(url.href)) throw new Error('Invalid');
      status = 'PENDING_REVIEW';
    } catch {
      status = 'REJECTED';
    }
    const vendor = await this.prisma.vendor.update({
      where: { userId },
      data: { googleBusinessUrl, googleVerificationStatus: status as any },
    });
    return { vendor };
  }

  async submitOnboarding(userId: string) {
    // mark COMPLETED (and VENDOR) when they finish the flow
    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { onboardingStatus: 'COMPLETED', role: 'VENDOR' },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        user = await this.prisma.user.update({
          where: { id: userId },
          data: { onboardingStatus: 'COMPLETED' },
        });
      } else {
        throw error;
      }
    }
    return {
      user: { role: user.role, onboardingStatus: user.onboardingStatus },
    };
  }

  // vendor services
  async myServices(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) return [];
    return this.prisma.service.findMany({
      where: { vendorId: vendor.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createService(userId: string, body: any) {
    try {
      console.log('Creating service for userId:', userId);
      console.log('Request body:', JSON.stringify(body, null, 2));

      const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
      if (!vendor) {
        console.error('Vendor not found for userId:', userId);
        throw new Error('Vendor not found');
      }

      console.log('Found vendor:', vendor.id, vendor.businessName);

      const {
        name,
        description,
        category,
        packages,
        media,
        availability,
        status,
      } = body || {};

      // normalize media to an array
      const mediaArray = Array.isArray(media) ? media : [];

      console.log('Creating service with data:', {
        vendorId: vendor.id,
        name,
        description,
        category,
        packages: JSON.stringify(packages),
        media: mediaArray,
        availability,
        status,
      });

      const service = await this.prisma.service.create({
        data: {
          vendorId: vendor.id,
          name,
          description,
          category,
          packages,
          media: mediaArray,
          availability,
          status,
        },
      });

      console.log('Service created successfully:', service.id);

      // notify on service create
      const pkgCreatedTitle = 'Package Created';
      const pkgCreatedMessage = `Package "${name}" was created successfully`;
      try {
        await this.prisma.notification.create({
          data: {
            userId: userId,
            title: pkgCreatedTitle,
            message: pkgCreatedMessage,
            type: 'VENDOR_PROPOSAL',
            metadata: {
              type: 'PACKAGE_CREATED',
              serviceId: service.id,
              serviceName: name,
            },
          },
        });
        this.sendNotificationEmailToUser(userId, pkgCreatedTitle, pkgCreatedMessage);
      } catch (error) {
        console.error(
          'Failed to create notification for service creation:',
          error,
        );
        // keep going if notify fails
      }

      return service;
    } catch (error) {
      console.error('Error creating service:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  async updateService(userId: string, id: string, body: any) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new Error('Vendor not found');
    const svc = await this.prisma.service.findUnique({ where: { id } });
    if (!svc || svc.vendorId !== vendor.id) throw new Error('Not found');
    const {
      name,
      description,
      category,
      packages,
      media,
      availability,
      status,
    } = body || {};
    return this.prisma.service.update({
      where: { id },
      data: {
        name,
        description,
        category,
        packages,
        media,
        availability,
        status,
      },
    });
  }

  async deleteService(userId: string, id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new Error('Vendor not found');
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service || service.vendorId !== vendor.id)
      throw new Error('Service not found');

    const serviceName = service.name;

    // notify before deleting the service
    const pkgDeletedTitle = 'Package Deleted';
    const pkgDeletedMessage = `Package "${serviceName}" was deleted`;
    try {
      await this.prisma.notification.create({
        data: {
          userId: userId,
          title: pkgDeletedTitle,
          message: pkgDeletedMessage,
          type: 'VENDOR_PROPOSAL',
          metadata: {
            type: 'PACKAGE_DELETED',
            serviceId: service.id,
            serviceName: serviceName,
          },
        },
      });
      this.sendNotificationEmailToUser(userId, pkgDeletedTitle, pkgDeletedMessage);
    } catch (error) {
      console.error(
        'Failed to create notification for service deletion:',
        error,
      );
      // keep going if notify fails
    }

    return this.prisma.service.delete({ where: { id } });
  }

  async getServicePublic(id: string) {
    return this.prisma.service.findUnique({
      where: { id },
      include: { vendor: true, reviews: true },
    });
  }

  // booking requests
  async myRequests(userId: string, status?: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) return [];
    return this.prisma.bookingRequest.findMany({
      where: {
        service: { vendorId: vendor.id },
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        notes: true,
        customerName: true,
        customerEmail: true,
        amount: true,
        date: true,
        createdAt: true,
        updatedAt: true,
        service: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });
  }

  // quote requests
  async myQuoteRequests(userId: string, status?: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) return [];
    return this.prisma.quoteRequest.findMany({
      where: {
        vendorId: vendor.id,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        additionalDetails: true,
        fullName: true,
        email: true,
        eventType: true,
        eventDate: true,
        eventLocation: true,
        numberOfGuests: true,
        budgetRange: true,
        quotePrice: true,
        quoteMessage: true,
        // include escrow fields
        finalPrice: true,
        deliveryTime: true,
        finalPriceDescription: true,
        finalPriceConfirmed: true,
        finalPriceConfirmedAt: true,
        escrowLockedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

    // onboarded + claimed OSM quotes in one list shape
  async myQuoteRequestsIncludingExternal(userId: string, status?: string) {
    await this.externalVendorsService.ensureConvertedForVendor(userId);
    const regular = await this.myQuoteRequests(userId, status);
    const externalClaimed = await this.prisma.externalVendor.findMany({
      where: { claimedByUserId: userId },
      select: { id: true },
    });
    const externalIds = externalClaimed.map((e) => e.id);
    if (externalIds.length === 0) return regular;
    const raw = await this.prisma.externalQuoteRequest.findMany({
      where: {
        externalVendorId: { in: externalIds },
        quoteRequestId: null,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    const externalMapped = raw.map((r) => ({
      id: r.id,
      isExternal: true,
      status: r.status,
      fullName: r.fullName,
      email: r.email,
      eventType: r.eventType,
      eventDate: r.eventDate,
      eventLocation: r.eventLocation,
      numberOfGuests: r.numberOfGuests,
      budgetRange: r.budgetRange,
      additionalDetails: r.additionalDetails,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      quotePrice: null,
      quoteMessage: null,
      finalPrice: null,
      deliveryTime: null,
      finalPriceConfirmed: null,
      finalPriceConfirmedAt: null,
      escrowLockedAt: null,
      finalPriceDescription: null,
      user: null,
    }));
    return [...regular, ...externalMapped];
  }

  // bookings + quotes in one list
  async getAllRequests(userId: string, status?: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) return { bookingRequests: [], quoteRequests: [] };

    await this.externalVendorsService.ensureConvertedForVendor(userId);
    const [bookingRequests, quoteRequests] = await Promise.all([
      this.myRequests(userId, status),
      this.myQuoteRequests(userId, status),
    ]);

    const externalClaimed = await this.prisma.externalVendor.findMany({
      where: { claimedByUserId: userId },
      select: { id: true },
    });
    const externalIds = externalClaimed.map((e) => e.id);
    let externalQuoteRequests: any[] = [];
    if (externalIds.length > 0) {
      const raw = await this.prisma.externalQuoteRequest.findMany({
        where: {
          externalVendorId: { in: externalIds },
          quoteRequestId: null,
          ...(status ? { status: status as any } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      externalQuoteRequests = raw.map((r) => ({
        id: r.id,
        isExternal: true,
        status: r.status,
        fullName: r.fullName,
        email: r.email,
        eventType: r.eventType,
        eventDate: r.eventDate,
        eventLocation: r.eventLocation,
        numberOfGuests: r.numberOfGuests,
        budgetRange: r.budgetRange,
        additionalDetails: r.additionalDetails,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        quotePrice: null,
        quoteMessage: null,
        finalPrice: null,
        deliveryTime: null,
        finalPriceConfirmed: null,
        finalPriceConfirmedAt: null,
        escrowLockedAt: null,
        finalPriceDescription: null,
        user: null,
      }));
    }

    return {
      bookingRequests,
      quoteRequests: [...quoteRequests, ...externalQuoteRequests],
    };
  }

  // event services near this vendor
  async getMatchingEventServices(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor || !vendor.postalCode) {
      return [];
    }

    const allEventServices = await this.prisma.eventService.findMany({
      where: {
        postalCode: vendor.postalCode,
        OR: [
          { status: 'ACTIVE' },
          {
            AND: [
              { status: 'CANCELLED' },
              {
                bids: {
                  some: {
                    vendorId: vendor.id,
                  },
                },
              },
            ],
          },
        ],
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startDate: true,
            city: true,
            isFlagged: true,
            flagReason: true,
            flaggedAt: true,
            organizer: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        bids: {
          where: {
            vendorId: vendor.id,
          },
          select: {
            id: true,
            bidAmount: true,
            currency: true,
            message: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(
      `[VendorsService] Found ${allEventServices.length} event services for vendor ${vendor.id} (postalCode: ${vendor.postalCode})`,
    );
    allEventServices.forEach((service, idx) => {
      console.log(
        `[VendorsService] Service ${idx + 1}: id=${service.id}, status=${service.status}, event.isFlagged=${service.event?.isFlagged}, eventId=${service.eventId}, hasBids=${service.bids?.length > 0}`,
      );
    });

    return allEventServices;
  }

  // dashboard counts in one go
  async getDashboardStats(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: {
        id: true,
        documents: true,
        averageRating: true,
        totalReviews: true,
        totalBids: true,
        completedJobs: true,
        user: {
          select: {
            onboardingStatus: true,
          },
        },
        _count: {
          select: {
            services: true,
            quoteRequests: true,
          },
        },
      },
    });

    if (!vendor) {
      return {
        services: 0,
        requests: 0,
        quoteRequests: 0,
        pendingDocs: 0,
        averageRating: 0,
        totalReviews: 0,
        totalBids: 0,
        completedJobs: 0,
        winRate: 0,
        monthlyRevenue: 0,
      };
    }

    // count booking requests
    const bookingRequestsCount = await this.prisma.bookingRequest.count({
      where: {
        service: {
          vendorId: vendor.id,
        },
      },
    });

    // count published services
    const publishedServicesCount = await this.prisma.service.count({
      where: {
        vendorId: vendor.id,
        status: 'PUBLISHED',
      },
    });

    // count pending docs
    let pendingDocs = 0;
    if (
      vendor.user.onboardingStatus === 'IN_PROGRESS' ||
      vendor.user.onboardingStatus === 'NONE'
    ) {
      if (!vendor.documents || Object.keys(vendor.documents).length === 0) {
        pendingDocs = 1;
      }
    }

    // win rate from accepted bids/quotes
    const acceptedBidsCount = await this.prisma.serviceBid.count({
      where: {
        vendorId: vendor.id,
        status: 'ACCEPTED',
      },
    });

    // count accepted quotes
    const acceptedQuotesCount = await this.prisma.quoteRequest.count({
      where: {
        vendorId: vendor.id,
        OR: [{ status: 'ACCEPTED' }, { escrowLockedAt: { not: null } }],
      },
    });

    // win rate = completed jobs / total bids
    const winRate =
      vendor.totalBids > 0
        ? (vendor.completedJobs / vendor.totalBids) * 100
        : 0;

    // monthly revenue from paid completed work
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const completedWorkOrders = await this.prisma.workOrder.findMany({
      where: {
        vendorId: vendor.id,
        status: 'COMPLETED',
        paymentStatus: 'COMPLETED',
        completedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      include: {
        serviceBid: {
          select: {
            bidAmount: true,
            currency: true,
          },
        },
        quoteRequest: {
          select: {
            finalPrice: true,
            quotePrice: true,
            counterOfferPrice: true,
          },
        },
      },
    });

    let monthlyRevenue = 0;
    for (const workOrder of completedWorkOrders) {
      if (workOrder.serviceBid) {
        // Revenue from service bid
        monthlyRevenue += Number(workOrder.serviceBid.bidAmount || 0);
      } else if (workOrder.quoteRequest) {
        // Revenue from quote request - prioritize finalPrice, then counterOfferPrice, then quotePrice
        const amount =
          workOrder.quoteRequest.finalPrice ||
          workOrder.quoteRequest.counterOfferPrice ||
          workOrder.quoteRequest.quotePrice;
        monthlyRevenue += Number(amount || 0);
      }
    }

    const externalQuoteCount = await this.prisma.externalQuoteRequest.count({
      where: {
        externalVendor: { claimedByUserId: userId },
        quoteRequestId: null,
      },
    });

    return {
      services: publishedServicesCount,
      requests: bookingRequestsCount,
      quoteRequests: vendor._count.quoteRequests + externalQuoteCount,
      pendingDocs,
      averageRating: Number(vendor.averageRating || 0),
      totalReviews: vendor.totalReviews || 0,
      totalBids: vendor.totalBids || 0,
      completedJobs: vendor.completedJobs || 0,
      winRate: Number(winRate.toFixed(1)),
      monthlyRevenue: Number(monthlyRevenue.toFixed(2)),
    };
  }

  // Vendor notification methods
  async getVendorNotifications(userId: string) {
    console.log('🔔 Vendor: Fetching notifications for user:', userId);
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to last 50 notifications
    });
    console.log('🔔 Vendor: Found notifications:', notifications.length);
    console.log(
      '🔔 Vendor: Notification types:',
      notifications.map((n) => n.type),
    );
    console.log(
      '🔔 Vendor: VENDOR_PROPOSAL notifications:',
      notifications.filter((n) => n.type === 'VENDOR_PROPOSAL'),
    );
    return notifications;
  }

  async getVendorUnreadCount(userId: string) {
    // Removed verbose logging - this endpoint is polled frequently by multiple components
    const count = await this.prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });
    return count;
  }

  async markVendorNotificationAsRead(userId: string, notificationId: string) {
    console.log(
      '🔔 Vendor: Marking notification as read:',
      notificationId,
      'for user:',
      userId,
    );
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

  async deleteVendorNotification(userId: string, notificationId: string) {
    return await this.prisma.notification.deleteMany({
      where: {
        id: notificationId,
        userId: userId,
      },
    });
  }

  async setRequestStatus(
    userId: string,
    id: string,
    status: 'ACCEPTED' | 'REJECTED',
  ) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new Error('Vendor not found');
    const req = await this.prisma.bookingRequest.findUnique({
      where: { id },
      include: { service: true },
    });
    if (!req || req.service.vendorId !== vendor.id)
      throw new Error('Not found');
    return this.prisma.bookingRequest.update({
      where: { id },
      data: { status },
    });
  }

  // Quote request status updates
  async setQuoteRequestStatus(
    userId: string,
    id: string,
    status: 'CONTACTED' | 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
  ) {
    const vendor = await this.prisma.vendor.findUnique({ 
      where: { userId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeConnectEnabled: true,
        businessName: true,
      },
    });
    if (!vendor) throw new Error('Vendor not found');

    // quoting requires Stripe Connect to be ready
    if (status === 'QUOTED' && (!vendor.stripeAccountId || !vendor.stripeConnectEnabled)) {
      throw new HttpException(
        'Please set up your Stripe Connect account before submitting quotes. Go to Payouts & Withdrawals to complete the setup.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const req = await this.prisma.quoteRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (!req || req.vendorId !== vendor.id)
      throw new Error('Quote request not found');

    const updated = await this.prisma.quoteRequest.update({
      where: { id },
      data: { status },
    });

    // If accepted, create work order and send email
    if (status === 'ACCEPTED' && req.userId) {
      console.log('🎯 Quote accepted by vendor, creating work order...', {
        quoteRequestId: id,
        organizerId: req.userId,
        vendorId: req.vendorId,
      });
      try {
        const workOrder = await this.workOrdersService.createWorkOrderFromQuote(
          id,
          req.userId,
        );
        console.log('✅ Work order created successfully:', workOrder.id);
      } catch (error) {
        console.error('❌ Failed to create work order:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        // work order create failure should not block accept
      }

      // send email notification to user
      try {
        const userEmail = req.user?.email || req.email;
        if (userEmail) {
          const quoteAmount = req.finalPrice
            ? Number(req.finalPrice)
            : req.quotePrice
              ? Number(req.quotePrice)
              : 0;
          const userName =
            req.user?.firstName && req.user?.lastName
              ? `${req.user.firstName} ${req.user.lastName}`
              : req.user?.firstName ||
                req.user?.lastName ||
                req.fullName ||
                'Customer';

          await this.mailService.sendQuoteAcceptedEmail(
            userEmail,
            userName,
            vendor.businessName || 'Vendor',
            req.eventType || 'Event',
            quoteAmount,
            'USD',
            req.eventDate
              ? new Date(req.eventDate).toLocaleDateString()
              : undefined,
            req.eventLocation || undefined,
          );
        }
      } catch (error) {
        console.error('Failed to send quote accepted email:', error);
        // email failure should not block
      }
    }

    return updated;
  }

  // delete quote request
  async deleteQuoteRequest(userId: string, id: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new Error('Vendor not found');
    const req = await this.prisma.quoteRequest.findUnique({ where: { id } });
    if (!req || req.vendorId !== vendor.id)
      throw new Error('Quote request not found');

    // if a work order exists for this quote request, we must NOT delete it
    const existingWorkOrder = await this.prisma.workOrder.findFirst({
      where: { quoteRequestId: id },
      select: { id: true, status: true, paymentStatus: true },
    });

    if (existingWorkOrder) {
      throw new Error(
        'This quote is linked to a completed job and payment, so it cannot be deleted. The history must remain for accounting.',
      );
    }

    // Safe to delete when no work order exists
    await this.prisma.quoteMessage.deleteMany({
      where: { quoteRequestId: id },
    });
    return this.prisma.quoteRequest.delete({ where: { id } });
  }

  // Profile management
  async getProfile(userId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: {
          id: true,
          businessName: true,
          description: true,
          category: true,
          email: true,
          phone: true,
          city: true,
          postalCode: true,
          portfolio: true,
          profilePicture: true,
          createdAt: true,
          updatedAt: true,
          averageRating: true,
          totalReviews: true,
          totalBids: true,
          completedJobs: true,
        },
      });

      if (!vendor) {
        throw new Error('Vendor profile not found');
      }

      return {
        vendor: {
          ...vendor,
          averageRating: Number(vendor.averageRating || 0),
        },
      };
    } catch (error) {
      console.error('Failed to get vendor profile:', error);
      throw error;
    }
  }

  async updatePostalCode(userId: string, postalCode: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
      });

      if (!vendor) {
        throw new Error('Vendor profile not found');
      }

      const updated = await this.prisma.vendor.update({
        where: { userId },
        data: { postalCode },
      });

      return { vendor: updated };
    } catch (error) {
      console.error('Failed to update postal code:', error);
      throw error;
    }
  }

  async uploadPortfolio(userId: string, body: any) {
    try {
      const { url } = body; // Now receives S3 URL from uploads controller

      if (!url) {
        throw new Error('URL is required');
      }

      // Validate URL is an S3 URL
      if (!url.includes('amazonaws.com')) {
        throw new Error('Invalid file URL');
      }

      // get current vendor
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: { portfolio: true },
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // Add new S3 URL to portfolio array
      const updatedPortfolio = [...(vendor.portfolio || []), url];

      // update vendor with new portfolio
      const updatedVendor = await this.prisma.vendor.update({
        where: { userId },
        data: { portfolio: updatedPortfolio },
        select: { portfolio: true },
      });

      return { portfolio: updatedVendor.portfolio };
    } catch (error) {
      console.error('Failed to upload portfolio:', error);
      throw error;
    }
  }

  async removePortfolio(userId: string, url: string) {
    try {
      // get current vendor
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: { portfolio: true },
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // Remove URL from portfolio array
      const updatedPortfolio = (vendor.portfolio || []).filter(
        (fileUrl) => fileUrl !== url,
      );

      // update vendor
      const updatedVendor = await this.prisma.vendor.update({
        where: { userId },
        data: { portfolio: updatedPortfolio },
        select: { portfolio: true },
      });

      // delete file from S3
      try {
        await this.s3UploadService.deleteFile(url);
        console.log('✅ Portfolio file deleted from S3:', url);
      } catch (error) {
        console.error('⚠️ Failed to delete file from S3:', error);
        // Don't throw - file is already removed from database
      }

      return { portfolio: updatedVendor.portfolio };
    } catch (error) {
      console.error('Failed to remove portfolio file:', error);
      throw error;
    }
  }

  // Portfolio Projects
  async getPortfolioProjects(userId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      const projects = await this.prisma.portfolioProject.findMany({
        where: { vendorId: vendor.id },
        orderBy: { createdAt: 'desc' },
      });

      return { projects };
    } catch (error) {
      console.error('Failed to get portfolio projects:', error);
      throw error;
    }
  }

  async createPortfolioProject(userId: string, body: any) {
    try {
      const { title, description, category, images } = body;

      if (
        !title ||
        !description ||
        !category ||
        !images ||
        images.length === 0
      ) {
        throw new Error('All fields are required');
      }

      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      const project = await this.prisma.portfolioProject.create({
        data: {
          title,
          description,
          category,
          images,
          vendorId: vendor.id,
        },
      });

      return { project };
    } catch (error) {
      console.error('Failed to create portfolio project:', error);
      throw error;
    }
  }

  async deletePortfolioProject(userId: string, projectId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      const project = await this.prisma.portfolioProject.findFirst({
        where: {
          id: projectId,
          vendorId: vendor.id,
        },
      });

      if (!project) {
        throw new Error('Project not found');
      }

      // delete files from S3
      for (const imageUrl of project.images) {
        if (imageUrl && imageUrl.includes('amazonaws.com')) {
          try {
            await this.s3UploadService.deleteFile(imageUrl);
            console.log('✅ Portfolio project image deleted from S3:', imageUrl);
          } catch (error) {
            console.error('⚠️ Failed to delete image from S3:', imageUrl, error);
            // Continue deleting other images
          }
        }
      }

      await this.prisma.portfolioProject.delete({
        where: { id: projectId },
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to delete portfolio project:', error);
      throw error;
    }
  }

  async getPricing(userId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: { pricingPackages: true },
      });

      return vendor?.pricingPackages || [];
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
      return [];
    }
  }

  async savePricing(userId: string, pricingPackages: any) {
    try {
      await this.prisma.vendor.update({
        where: { userId },
        data: { pricingPackages },
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to save pricing:', error);
      throw error;
    }
  }

  async getMarketplaceVendors(page = 1, limit = 200) {
    try {
      await this.hideBlockedVendorProfiles();
      const safePage = Math.max(1, Number(page) || 1);
      const safeLimit = Math.min(500, Math.max(1, Number(limit) || 60));
      const offset = (safePage - 1) * safeLimit;

      const [totalOnboarded, totalExternal] = await Promise.all([
        this.prisma.vendor.count({ where: this.marketplaceOnboardedVendorWhere() }),
        this.prisma.externalVendor.count({
          where: this.externalVendorsService.marketplaceExternalWhere(false),
        }),
      ]);
      const total = totalOnboarded + totalExternal;

      if (total === 0) {
        return { vendors: [], total: 0, totalOnboarded: 0, totalExternal: 0, page: safePage, limit: safeLimit };
      }
      if (offset >= total) {
        return { vendors: [], total, totalOnboarded, totalExternal, page: safePage, limit: safeLimit };
      }

      const onboardedSkip = Math.min(offset, totalOnboarded);
      const onboardedTake = Math.min(safeLimit, totalOnboarded - onboardedSkip);
      const externalSkip = offset > totalOnboarded ? offset - totalOnboarded : 0;
      const externalTake = safeLimit - onboardedTake;

      const onboardedVendors =
        onboardedTake > 0
          ? await this.prisma.vendor.findMany({
              where: this.marketplaceOnboardedVendorWhere(),
              skip: onboardedSkip,
              take: onboardedTake,
              select: {
                id: true,
                businessName: true,
                description: true,
                category: true,
                city: true,
                averageRating: true,
                totalReviews: true,
                profilePicture: true,
                aiTags: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                    avatar: true,
                    isBlocked: true,
                  },
                },
                newServices: {
                  where: { status: 'PUBLISHED' },
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    category: true,
                    media: true,
                    packages: true,
                    status: true,
                  },
                  take: 50,
                  orderBy: { createdAt: 'desc' },
                },
              },
              orderBy: { createdAt: 'desc' },
            })
          : [];

      const onboardedMapped = onboardedVendors
        .map((vendor) => {
        let serviceImage: string | null = null;
        if (
          vendor.newServices.length > 0 &&
          vendor.newServices[0].media &&
          Array.isArray(vendor.newServices[0].media) &&
          vendor.newServices[0].media.length > 0
        ) {
          serviceImage = vendor.newServices[0].media[0];
        }
        return {
          id: vendor.id,
          firstName: vendor.user?.firstName || '',
          lastName: vendor.user?.lastName || '',
          email: vendor.user?.email || '',
          businessName: vendor.businessName,
          description: vendor.description || '',
          category: vendor.category,
          profileImage:
            vendor.profilePicture || serviceImage || vendor.user?.avatar || null,
          city: vendor.city || '',
          rating: Number(vendor.averageRating || 0),
          reviews: vendor.totalReviews || 0,
          aiTags: vendor.aiTags || [],
          isBlocked: vendor.user?.isBlocked === true,
          services: vendor.newServices.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            category: s.category,
            media: s.media,
            packages: s.packages,
          })),
        };
      })
        .filter((v) => Boolean(v.profileImage));

      let externalList: any[] = [];
      if (externalTake > 0) {
        const ext = await this.externalVendorsService.listForMarketplacePaginated(externalSkip, externalTake);
        externalList = ext.list;
      }

      const vendors = [...onboardedMapped, ...externalList].filter(
        (v) => !v.isBlocked,
      );
      return {
        vendors,
        total,
        totalOnboarded,
        totalExternal,
        page: safePage,
        limit: safeLimit,
      };
    } catch (error) {
      console.error('❌ Failed to fetch marketplace vendors:', error);
      return { vendors: [], total: 0, totalOnboarded: 0, totalExternal: 0, page: 1, limit: 60 };
    }
  }

    // get vendors featured on homepage (max 5). Same shape as marketplace for cards
  async getFeaturedVendors() {
    try {
      await this.hideBlockedVendorProfiles();
      const vendors = await this.prisma.vendor.findMany({
        where: {
          ...this.activeUnblockedVendorWhere(),
          featuredOnHomepage: true,
        },
        select: {
          id: true,
          businessName: true,
          description: true,
          category: true,
          city: true,
          averageRating: true,
          totalReviews: true,
          profilePicture: true,
          aiTags: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              isBlocked: true,
            },
          },
          newServices: {
            where: { status: 'PUBLISHED' },
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              media: true,
              packages: true,
              status: true,
            },
            take: 50,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });

      return vendors
        .map((vendor) => {
        let serviceImage: string | null = null;
        if (
          vendor.newServices.length > 0 &&
          vendor.newServices[0].media &&
          Array.isArray(vendor.newServices[0].media) &&
          vendor.newServices[0].media.length > 0
        ) {
          serviceImage = vendor.newServices[0].media[0];
        }
        return {
          id: vendor.id,
          firstName: vendor.user?.firstName || '',
          lastName: vendor.user?.lastName || '',
          email: vendor.user?.email || '',
          businessName: vendor.businessName,
          description: vendor.description || '',
          category: vendor.category,
          profileImage:
            vendor.profilePicture ||
            serviceImage ||
            vendor.user?.avatar ||
            null,
          city: vendor.city || '',
          rating: Number(vendor.averageRating || 0),
          reviews: vendor.totalReviews || 0,
          aiTags: vendor.aiTags || [],
          isBlocked: vendor.user?.isBlocked === true,
          services: vendor.newServices.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            category: s.category,
            media: s.media,
            packages: s.packages,
          })),
        };
      })
        .filter((v) => !v.isBlocked);
    } catch (error) {
      console.error('❌ Failed to fetch featured vendors:', error);
      return [];
    }
  }

    // toggle homepage feature for a vendor. Max 5 featured
  async toggleHomepageFeature(vendorId: string, featured: boolean): Promise<any> {
    if (featured) {
      const featuredCount = await this.prisma.vendor.count({
        where: { featuredOnHomepage: true },
      });
      if (featuredCount >= 5) {
        throw new HttpException(
          'Maximum of 5 vendors can be featured on homepage. Please remove one first.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    return this.prisma.vendor.update({
      where: { id: vendorId },
      data: { featuredOnHomepage: featured },
      select: {
        id: true,
        businessName: true,
        featuredOnHomepage: true,
      },
    });
  }

  async getPublicVendor(vendorId: string) {
    try {
      console.log(`🔍 Fetching public vendor data for: ${vendorId}`);

      const vendor = await this.prisma.vendor.findFirst({
        where: {
          id: vendorId,
          ...this.activeUnblockedVendorWhere(),
        },
        select: {
          id: true,
          businessName: true,
          description: true,
          category: true,
          email: true,
          phone: true,
          city: true,
          averageRating: true,
          totalReviews: true,
          totalBids: true,
          completedJobs: true,
          profilePicture: true,
          pricingPackages: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          },
          portfolioProjects: {
            select: {
              id: true,
              title: true,
              description: true,
              category: true,
              images: true,
            },
          },
          newServices: {
            where: {
              status: 'PUBLISHED',
            },
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              media: true,
              packages: true,
            },
          },
        },
      });

      if (!vendor) {
        console.log('❌ Vendor not found or inactive');
        return null;
      }

      console.log(`✅ Found vendor: ${vendor.businessName}`);
      console.log(`🔍 Vendor profile picture: ${vendor.profilePicture}`);

      // Calculate win rate
      const winRate =
        vendor.totalBids > 0
          ? (vendor.completedJobs / vendor.totalBids) * 100
          : 0;

      const result = {
        id: vendor.id,
        businessName: vendor.businessName,
        description: vendor.description || '',
        category: vendor.category,
        email: vendor.email,
        phone: vendor.phone || '',
        city: vendor.city || '',
        averageRating: Number(vendor.averageRating || 0),
        totalReviews: vendor.totalReviews || 0,
        totalBids: vendor.totalBids || 0,
        completedJobs: vendor.completedJobs || 0,
        winRate: Number(winRate.toFixed(1)),
        profilePicture: vendor.profilePicture || null,
        user: {
          firstName: vendor.user?.firstName || '',
          lastName: vendor.user?.lastName || '',
          avatar: vendor.user?.avatar || null,
        },
        portfolioProjects: vendor.portfolioProjects || [],
        pricingPackages: vendor.pricingPackages || [],
        services: vendor.newServices || [],
      };

      return result;
    } catch (error) {
      console.error('❌ Failed to fetch public vendor:', error);
      return null;
    }
  }

  async getVendorServices(vendorId: string) {
    try {
      console.log(`🔍 Fetching services for vendor: ${vendorId}`);

      const services = await this.prisma.service.findMany({
        where: {
          vendorId: vendorId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          media: true,
          packages: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      console.log(`✅ Found ${services.length} services for vendor`);
      return services;
    } catch (error) {
      console.error('❌ Failed to fetch vendor services:', error);
      return [];
    }
  }

  async getVendorService(serviceId: string, vendorId: string) {
    try {
      console.log(`🔍 Fetching service ${serviceId} for vendor: ${vendorId}`);

      const service = await this.prisma.service.findFirst({
        where: {
          id: serviceId,
          vendorId: vendorId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          media: true,
          packages: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!service) {
        console.log('❌ Service not found or not owned by vendor');
        return null;
      }

      console.log(`✅ Found service: ${service.name}`);
      return service;
    } catch (error) {
      console.error('❌ Failed to fetch vendor service:', error);
      return null;
    }
  }

  async getPublicService(vendorId: string, serviceId: string) {
    try {
      console.log(
        `🔍 Fetching public service ${serviceId} for vendor: ${vendorId}`,
      );

      // First get the vendor to ensure they're active
      const vendor = await this.prisma.vendor.findFirst({
        where: {
          id: vendorId,
          ...this.activeUnblockedVendorWhere(),
        },
        select: {
          id: true,
          businessName: true,
          description: true,
          category: true,
          email: true,
          phone: true,
          city: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      });

      if (!vendor) {
        console.log('❌ Vendor not found or inactive');
        return null;
      }

      // get the service
      const service = await this.prisma.service.findFirst({
        where: {
          id: serviceId,
          vendorId: vendorId,
          status: 'PUBLISHED',
        },
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          media: true,
          packages: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!service) {
        console.log('❌ Service not found or not published');
        return null;
      }

      console.log(`✅ Found public service: ${service.name}`);
      return {
        service,
        vendor,
      };
    } catch (error) {
      console.error('❌ Failed to fetch public service:', error);
      return null;
    }
  }

  private categoryImage(category: string) {
    switch (category) {
      case 'MUSIC_DJ':
        return 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80';
      case 'CATERING':
        return 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80';
      case 'FLOWERS':
        return 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80';
      default:
        return 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&h=600&q=80';
    }
  }

  // Respond to quote request with detailed quote
  async respondToQuoteRequest(
    userId: string,
    quoteId: string,
    data: {
      quotePrice: number;
      quoteMessage: string;
      quoteAttachments: string[];
    },
  ) {
    const vendor = await this.prisma.vendor.findUnique({ 
      where: { userId },
      select: {
        id: true,
        stripeAccountId: true,
        stripeConnectEnabled: true,
      },
    });
    if (!vendor) throw new Error('Vendor not found');

    // quoting requires Stripe Connect to be ready
    if (!vendor.stripeAccountId || !vendor.stripeConnectEnabled) {
      throw new HttpException(
        'Please set up your Stripe Connect account before submitting quotes. Go to Payouts & Withdrawals to complete the setup.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const quoteRequest = await this.prisma.quoteRequest.findUnique({
      where: { id: quoteId },
    });
    if (!quoteRequest || quoteRequest.vendorId !== vendor.id) {
      throw new Error('Quote request not found');
    }

    const updated = await this.prisma.quoteRequest.update({
      where: { id: quoteId },
      data: {
        quotePrice: data.quotePrice,
        quoteMessage: data.quoteMessage,
        quoteAttachments: data.quoteAttachments,
        status: 'QUOTED',
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // create notification for vendor (quote submitted)
    const quoteSubmittedTitle = 'Quote Submitted';
    const quoteSubmittedMessage = `You submitted a quote of $${data.quotePrice} for ${updated.user?.firstName || 'customer'}'s request`;
    try {
      await this.prisma.notification.create({
        data: {
          userId: userId,
          title: quoteSubmittedTitle,
          message: quoteSubmittedMessage,
          type: 'VENDOR_PROPOSAL',
          metadata: {
            type: 'QUOTE_SUBMITTED',
            quoteRequestId: quoteId,
            quotePrice: data.quotePrice,
            customerName:
              `${updated.user?.firstName || ''} ${updated.user?.lastName || ''}`.trim(),
          },
        },
      });
      this.sendNotificationEmailToUser(userId, quoteSubmittedTitle, quoteSubmittedMessage);
    } catch (error) {
      console.error(
        'Failed to create notification for quote submission:',
        error,
      );
    }

    // create notification for organizer/user (vendor sent a quote)
    if (updated.userId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: { businessName: true },
      });
      const newQuoteTitle = 'New Quote Received';
      const newQuoteMessage = `${vendor?.businessName || 'A vendor'} sent you a quote of $${data.quotePrice.toFixed(2)} for your request.`;
      try {
        await this.prisma.notification.create({
          data: {
            userId: updated.userId,
            title: newQuoteTitle,
            message: newQuoteMessage,
            type: 'VENDOR_PROPOSAL',
            metadata: {
              type: 'QUOTE_RECEIVED',
              quoteRequestId: quoteId,
              quotePrice: data.quotePrice,
              vendorName: vendor?.businessName,
            },
          },
        });
        this.sendNotificationEmailToUser(updated.userId, newQuoteTitle, newQuoteMessage);
      } catch (error) {
        console.error(
          'Failed to create organizer notification for quote received:',
          error,
        );
      }
    }

    return updated;
  }

  // Confirm final price for quote request (required before buyer can approve)
  async confirmFinalPrice(
    userId: string,
    quoteId: string,
    data: {
      finalPrice: number;
      deliveryTime?: string;
      description?: string;
    },
  ) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new Error('Vendor not found');

    const quoteRequest = await this.prisma.quoteRequest.findUnique({
      where: { id: quoteId },
      include: { user: { select: { id: true } } },
    });

    if (!quoteRequest || quoteRequest.vendorId !== vendor.id) {
      throw new Error('Quote request not found');
    }

    if (
      quoteRequest.status !== 'QUOTED' &&
      quoteRequest.status !== 'NEGOTIATING'
    ) {
      throw new Error(
        'Quote request must be in QUOTED or NEGOTIATING status to confirm final price',
      );
    }

    const updated = await this.prisma.quoteRequest.update({
      where: { id: quoteId },
      data: {
        finalPrice: data.finalPrice,
        deliveryTime: data.deliveryTime,
        finalPriceDescription: data.description,
        finalPriceConfirmed: true,
        finalPriceConfirmedAt: new Date(),
        status: 'QUOTED', // Keep as QUOTED, buyer will approve next
      },
    });

    // Notify buyer that final price has been confirmed (organizer/user)
    const notifyUserId = quoteRequest.userId ?? (quoteRequest.email
      ? (await this.prisma.user.findFirst({ where: { email: quoteRequest.email }, select: { id: true } }))?.id
      : null);
    if (notifyUserId) {
      const finalPriceTitle = 'Final Price Confirmed 💰';
      const finalPriceMessage = `${vendor.businessName} has confirmed the final price of $${data.finalPrice.toFixed(2)}. You can now approve and start escrow.`;
      try {
        await this.prisma.notification.create({
          data: {
            userId: notifyUserId,
            title: finalPriceTitle,
            message: finalPriceMessage,
            type: 'VENDOR_PROPOSAL',
            metadata: {
              quoteRequestId: quoteId,
              type: 'FINAL_PRICE_CONFIRMED',
              finalPrice: data.finalPrice,
            },
          },
        });
        this.sendNotificationEmailToUser(notifyUserId, finalPriceTitle, finalPriceMessage);
      } catch (err) {
        console.error('Failed to create final-price notification for organizer:', err);
      }
    }

    return updated;
  }

  async getQuoteMessages(quoteId: string) {
    return this.prisma.quoteMessage.findMany({
      where: { quoteRequestId: quoteId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendQuoteMessage(
    quoteId: string,
    senderId: string,
    senderType: 'USER' | 'VENDOR',
    message: string,
    attachments: string[] = [],
  ) {
    console.log('💬 Vendor sending message:', {
      quoteId,
      senderId,
      senderType,
      message,
    });
    const result = await this.prisma.quoteMessage.create({
      data: {
        quoteRequestId: quoteId,
        senderId,
        senderType,
        message,
        attachments,
      },
    });

    // ping organizer on vendor message
    if (senderType === 'VENDOR') {
      try {
        const quoteRequest = await this.prisma.quoteRequest.findUnique({
          where: { id: quoteId },
          select: { userId: true },
        });
        if (quoteRequest?.userId) {
          const vendor = await this.prisma.vendor.findUnique({
            where: { userId: senderId },
            select: { businessName: true },
          });
          const quoteMsgTitle = 'New Message on Quote Request';
          const quoteMsgMessage = `${vendor?.businessName || 'Vendor'} sent a message on your quote request.`;
          await this.prisma.notification.create({
            data: {
              userId: quoteRequest.userId,
              title: quoteMsgTitle,
              message: quoteMsgMessage,
              type: 'VENDOR_PROPOSAL',
              metadata: {
                type: 'QUOTE_MESSAGE',
                quoteRequestId: quoteId,
                vendorName: vendor?.businessName,
              },
            },
          });
          this.sendNotificationEmailToUser(quoteRequest.userId, quoteMsgTitle, quoteMsgMessage);
        }
      } catch (error) {
        console.error(
          'Failed to create organizer notification for quote message:',
          error,
        );
      }
    }

    console.log('✅ Vendor message created:', result.id);
    return result;
  }

  // event chat after accept
  async getEventMessagesForVendor(userId: string, eventId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new Error('Vendor not found');
    return this.prisma.eventChatMessage.findMany({
      where: { eventId, vendorId: vendor.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendEventMessageFromVendor(
    userId: string,
    eventId: string,
    message: string,
    attachments: string[] = [],
  ) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor) throw new Error('Vendor not found');

    // Determine organizer user for the event to store userId
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new Error('Event not found');

    return this.prisma.eventChatMessage.create({
      data: {
        eventId,
        vendorId: vendor.id,
        userId: event.organizerId,
        senderId: userId,
        senderType: 'VENDOR',
        message,
        attachments,
      },
    });
  }

    // create service booking AFTER payment succeeds
  async createServiceBookingAfterPayment(
    serviceId: string,
    userId: string,
    data: {
      packageTier: string;
      amount: number;
      customerName: string;
      customerEmail: string;
      customerPhone?: string;
      date: string;
      notes?: string;
      paymentIntentId: string;
    },
  ) {
    try {
      console.log(
        '🎫 Creating service booking after payment for service:',
        serviceId,
      );
      console.log('💰 Payment Intent ID:', data.paymentIntentId);
      console.log('👤 User ID:', userId);

      // Verify payment intent succeeded
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

      // Verify service exists
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
        include: { vendor: true },
      });

      if (!service) {
        throw new Error('Service not found');
      }

      // Calculate service fee (10%)
      const subtotal = data.amount;
      const serviceFee = Math.round(subtotal * 0.1);
      const totalAmount = subtotal + serviceFee;

      // create booking request with payment already completed
      console.log('💾 Creating booking request in database...');
      const bookingRequest = await this.prisma.bookingRequest.create({
        data: {
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          amount: totalAmount,
          currency: 'USD',
          date: new Date(data.date),
          status: 'ACCEPTED', // Auto-accept since payment is completed
          notes: data.notes,
          serviceId: serviceId,
          paymentStatus: 'COMPLETED',
          paymentMethod: 'STRIPE',
          paymentId: data.paymentIntentId,
          packageTier: data.packageTier,
        },
        include: {
          service: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
        },
      });

      console.log(
        '✅ Booking request created successfully:',
        bookingRequest.id,
      );

      // Record platform fee
      try {
        await this.prisma.platformFee.create({
          data: {
            sourceType: 'SERVICE_BOOKING',
            sourceId: bookingRequest.id,
            subtotal,
            feeAmount: serviceFee,
            totalAmount,
            currency: 'USD',
            paymentIntentId: data.paymentIntentId,
            status: 'AVAILABLE',
            metadata: {
              serviceId: service.id,
              serviceName: service.name,
              vendorId: service.vendorId,
              packageTier: data.packageTier,
            },
          },
        });
        console.log(
          '✅ Platform fee recorded for service booking:',
          bookingRequest.id,
        );
      } catch (feeError: any) {
        // Log error but don't fail the booking
        console.error('❌ Failed to record platform fee:', feeError);
      }

      return {
        bookingRequest: {
          id: bookingRequest.id,
          bookingNumber: `SRV-${bookingRequest.id.slice(-8).toUpperCase()}`,
          status: bookingRequest.status,
          paymentStatus: bookingRequest.paymentStatus,
          amount: Number(bookingRequest.amount),
          service: bookingRequest.service,
        },
      };
    } catch (error: any) {
      console.error('❌ Error creating service booking:', error);
      throw error;
    }
  }

  async findByUserId(userId: string) {
    return this.prisma.vendor.findUnique({
      where: { userId },
    });
  }

  // —— Stripe Connect Express ——
  async createStripeConnectAccount(
    userId: string,
    frontendUrl?: string,
  ): Promise<{ accountId: string; onboardingUrl: string }> {
    try {
      const frontendBase = (
        frontendUrl ||
        process.env.FRONTEND_URL ||
        'http://localhost:3000'
      ).replace(/\/$/, '');

      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: {
          id: true,
          email: true,
          businessName: true,
          stripeAccountId: true,
          stripeConnectEnabled: true,
        },
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // already has an account — hand back a resume/complete link
      if (vendor.stripeAccountId) {
        const accountLink = await this.stripePaymentService.createAccountLink(
          vendor.stripeAccountId,
          `${frontendBase}/vendor/payouts?refresh=true`,
          `${frontendBase}/vendor/payouts?return=true`,
        );
        return {
          accountId: vendor.stripeAccountId,
          onboardingUrl: accountLink.url,
        };
      }

      const account = await this.stripePaymentService.createConnectAccount({
        email: vendor.email,
        businessName: vendor.businessName,
        businessType: 'company', // default; could be made configurable later
      });

      const accountLink = await this.stripePaymentService.createAccountLink(
        account.id,
        `${frontendBase}/vendor/payouts?refresh=true`,
        `${frontendBase}/vendor/payouts?return=true`,
      );

      // store account id; enabled flips true after Stripe onboarding finishes
      await this.prisma.vendor.update({
        where: { id: vendor.id },
        data: {
          stripeAccountId: account.id,
          stripeConnectOnboardingUrl: accountLink.url,
          stripeConnectEnabled: false,
        },
      });

      return {
        accountId: account.id,
        onboardingUrl: accountLink.url,
      };
    } catch (error: any) {
      console.error('Error creating Stripe Connect account:', error);
      throw error;
    }
  }

  // sync charges/payouts flags from Stripe onto the vendor row
  async checkStripeConnectStatus(
    userId: string,
  ): Promise<{ enabled: boolean; details: any }> {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: {
          id: true,
          stripeAccountId: true,
          stripeConnectEnabled: true,
        },
      });

      if (!vendor || !vendor.stripeAccountId) {
        return { enabled: false, details: null };
      }

      const account = await this.stripePaymentService.getAccountStatus(
        vendor.stripeAccountId,
      );

      // fully onboarded only when both flags are true
      const isEnabled = account.charges_enabled && account.payouts_enabled;

      if (isEnabled !== vendor.stripeConnectEnabled) {
        await this.prisma.vendor.update({
          where: { id: vendor.id },
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
      console.error('Error checking Stripe Connect status:', error);
      return { enabled: false, details: null };
    }
  }
}
