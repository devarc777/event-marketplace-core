import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { StripePaymentService } from '../payments/stripe-payment.service';
import { MailService } from '../mail/mail.service';
import { ExternalVendorsService } from '../external-vendors/external-vendors.service';

@Injectable()
export class QuoteRequestsService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WorkOrdersService))
    private workOrdersService: WorkOrdersService,
    private readonly stripePaymentService: StripePaymentService,
    private readonly mailService: MailService,
    private readonly externalVendorsService: ExternalVendorsService,
    private readonly configService: ConfigService,
  ) {}

  async createQuoteRequest(data: {
    fullName: string;
    email: string;
    phone: string;
    eventType: string;
    eventDate: Date;
    eventLocation: string;
    numberOfGuests: string;
    budgetRange: string;
    additionalDetails: string | null;
    vendorId: string;
    userId: string | null;
  }) {
    console.log(
      '📝 QuoteRequestsService: Creating quote request with data:',
      data,
    );
    const result = await this.prisma.quoteRequest.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        eventType: data.eventType,
        eventDate: data.eventDate,
        eventLocation: data.eventLocation,
        numberOfGuests: data.numberOfGuests,
        budgetRange: data.budgetRange,
        additionalDetails: data.additionalDetails,
        vendorId: data.vendorId,
        userId: data.userId,
        status: 'PENDING',
      },
      include: {
        vendor: {
          select: {
            businessName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
    console.log(
      '✅ QuoteRequestsService: Quote request created successfully:',
      result.id,
    );
    return result;
  }

  async createExternalQuoteRequest(data: {
    externalVendorId: string;
    fullName: string;
    email: string;
    phone: string;
    eventType: string;
    eventDate: Date;
    eventLocation: string;
    numberOfGuests: string;
    budgetRange: string;
    additionalDetails: string | null;
    userId: string | null;
  }) {
    const ext = await this.externalVendorsService.getById(data.externalVendorId);
    if (!ext) throw new Error('External vendor not found');
    const created = await this.prisma.externalQuoteRequest.create({
      data: {
        externalVendorId: data.externalVendorId,
        userId: data.userId,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone,
        eventType: data.eventType,
        eventDate: data.eventDate,
        eventLocation: data.eventLocation,
        numberOfGuests: data.numberOfGuests,
        budgetRange: data.budgetRange,
        additionalDetails: data.additionalDetails,
        status: 'PENDING',
      },
    });
    const claimToken = this.externalVendorsService.createClaimToken(data.externalVendorId);
    const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000').replace(/\/$/, '');
    const signupClaimUrl = `${frontendUrl}/vendor/auth/signup?claim=${encodeURIComponent(claimToken)}`;
    await this.mailService.sendExternalVendorQuoteRequestEmail(ext.email, ext.name, signupClaimUrl);
    return {
      ...created,
      _testSignupClaimUrl: signupClaimUrl,
    } as typeof created & { _testSignupClaimUrl: string };
  }

  // user quotes + unclaimed externals
  async getUserQuoteRequests(userId: string, userEmail?: string) {
    console.log(
      '📋 QuoteRequestsService: Fetching quote requests for user:',
      userId,
      'email:',
      userEmail,
    );
    const whereClause: any = userEmail
      ? { OR: [{ userId }, { email: userEmail }] }
      : { userId };
    const result = await this.prisma.quoteRequest.findMany({
      where: whereClause,
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            category: true,
            city: true,
            profilePicture: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    console.log(
      '📋 QuoteRequestsService: Found',
      result.length,
      'quote requests for user:',
      userId,
    );
    console.log(
      '📋 QuoteRequestsService: Quote requests with messages:',
      result.filter((r) => r.messages && r.messages.length > 0).length,
    );
    result.forEach((req, index) => {
      console.log(`📋 Quote request ${index + 1}:`, {
        id: req.id,
        vendor: req.vendor?.businessName,
        messageCount: req.messages?.length || 0,
        messages: req.messages?.map((m) => ({
          sender: m.senderType,
          message: m.message.substring(0, 50) + '...',
        })),
      });
    });

    // unclaimed external quotes
    const external = await this.prisma.externalQuoteRequest.findMany({
      where: {
        userId,
        quoteRequestId: null,
      },
      include: {
        externalVendor: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const externalMapped = external.map((r) => ({
      id: r.id,
      email: r.email,
      phone: r.phone,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      userId: r.userId,
      vendorId: null,
      status: 'PENDING' as any,
      eventDate: r.eventDate,
      quoteMessage: null,
      fullName: r.fullName,
      eventType: r.eventType,
      eventLocation: r.eventLocation,
      numberOfGuests: r.numberOfGuests,
      budgetRange: r.budgetRange,
      additionalDetails: r.additionalDetails || null,
      counterOfferMessage: null,
      counterOfferPrice: null,
      quoteAttachments: [] as string[],
      quotePrice: null,
      userResponse: null,
      deliveryTime: null,
      escrowLockedAt: null,
      finalPrice: null,
      finalPriceConfirmed: false,
      finalPriceConfirmedAt: null,
      finalPriceDescription: null,
      vendor: r.externalVendor
        ? {
            id: r.externalVendor.id,
            businessName: r.externalVendor.name,
            category: r.externalVendor.category as any,
            city: r.externalVendor.city,
            profilePicture: null,
          }
        : null,
      messages: [] as any[],
      isExternal: true,
      externalVendorId: r.externalVendorId,
    }));

    // merge, newest first
    const combined = [...result, ...externalMapped].sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return combined;
  }

  // accept / decline / negotiate
  async respondToQuote(
    userId: string,
    quoteId: string,
    response: {
      userResponse: 'ACCEPT' | 'DECLINE' | 'NEGOTIATE';
      counterOfferPrice?: number;
      counterOfferMessage?: string;
      paymentIntentId?: string; // required on accept
    },
  ) {
    const quoteRequest = await this.prisma.quoteRequest.findUnique({
      where: { id: quoteId },
    });
    if (!quoteRequest || quoteRequest.userId !== userId) {
      throw new Error('Quote request not found');
    }

    let status = 'QUOTED';
    if (response.userResponse === 'ACCEPT') {
      // final price must be confirmed first
      if (!quoteRequest.finalPriceConfirmed) {
        throw new Error(
          'Vendor must confirm final price before you can accept the quote. Please wait for the vendor to confirm the final price.',
        );
      }

      if (!quoteRequest.finalPrice) {
        throw new Error(
          'Final price is not set. Please wait for the vendor to confirm the final price.',
        );
      }

      // verify PI before accept
      if (!response.paymentIntentId) {
        throw new Error('Payment intent ID is required when accepting a quote');
      }

      console.log('🔍 Verifying payment for quote acceptance...');
      const paymentIntent = await this.stripePaymentService.getPaymentStatus(
        response.paymentIntentId,
      );
      console.log('✅ Payment Intent Status:', paymentIntent.status);

      // escrow wants requires_capture (or succeeded)
      if (
        paymentIntent.status !== 'requires_capture' &&
        paymentIntent.status !== 'succeeded'
      ) {
        console.error(
          '❌ Payment not authorized for escrow. Status:',
          paymentIntent.status,
        );
        throw new Error(
          `Payment must be authorized (requires_capture) for escrow. Current status: ${paymentIntent.status}`,
        );
      }

      status = 'ACCEPTED';
    } else if (response.userResponse === 'DECLINE') {
      status = 'REJECTED';
    } else if (response.userResponse === 'NEGOTIATE') {
      status = 'NEGOTIATING';
    }

    const updateData: any = {
      userResponse: response.userResponse,
      counterOfferPrice: response.counterOfferPrice,
      counterOfferMessage: response.counterOfferMessage,
      status: status as any,
    };

    // lock escrow timestamp
    if (response.userResponse === 'ACCEPT' && status === 'ACCEPTED') {
      updateData.escrowLockedAt = new Date();
    }

    const updated = await this.prisma.quoteRequest.update({
      where: { id: quoteId },
      data: updateData,
    });

    // work order after authorized payment
    if (
      response.userResponse === 'ACCEPT' &&
      status === 'ACCEPTED' &&
      response.paymentIntentId
    ) {
      try {
        console.log('🔍 Verifying payment authorization for escrow...');
        const paymentIntent = await this.stripePaymentService.getPaymentStatus(
          response.paymentIntentId,
        );
        console.log('✅ Payment Intent Status:', paymentIntent.status);

        // re-check escrow status
        if (
          paymentIntent.status !== 'requires_capture' &&
          paymentIntent.status !== 'succeeded'
        ) {
          console.error(
            '❌ Payment not authorized for escrow. Status:',
            paymentIntent.status,
          );
          throw new Error(
            `Payment must be authorized (requires_capture) for escrow. Current status: ${paymentIntent.status}`,
          );
        }

        console.log('✅ Payment authorized (escrow), creating work order...');
        await this.workOrdersService.createWorkOrderFromQuote(
          quoteId,
          userId,
          response.paymentIntentId,
        );
        console.log('✅ Work order created successfully with escrow payment');
      } catch (error) {
        console.error('Failed to create work order:', error);
        throw error; // don't accept if work order fails
      }
    }

    return updated;
  }

  async sendMessage(
    quoteId: string,
    senderId: string,
    senderType: 'USER' | 'VENDOR',
    message: string,
    attachments: string[] = [],
    messageType: 'NORMAL' | 'WORK_SUBMISSION' = 'NORMAL',
  ) {
    return this.prisma.quoteMessage.create({
      data: {
        quoteRequestId: quoteId,
        senderId,
        senderType,
        message,
        attachments,
        messageType: messageType as any,
      },
    });
  }

  async getQuoteMessages(quoteId: string) {
    console.log(
      '💬 QuoteRequestsService: Fetching messages for quote:',
      quoteId,
    );
    const messages = await this.prisma.quoteMessage.findMany({
      where: { quoteRequestId: quoteId },
      orderBy: { createdAt: 'asc' },
    });
    console.log('💬 QuoteRequestsService: Found', messages.length, 'messages');
    console.log('💬 QuoteRequestsService: Messages:', messages);
    return messages;
  }

  async deleteUserQuoteRequest(userId: string, id: string, userEmail?: string) {
    const req = await this.prisma.quoteRequest.findUnique({ where: { id } });
    const isOwnerByUserId = !!req && req.userId === userId;
    const isOwnerByEmail = !!req && !!userEmail && req.email === userEmail;
    if (!req || (!isOwnerByUserId && !isOwnerByEmail)) {
      throw new Error('Quote request not found');
    }

    // keep quotes linked to a work order
    const existingWorkOrder = await this.prisma.workOrder.findFirst({
      where: { quoteRequestId: id },
      select: { id: true, status: true, paymentStatus: true },
    });

    if (existingWorkOrder) {
      throw new Error(
        'This request is linked to a completed job and payment, so it cannot be deleted. You can hide it in the UI, but the record must stay for payment history.',
      );
    }

    // delete messages then quote
    await this.prisma.quoteMessage.deleteMany({
      where: { quoteRequestId: id },
    });
    return this.prisma.quoteRequest.delete({ where: { id } });
  }
}
