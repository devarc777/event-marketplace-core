import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { StripeIdentityService } from './stripe-identity.service';
import { VendorOnboardingAiService } from './vendor-onboarding-ai.service';
import { ExternalVendorsService } from '../external-vendors/external-vendors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorOnly } from '../auth/roles.guard';

@Controller('vendors')
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly stripeIdentityService: StripeIdentityService,
    private readonly vendorOnboardingAiService: VendorOnboardingAiService,
    private readonly externalVendorsService: ExternalVendorsService,
  ) {}

  @Get()
  async findAll(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 3;
    return this.vendorsService.list(parsed);
  }

  // —— profile ——
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.vendorsService.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile/postal-code')
  async updatePostalCode(
    @Req() req: any,
    @Body() body: { postalCode: string },
  ) {
    if (!body.postalCode || !body.postalCode.trim()) {
      throw new BadRequestException('postalCode is required');
    }
    return this.vendorsService.updatePostalCode(
      req.user.id,
      body.postalCode.trim(),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile/portfolio')
  async uploadPortfolio(@Req() req: any, @Body() body: any) {
    return this.vendorsService.uploadPortfolio(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('profile/portfolio')
  async removePortfolio(@Req() req: any, @Body() body: { url: string }) {
    if (!body?.url) {
      throw new HttpException('URL is required', HttpStatus.BAD_REQUEST);
    }
    return this.vendorsService.removePortfolio(req.user.id, body.url);
  }

  // —— portfolio projects ——
  @UseGuards(JwtAuthGuard)
  @Get('portfolio/projects')
  async getPortfolioProjects(@Req() req: any) {
    return this.vendorsService.getPortfolioProjects(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('portfolio/projects')
  async createPortfolioProject(@Req() req: any, @Body() body: any) {
    return this.vendorsService.createPortfolioProject(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('portfolio/projects/:id')
  async deletePortfolioProject(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.deletePortfolioProject(req.user.id, id);
  }

  // —— onboarding draft ——
  @UseGuards(JwtAuthGuard)
  @Get('onboarding')
  async getOnboarding(@Req() req: any) {
    return this.vendorsService.getOnboarding(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/business')
  async saveBusiness(@Req() req: any, @Body() body: any) {
    return this.vendorsService.saveBusiness(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/docs')
  async saveDocs(@Req() req: any, @Body() body: any) {
    return this.vendorsService.saveDocs(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/google/verify')
  async verifyGoogle(@Req() req: any, @Body() body: any) {
    return this.vendorsService.verifyGoogle(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/submit')
  async submitOnboarding(@Req() req: any) {
    return this.vendorsService.submitOnboarding(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('claim-external')
  async claimExternal(@Req() req: any, @Body() body: { claimToken: string }) {
    if (!body?.claimToken || !body.claimToken.trim()) {
      throw new BadRequestException('claimToken is required');
    }
    return this.externalVendorsService.claimByToken(req.user.id, body.claimToken.trim());
  }

  // —— AI onboarding ——
  @UseGuards(JwtAuthGuard)
  @Post('onboarding/ai/start')
  async startAiOnboarding(@Req() req: any) {
    const vendor = await this.vendorsService.getOnboarding(req.user.id);
    if (!vendor?.vendor) {
      throw new BadRequestException('Vendor profile not found. Please complete business info first.');
    }
    const vendorCategory = vendor.vendor.category;
    const result = await this.vendorOnboardingAiService.startSession(vendor.vendor.id, vendorCategory);
    // ~4 seed questions + up to 8 follow-ups
    return {
      ...result,
      estimatedTotal: 12,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/ai/answer')
  async submitAiAnswer(
    @Req() req: any,
    @Body() body: { sessionId: string; questionId: string; answer: string | string[] },
  ) {
    const vendor = await this.vendorsService.getOnboarding(req.user.id);
    if (!vendor?.vendor) {
      throw new BadRequestException('Vendor profile not found.');
    }
    const result = await this.vendorOnboardingAiService.submitAnswer(
      vendor.vendor.id,
      body.sessionId,
      body.questionId,
      body.answer,
    );

    // answer count so the UI can show progress
    const session = await this.vendorOnboardingAiService.getSession(body.sessionId);
    const answerCount = session ? (session.sessionData as any)?.answers?.length || 0 : 0;
    
    return {
      ...result,
      currentQuestionNumber: answerCount,
      estimatedTotal: 12,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('onboarding/ai/profile')
  async getAiProfile(@Req() req: any) {
    const vendor = await this.vendorsService.getOnboarding(req.user.id);
    if (!vendor?.vendor) {
      return { aiOnboardingCompleted: false };
    }
    return this.vendorOnboardingAiService.getProfile(vendor.vendor.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('onboarding/ai/complete')
  async completeAiOnboarding(
    @Req() req: any,
    @Body() body: { sessionId: string },
  ) {
    const vendor = await this.vendorsService.getOnboarding(req.user.id);
    if (!vendor?.vendor) {
      throw new BadRequestException('Vendor profile not found.');
    }
    return this.vendorOnboardingAiService.completeOnboarding(vendor.vendor.id, body.sessionId);
  }

  // —— dashboard ——
  @UseGuards(JwtAuthGuard)
  @Get('dashboard-stats')
  async getDashboardStats(@Req() req: any) {
    return this.vendorsService.getDashboardStats(req.user.id);
  }

  // —— notifications ——
  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  async getVendorNotifications(@Req() req: any) {
    return this.vendorsService.getVendorNotifications(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications/unread-count')
  async getVendorUnreadCount(@Req() req: any) {
    return this.vendorsService.getVendorUnreadCount(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('notifications/:notificationId/read')
  async markVendorNotificationAsRead(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    return this.vendorsService.markVendorNotificationAsRead(
      req.user.id,
      notificationId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('notifications/:notificationId')
  async deleteVendorNotification(
    @Req() req: any,
    @Param('notificationId') notificationId: string,
  ) {
    return this.vendorsService.deleteVendorNotification(
      req.user.id,
      notificationId,
    );
  }

  // —— services CRUD ——
  @UseGuards(JwtAuthGuard)
  @Get('services')
  async myServices(@Req() req: any) {
    return this.vendorsService.myServices(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('services')
  async createService(@Req() req: any, @Body() body: any) {
    return this.vendorsService.createService(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Put('services/:id')
  async updateService(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.vendorsService.updateService(req.user.id, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('services/:id')
  async deleteService(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.deleteService(req.user.id, id);
  }

  @Get('services/:id')
  async getServicePublic(@Param('id') id: string) {
    return this.vendorsService.getServicePublic(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pricing')
  async getPricing(@Req() req: any) {
    return this.vendorsService.getPricing(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('pricing')
  async savePricing(@Req() req: any, @Body() body: any) {
    return this.vendorsService.savePricing(req.user.id, body);
  }

  @Get('marketplace')
  async getMarketplaceVendors(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.vendorsService.getMarketplaceVendors(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 60,
    );
  }

  @Get('featured')
  async getFeaturedVendors() {
    return this.vendorsService.getFeaturedVendors();
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
    return this.vendorsService.toggleHomepageFeature(id, body.featured);
  }

  @Get('public/:id')
  async getPublicVendor(@Param('id') id: string) {
    return this.vendorsService.getPublicVendor(id);
  }

  @Get('public/:vendorId/services/:serviceId')
  async getPublicService(
    @Param('vendorId') vendorId: string,
    @Param('serviceId') serviceId: string,
  ) {
    return this.vendorsService.getPublicService(vendorId, serviceId);
  }

  // —— service booking (post-payment) ——
  @Post('services/:serviceId/bookings/create')
  @UseGuards(JwtAuthGuard)
  async createServiceBookingAfterPayment(
    @Param('serviceId') serviceId: string,
    @Body()
    body: {
      packageTier: string;
      amount: number;
      customerName: string;
      customerEmail: string;
      customerPhone?: string;
      date: string;
      notes?: string;
      paymentIntentId: string;
    },
    @Req() req: any,
  ) {
    return this.vendorsService.createServiceBookingAfterPayment(
      serviceId,
      req.user.id,
      body,
    );
  }

  @Get('services')
  @UseGuards(JwtAuthGuard)
  async getVendorServices(@Req() req: any) {
    return this.vendorsService.getVendorServices(req.user.id);
  }

  // —— booking requests ——
  @UseGuards(JwtAuthGuard)
  @Get('requests')
  async myRequests(@Req() req: any, @Query('status') status?: string) {
    return this.vendorsService.myRequests(req.user.id, status);
  }

  // —— quote requests ——
  @UseGuards(JwtAuthGuard)
  @Get('quote-requests')
  async myQuoteRequests(@Req() req: any, @Query('status') status?: string) {
    return this.vendorsService.myQuoteRequestsIncludingExternal(req.user.id, status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('all-requests')
  async getAllRequests(@Req() req: any, @Query('status') status?: string) {
    return this.vendorsService.getAllRequests(req.user.id, status);
  }

  // event services near this vendor's postal code
  @UseGuards(JwtAuthGuard)
  @Get('event-services')
  async getMatchingEventServices(@Req() req: any) {
    return this.vendorsService.getMatchingEventServices(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('requests/:id/accept')
  async acceptRequest(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.setRequestStatus(req.user.id, id, 'ACCEPTED');
  }

  @UseGuards(JwtAuthGuard)
  @Post('requests/:id/reject')
  async rejectRequest(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.setRequestStatus(req.user.id, id, 'REJECTED');
  }

  @UseGuards(JwtAuthGuard)
  @Post('quote-requests/:id/contact')
  async contactQuoteRequest(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.setQuoteRequestStatus(
      req.user.id,
      id,
      'CONTACTED',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('quote-requests/:id/quote')
  async quoteQuoteRequest(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.setQuoteRequestStatus(req.user.id, id, 'QUOTED');
  }

  @UseGuards(JwtAuthGuard)
  @Post('quote-requests/:id/accept')
  async acceptQuoteRequest(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.setQuoteRequestStatus(
      req.user.id,
      id,
      'ACCEPTED',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('quote-requests/:id/reject')
  async rejectQuoteRequest(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.setQuoteRequestStatus(
      req.user.id,
      id,
      'REJECTED',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('quote-requests/:id/delete')
  async deleteQuoteRequest(@Req() req: any, @Param('id') id: string) {
    return this.vendorsService.deleteQuoteRequest(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('quote-requests/:id/respond')
  async respondToQuoteRequest(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    console.log('💬 Vendor responding to quote:', id, body);
    try {
      const result = await this.vendorsService.respondToQuoteRequest(
        req.user.id,
        id,
        body,
      );
      console.log('✅ Quote response sent');
      return result;
    } catch (error) {
      console.error('❌ Failed to respond to quote:', error);
      throw new Error('Failed to respond to quote');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('quote-requests/:id/confirm-final-price')
  async confirmFinalPrice(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      finalPrice: number;
      deliveryTime?: string;
      description?: string;
    },
  ) {
    console.log('💰 Vendor confirming final price for quote:', id, body);
    try {
      const result = await this.vendorsService.confirmFinalPrice(
        req.user.id,
        id,
        body,
      );
      console.log('✅ Final price confirmed');
      return result;
    } catch (error: any) {
      console.error('❌ Failed to confirm final price:', error);
      throw new HttpException(
        error.message || 'Failed to confirm final price',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('quote-requests/:id/messages')
  async getQuoteMessages(@Req() req: any, @Param('id') id: string) {
    console.log('📨 Vendor fetching messages for quote:', id);
    try {
      const messages = await this.vendorsService.getQuoteMessages(id);
      console.log('✅ Found', messages.length, 'messages');
      return messages;
    } catch (error) {
      console.error('❌ Failed to fetch messages:', error);
      throw new Error('Failed to fetch messages');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('quote-requests/:id/messages')
  async sendQuoteMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    console.log('💬 Vendor sending message to quote:', id);
    console.log('💬 Vendor user ID:', req.user.id);
    console.log('💬 Message body:', body);
    try {
      const result = await this.vendorsService.sendQuoteMessage(
        id,
        req.user.id,
        'VENDOR',
        body.message,
        body.attachments || [],
      );
      console.log('✅ Vendor message sent successfully:', result.id);
      return result;
    } catch (error) {
      console.error('❌ Failed to send vendor message:', error);
      throw new Error('Failed to send message');
    }
  }

  // —— event chat (post-accept) ——
  @UseGuards(JwtAuthGuard)
  @Get('events/:eventId/messages')
  async getEventMessagesForVendor(
    @Req() req: any,
    @Param('eventId') eventId: string,
  ) {
    return this.vendorsService.getEventMessagesForVendor(req.user.id, eventId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('events/:eventId/messages')
  async sendEventMessageFromVendor(
    @Req() req: any,
    @Param('eventId') eventId: string,
    @Body() body: any,
  ) {
    return this.vendorsService.sendEventMessageFromVendor(
      req.user.id,
      eventId,
      body?.message || '',
      body?.attachments || [],
    );
  }

  // —— Stripe Identity ——
  @UseGuards(JwtAuthGuard)
  @Post('verification/create-session')
  async createVerificationSession(@Req() req: any) {
    return this.stripeIdentityService.createVerificationSession(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('verification/status')
  async getVerificationStatus(@Req() req: any) {
    return this.stripeIdentityService.getVerificationStatus(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verification/cancel')
  async cancelVerification(@Req() req: any) {
    return this.stripeIdentityService.cancelVerification(req.user.id);
  }

  // no JWT — Stripe signature validates this (raw body expected upstream)
  @Post('webhooks/stripe')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: any,
  ) {
    try {
      const event = req.body;
      await this.stripeIdentityService.handleWebhook(event);
      return { received: true };
    } catch (error) {
      console.error('Webhook error:', error);
      throw error;
    }
  }

  // —— Stripe Connect ——
  @UseGuards(JwtAuthGuard, VendorOnly)
  @Post('stripe-connect/create')
  async createStripeConnectAccount(
    @Req() req: any,
    @Body() body?: { frontendBase?: string },
  ) {
    try {
      const frontendUrl =
        body?.frontendBase?.replace(/\/$/, '') ||
        req.headers?.origin?.replace(/\/$/, '') ||
        process.env.FRONTEND_URL ||
        'http://localhost:3000';

      const result = await this.vendorsService.createStripeConnectAccount(
        req.user.id,
        frontendUrl,
      );
      return result;
    } catch (error: any) {
      throw new HttpException(
        error?.raw?.message || error?.message || 'Failed to create Stripe Connect account',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @UseGuards(JwtAuthGuard, VendorOnly)
  @Get('stripe-connect/status')
  async getStripeConnectStatus(@Req() req: any) {
    try {
      const status = await this.vendorsService.checkStripeConnectStatus(
        req.user.id,
      );
      return status;
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to get Stripe Connect status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
