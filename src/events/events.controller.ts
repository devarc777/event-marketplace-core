import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
  Delete,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async getEvents(@Query('limit') limit?: string) {
    return this.eventsService.list(limit ? Number(limit) : undefined);
  }

  @Post()
  async createEvent(@Body() body: any) {
    if (!body?.title || !body?.startDate || !body?.organizerEmail) {
      throw new BadRequestException(
        'title, startDate and organizerEmail are required',
      );
    }
    return this.eventsService.create(body);
  }

  @Delete(':id')
  async deleteEvent(@Param('id') id: string) {
    if (!id) {
      throw new BadRequestException('id is required');
    }
    return this.eventsService.delete(id);
  }

  @Get('by-organizer')
  async listByOrganizer(@Query('email') email?: string) {
    if (!email) {
      throw new BadRequestException('email is required');
    }
    return this.eventsService.listByOrganizerEmail(email);
  }

  @Get('search')
  async searchEvents(
    @Query('what') what?: string,
    @Query('where') where?: string,
    @Query('zipcode') zipcode?: string,
    @Query('when') when?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string,
  ) {
    return this.eventsService.search({
      what,
      where,
      zipcode,
      when,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      skip: skip ? Number(skip) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Put(':id')
  async updateEvent(@Param('id') id: string, @Body() body: any) {
    if (!id) {
      throw new BadRequestException('id is required');
    }
    return this.eventsService.update(id, body);
  }

  @Put(':id/homepage-feature')
  async toggleHomepageFeature(
    @Param('id') id: string,
    @Body() body: { featured: boolean },
  ) {
    if (!id) {
      throw new BadRequestException('id is required');
    }
    if (typeof body?.featured !== 'boolean') {
      throw new BadRequestException('featured (boolean) is required');
    }
    return this.eventsService.toggleHomepageFeature(id, body.featured);
  }

  @Get('featured')
  async getFeaturedEvents() {
    return this.eventsService.getFeaturedEvents();
  }

  // lookup ticket by QR / ticket number
  @Get('tickets/scan/:code')
  async scanTicket(@Param('code') code: string) {
    if (!code) {
      throw new BadRequestException('Ticket code is required');
    }
    return this.eventsService.scanTicket(code);
  }

  // bookings before :id (route order)
  @Post(':eventId/bookings/create')
  @UseGuards(JwtAuthGuard)
  async createEventBookingAfterPayment(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      tickets: Array<{
        tier: string;
        price: number;
        quantity: number;
      }>;
      customerEmail: string;
      paymentIntentId: string;
      customerName?: string;
    },
    @Req() req: any,
  ) {
    if (!eventId) {
      throw new BadRequestException('eventId is required');
    }
    if (!body.tickets || body.tickets.length === 0) {
      throw new BadRequestException('At least one ticket is required');
    }
    if (!body.customerEmail) {
      throw new BadRequestException('customerEmail is required');
    }
    if (!body.paymentIntentId) {
      throw new BadRequestException('paymentIntentId is required');
    }

    return this.eventsService.createEventBookingAfterPayment(
      eventId,
      req.user.id,
      body,
    );
  }

  // notifications before :id (route order)
  @Get('notifications')
  @UseGuards(JwtAuthGuard)
  async getUserNotifications(@Req() req: any) {
    console.log('🔔 Fetching notifications for user:', req.user?.id);
    return this.eventsService.getUserNotifications(req.user.id);
  }

  @Put('notifications/read-all')
  @UseGuards(JwtAuthGuard)
  async markAllNotificationsAsRead(@Req() req: any) {
    return this.eventsService.markAllNotificationsAsRead(req.user.id);
  }

  @Put('notifications/:notificationId/read')
  @UseGuards(JwtAuthGuard)
  async markNotificationAsRead(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    console.log(
      '🔔 Marking notification as read:',
      notificationId,
      'for user:',
      req.user?.id,
    );
    return this.eventsService.markNotificationAsRead(
      req.user.id,
      notificationId,
    );
  }

  @Get('notifications/unread-count')
  @UseGuards(JwtAuthGuard)
  async getUnreadNotificationCount(@Req() req: any) {
    return this.eventsService.getUnreadNotificationCount(req.user.id);
  }

  @Delete('notifications/:notificationId')
  @UseGuards(JwtAuthGuard)
  async deleteNotification(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    return this.eventsService.deleteNotification(req.user.id, notificationId);
  }

  @Post('notifications/resolve-view-urls')
  @UseGuards(JwtAuthGuard)
  async resolveNotificationViewUrls(
    @Req() req: any,
    @Body() body: { notificationIds: string[] },
  ) {
    if (!Array.isArray(body?.notificationIds) || body.notificationIds.length === 0) {
      return {};
    }
    return this.eventsService.getNotificationViewUrls(
      req.user.id,
      body.notificationIds,
    );
  }

  // ticketmaster before :id (route order)
  @Get('ticketmaster')
  @Get('ticketmaster/search')
  async listTicketmaster(
    @Query('keyword') keyword?: string,
    @Query('city') city?: string,
    @Query('size') size?: string,
    @Query('page') page?: string,
  ) {
    const s = Number(size) || 20;
    const p = Number(page) || 0;
    const result = await this.eventsService.fetchTicketmasterEvents({
      keyword,
      city,
      size: s,
      page: p,
    });
    return {
      ...result,
      debug: {
        hasApiKey: !!process.env.TICKETMASTER_API_KEY,
        apiKeyLength: process.env.TICKETMASTER_API_KEY?.length || 0,
        requestParams: { keyword, city, size: s, page: p },
      },
    };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.eventsService.getById(id);
  }

  @Get(':id/ticket-availability')
  async getTicketAvailability(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.eventsService.getTicketAvailability(id);
  }

  @Get('organizer/ticket-sales')
  @UseGuards(JwtAuthGuard)
  async getOrganizerTicketSales(@Req() req: any) {
    return this.eventsService.getOrganizerTicketSales(req.user.id);
  }

  @Get('organizer/bookings')
  @UseGuards(JwtAuthGuard)
  async getOrganizerBookings(@Req() req: any) {
    return this.eventsService.getOrganizerBookings(req.user.id);
  }

  @Get('organizer/vendors')
  @UseGuards(JwtAuthGuard)
  async getOrganizerEventVendors(@Req() req: any) {
    return this.eventsService.getOrganizerEventVendors(req.user.id);
  }

  @Get('organizer/rfqs')
  @UseGuards(JwtAuthGuard)
  async getOrganizerRFQs(@Req() req: any) {
    return this.eventsService.getOrganizerRFQs(req.user.id);
  }

  @Get(':eventId/flag-status')
  @UseGuards(JwtAuthGuard)
  async getEventFlagStatus(@Param('eventId') eventId: string, @Req() req: any) {
    const event = await this.eventsService.getById(eventId);
    if (!event) {
      throw new BadRequestException('Event not found');
    }
    if (event.organizerId !== req.user.id) {
      throw new BadRequestException(
        'You do not have permission to view this event',
      );
    }
    return {
      isFlagged: event.isFlagged || false,
      flagReason: event.flagReason || null,
      flaggedAt: event.flaggedAt || null,
      unflagRequestStatus: event.unflagRequestStatus || null,
    };
  }

  @Post(':eventId/request-unflag')
  @UseGuards(JwtAuthGuard)
  async requestUnflag(
    @Param('eventId') eventId: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    if (!body.reason || !body.reason.trim()) {
      throw new BadRequestException('Reason is required');
    }
    const event = await this.eventsService.getById(eventId);
    if (!event) {
      throw new BadRequestException('Event not found');
    }
    if (event.organizerId !== req.user.id) {
      throw new BadRequestException(
        'You do not have permission to request unflag for this event',
      );
    }
    if (!event.isFlagged) {
      throw new BadRequestException('Event is not flagged');
    }

    const updated = await this.eventsService.requestUnflag(
      eventId,
      body.reason,
    );
    return { success: true, event: updated };
  }

  @Post(':eventId/rfqs')
  @UseGuards(JwtAuthGuard)
  async createRFQ(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      title: string;
      description: string;
      category: string;
      budget?: number;
      currency?: string;
      requirements?: any;
      deadline?: string;
      eventDate?: string;
      postalCode?: string;
    },
    @Req() req: any,
  ) {
    if (!eventId) {
      throw new BadRequestException('eventId is required');
    }
    if (!body?.title || !body?.description || !body?.category) {
      throw new BadRequestException(
        'title, description, and category are required',
      );
    }

    if (req.user.role !== 'ORGANIZER') {
      throw new BadRequestException('Only organizers can create RFQs');
    }

    return this.eventsService.createRFQ(eventId, req.user.id, {
      title: body.title,
      description: body.description,
      category: body.category,
      budget: body.budget,
      currency: body.currency || 'USD',
      requirements: body.requirements,
      deadline: body.deadline ? new Date(body.deadline) : undefined,
      eventDate: body.eventDate ? new Date(body.eventDate) : undefined,
      postalCode: body.postalCode,
    });
  }

  // organizer Stripe Connect
  @Post('organizer/stripe-connect/create')
  @UseGuards(JwtAuthGuard)
  async createOrganizerStripeConnectAccount(@Req() req: any) {
    try {
      if (req.user.role !== 'ORGANIZER') {
        throw new BadRequestException(
          'Only organizers can create Stripe Connect accounts',
        );
      }
      const result =
        await this.eventsService.createOrganizerStripeConnectAccount(
          req.user.id,
        );
      return result;
    } catch (error: any) {
      console.error('Error creating Stripe Connect account:', error);
      throw new BadRequestException(
        error.message || 'Failed to create Stripe Connect account',
      );
    }
  }

  @Get('organizer/stripe-connect/status')
  @UseGuards(JwtAuthGuard)
  async getOrganizerStripeConnectStatus(@Req() req: any) {
    try {
      if (req.user.role !== 'ORGANIZER') {
        throw new BadRequestException(
          'Only organizers can check Stripe Connect status',
        );
      }
      const status = await this.eventsService.checkOrganizerStripeConnectStatus(
        req.user.id,
      );
      return status;
    } catch (error: any) {
      console.error('Error getting Stripe Connect status:', error);
      throw new BadRequestException(
        error.message || 'Failed to get Stripe Connect status',
      );
    }
  }

  @Get(':id/preview')
  async preview(@Param('id') id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.eventsService.preview(id);
  }

  @Post('ticketmaster/sync')
  async syncTicketmaster(
    @Query('keyword') keyword?: string,
    @Query('city') city?: string,
    @Query('size') size?: string,
    @Query('page') page?: string,
  ) {
    const s = Number(size) || 20;
    const p = Number(page) || 0;
    const { events } = await this.eventsService.fetchTicketmasterEvents({
      keyword,
      city,
      size: s,
      page: p,
    });
    const result = await this.eventsService.upsertTicketmasterEvents(events);
    return { count: result.inserted + result.updated, events, result };
  }

  @Post('ticketmaster/sync-all')
  async syncAllTicketmasterEvents() {
    // full TM sync by country pages
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      return {
        events: [],
        total: 0,
        stored: 0,
        inserted: 0,
        updated: 0,
        page: { totalElements: 0 },
        error: 'TICKETMASTER_API_KEY is not set',
      };
    }

    try {
      const total = await this.eventsService.syncAllTicketmasterPages();
      return {
        events: [],
        total,
        stored: total,
        inserted: total,
        updated: 0,
        page: { totalElements: total },
      };
    } catch (error) {
      return {
        events: [],
        total: 0,
        stored: 0,
        inserted: 0,
        updated: 0,
        page: { totalElements: 0 },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  @Post('ticketmaster/sync-pages')
  async syncTicketmasterPages() {
    const total = await this.eventsService.syncAllTicketmasterPages();
    return { total };
  }

  // GET alias for browser testing
  @Get('ticketmaster/sync-pages')
  async syncTicketmasterPagesGet() {
    const total = await this.eventsService.syncAllTicketmasterPages();
    return { total };
  }

  @Post('ticketmaster/sync-next')
  async syncTicketmasterNext() {
    return this.eventsService.syncTicketmasterNextBatch();
  }

  @Get('ticketmaster/sync-next')
  async syncTicketmasterNextGet() {
    return this.eventsService.syncTicketmasterNextBatch();
  }

  @Post('ticketmaster/sync-rolling')
  async syncTicketmasterRolling() {
    try {
      const res = await this.eventsService.syncTicketmasterRolling(100);
      return { ok: true, ...res };
    } catch (error: any) {
      // structured error for debugging (avoid bare 500)
      return { ok: false, error: error?.message || String(error) };
    }
  }

  @Get('ticketmaster/sync-rolling')
  async syncTicketmasterRollingGet() {
    try {
      const res = await this.eventsService.syncTicketmasterRolling(100);
      return { ok: true, ...res };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  @Post('ticketmaster/sync-full')
  async syncTicketmasterFull() {
    const res = await this.eventsService.syncTicketmasterFullReliable();
    return res;
  }

  @Get('ticketmaster/sync-full')
  async syncTicketmasterFullGet() {
    const res = await this.eventsService.syncTicketmasterFullReliable();
    return res;
  }

  @Get('external/stored')
  async listStoredExternal(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const l = limit ? Number(limit) : undefined;
    const s = skip ? Number(skip) : undefined;
    return this.eventsService.listStoredExternal(l, s);
  }
  @Get('external/stored/count')
  async countStoredExternalTicketmaster() {
    const count = await this.eventsService.countStoredExternalTicketmaster();
    return { count };
  }

  @Get('all')
  async getAllEvents(@Query('limit') limit?: string) {
    const l = Number(limit) || 5000;
    return this.eventsService.getAllEvents(l);
  }

  @Get('trending')
  async getTrendingEvents(@Query('limit') limit?: string) {
    const l = Number(limit) || 6;
    return this.eventsService.getTrendingEvents(l);
  }

  // admin utilities (lock down later)
  @Post('seed-samples')
  async seedSamples() {
    return this.eventsService.seedSampleEvents();
  }

  @Delete('purge')
  async purge(@Query('keyword') keyword?: string) {
    try {
      const result = await this.eventsService.purgeEvents(keyword);
      return result;
    } catch (error) {
      console.error('Controller purge error:', error);
      return {
        ok: false,
        deleted: 0,
        message: 'Controller error',
        error: error.message,
      };
    }
  }

  @Post('delete-by-titles')
  async deleteByTitles(@Body() body: { titles?: string[] }) {
    const titles = Array.isArray(body?.titles) ? body.titles : [];
    return this.eventsService.deleteByTitles(titles);
  }

  @Delete('delete-by-title')
  async deleteByTitle(@Query('titles') titles?: string) {
    const arr = (titles || '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return this.eventsService.deleteByTitlesContainsInsensitive(arr);
  }

  @Get('test-db')
  async testDb() {
    try {
      const count = await this.eventsService.countEvents();
      return { ok: true, count, message: 'Database connection working' };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  @Delete('delete-all')
  async deleteAll() {
    try {
      const result = await this.eventsService.purgeEvents();
      return result;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  // event services
  @Post(':eventId/services')
  async createEventService(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      title: string;
      description?: string;
      category: string;
      budget?: number;
      currency?: string;
      postalCode?: string;
    },
  ) {
    if (!eventId) {
      throw new BadRequestException('eventId is required');
    }
    if (!body?.title || !body?.category) {
      throw new BadRequestException('title and category are required');
    }
    return this.eventsService.createEventService(eventId, body);
  }

  @Get(':eventId/services')
  async getEventServices(@Param('eventId') eventId: string) {
    if (!eventId) {
      throw new BadRequestException('eventId is required');
    }
    return this.eventsService.getEventServices(eventId);
  }

  @Put(':eventId/services/:serviceId')
  async updateEventService(
    @Param('eventId') eventId: string,
    @Param('serviceId') serviceId: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      category?: string;
      budget?: number;
      currency?: string;
      postalCode?: string;
      status?: string;
    },
  ) {
    if (!eventId || !serviceId) {
      throw new BadRequestException('eventId and serviceId are required');
    }
    return this.eventsService.updateEventService(serviceId, body);
  }

  @Delete(':eventId/services/:serviceId')
  async deleteEventService(
    @Param('eventId') eventId: string,
    @Param('serviceId') serviceId: string,
  ) {
    if (!eventId || !serviceId) {
      throw new BadRequestException('eventId and serviceId are required');
    }
    return this.eventsService.deleteEventService(serviceId);
  }

  // service bids
  @Post(':eventId/services/:serviceId/bids')
  @UseGuards(JwtAuthGuard)
  async createServiceBid(
    @Param('eventId') eventId: string,
    @Param('serviceId') serviceId: string,
    @Body()
    body: {
      vendorId: string; // Keep for backward compatibility, but we'll use userId from auth
      bidAmount: number;
      currency: string;
      message: string;
      attachments?: string[];
    },
    @Req() req: any,
  ) {
    if (!eventId || !serviceId) {
      throw new BadRequestException('eventId and serviceId are required');
    }
    if (!body?.bidAmount || !body?.message) {
      throw new BadRequestException('bidAmount and message are required');
    }

    // prefer auth user over body.vendorId
    const userId = req.user.id;
    console.log('💰 Creating bid for service:', serviceId, 'by user:', userId);

    return this.eventsService.createServiceBid(serviceId, userId, {
      bidAmount: body.bidAmount,
      currency: body.currency || 'USD',
      message: body.message,
      attachments: body.attachments || [],
    });
  }

  @Get(':eventId/services/:serviceId/bids')
  async getServiceBids(
    @Param('eventId') eventId: string,
    @Param('serviceId') serviceId: string,
  ) {
    if (!eventId || !serviceId) {
      throw new BadRequestException('eventId and serviceId are required');
    }
    return this.eventsService.getServiceBids(serviceId);
  }

  @Put(':eventId/services/:serviceId/bids/:bidId')
  @UseGuards(JwtAuthGuard)
  async updateBidStatus(
    @Param('eventId') eventId: string,
    @Param('serviceId') serviceId: string,
    @Param('bidId') bidId: string,
    @Body()
    body: {
      status?: string;
      bidAmount?: number;
      currency?: string;
      message?: string;
      paymentIntentId?: string;
    },
    @Req() req: any,
  ) {
    if (!eventId || !serviceId || !bidId) {
      throw new BadRequestException(
        'eventId, serviceId, and bidId are required',
      );
    }

    // vendor editing bid amount/message
    if (body.bidAmount !== undefined || body.message !== undefined) {
      console.log('🔄 Updating bid details:', bidId, 'by user:', req.user?.id);
      return this.eventsService.updateBid(bidId, req.user.id, {
        bidAmount: body.bidAmount,
        currency: body.currency,
        message: body.message,
      });
    }

    // organizer changing bid status
    if (body?.status) {
      console.log(
        '🔄 Updating bid status:',
        bidId,
        'to:',
        body.status,
        'by user:',
        req.user?.id,
      );
      return this.eventsService.updateBidStatus(
        bidId,
        body.status,
        body.paymentIntentId,
      );
    }

    throw new BadRequestException(
      'Either status or bidAmount/message must be provided',
    );
  }

  @Delete(':eventId/services/:serviceId/bids/:bidId')
  @UseGuards(JwtAuthGuard)
  async deleteServiceBid(
    @Param('eventId') eventId: string,
    @Param('serviceId') serviceId: string,
    @Param('bidId') bidId: string,
    @Req() req: any,
  ) {
    if (!eventId || !serviceId || !bidId) {
      throw new BadRequestException(
        'eventId, serviceId, and bidId are required',
      );
    }
    console.log('🗑️ Deleting bid:', bidId, 'by user:', req.user?.id);
    return this.eventsService.deleteServiceBid(bidId, req.user.id);
  }

  @Get('vendor/:vendorId/bids')
  async getVendorBids(@Param('vendorId') vendorId: string) {
    if (!vendorId) {
      throw new BadRequestException('vendorId is required');
    }
    return this.eventsService.getVendorBids(vendorId);
  }

  // organizer event chat
  @Get(':eventId/messages')
  @UseGuards(JwtAuthGuard)
  async getEventMessagesForUser(
    @Req() req: any,
    @Param('eventId') eventId: string,
    @Query('vendorId') vendorId?: string,
  ) {
    if (!vendorId) throw new BadRequestException('vendorId is required');
    return this.eventsService.getEventMessagesForUser(
      req.user.id,
      eventId,
      vendorId,
    );
  }

  @Post(':eventId/messages')
  @UseGuards(JwtAuthGuard)
  async sendEventMessageFromUser(
    @Req() req: any,
    @Param('eventId') eventId: string,
    @Body()
    body: { vendorId?: string; message?: string; attachments?: string[] },
  ) {
    if (!body?.vendorId) throw new BadRequestException('vendorId is required');
    if (!body?.message || !body.message.trim())
      throw new BadRequestException('message is required');
    return this.eventsService.sendEventMessageFromUser(
      req.user.id,
      eventId,
      body.vendorId,
      body.message.trim(),
      body.attachments || [],
    );
  }

  @Get('messages/conversations')
  @UseGuards(JwtAuthGuard)
  async getUserEventChatConversations(@Req() req: any) {
    return this.eventsService.getUserEventChatConversations(req.user.id);
  }

  @Get('test-notifications')
  async testNotifications() {
    return { message: 'Notifications endpoint is working!', count: 0 };
  }

  // my-tickets before :bookingId
  @Get('bookings/my-tickets')
  @UseGuards(JwtAuthGuard)
  async getMyEventTickets(@Req() req: any) {
    try {
      return await this.eventsService.getUserEventBookings(req.user.id);
    } catch (error) {
      console.error('❌ Error in getMyEventTickets:', error);
      throw error;
    }
  }

  @Get('bookings/:bookingId')
  @UseGuards(JwtAuthGuard)
  async getBooking(@Param('bookingId') bookingId: string, @Req() req: any) {
    if (!bookingId) {
      throw new BadRequestException('bookingId is required');
    }
    // guard against route confusion
    if (bookingId === 'my-tickets') {
      throw new BadRequestException('Invalid booking ID');
    }
    return this.eventsService.getBookingById(bookingId, req.user.id);
  }
}