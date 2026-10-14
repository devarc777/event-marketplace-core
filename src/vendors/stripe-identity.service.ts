import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class StripeIdentityService {
  private stripe: Stripe;

  constructor(private prisma: PrismaService) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    this.stripe = new Stripe(stripeSecretKey);
  }

  // kick off a Stripe Identity session (or reuse an active one)
  async createVerificationSession(userId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
      if (!vendor) {
        throw new Error('Vendor not found');
      }

      if (vendor.stripeVerificationStatus === 'VERIFIED') {
        return {
          status: 'already_verified',
          message: 'Identity already verified',
        };
      }

      const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/vendor/onboarding/identity/return`;

      // local/dev shortcut: skip real Stripe Identity and mark verified
      if (process.env.STRIPE_IDENTITY_SIMPLE === 'true') {
        await this.prisma.vendor.update({
          where: { userId },
          data: {
            stripeVerificationStatus: 'VERIFIED',
            kycStatus: 'VERIFIED' as any,
            verifiedAt: new Date(),
          },
        });
        return {
          sessionId: 'simulated',
          url: `${returnUrl}?status=verified&simulated=1`,
          status: 'verified',
        };
      }

      // reuse an in-progress session instead of creating another
      if (vendor.stripeVerificationSessionId) {
        try {
          const existingSession = await this.stripe.identity.verificationSessions.retrieve(
            vendor.stripeVerificationSessionId,
          );

          if (
            existingSession.status === 'requires_input' ||
            existingSession.status === 'processing'
          ) {
            return {
              sessionId: existingSession.id,
              url: existingSession.url,
              status: existingSession.status,
            };
          }
        } catch (error) {
          console.log('Existing session not found or invalid, creating new one');
        }
      }

      // document upload only — no live capture / selfie
      const session = await this.stripe.identity.verificationSessions.create({
        type: 'document',
        metadata: {
          userId,
          vendorId: vendor.id,
        },
        options: {
          document: {
            require_live_capture: false,
            require_matching_selfie: false,
          },
        },
        return_url: returnUrl,
      });

      await this.prisma.vendor.update({
        where: { userId },
        data: {
          stripeVerificationSessionId: session.id,
          stripeVerificationStatus: 'PROCESSING',
        },
      });

      return {
        sessionId: session.id,
        url: session.url,
        status: session.status,
      };
    } catch (error) {
      console.error('Error creating Stripe verification session:', error);
      throw error;
    }
  }

  // pull latest status from Stripe and sync the vendor row
  async getVerificationStatus(userId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: {
          stripeVerificationSessionId: true,
          stripeVerificationStatus: true,
          stripeVerificationReportId: true,
          kycStatus: true,
          verifiedAt: true,
        },
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      if (vendor.stripeVerificationSessionId) {
        try {
          const session =
            await this.stripe.identity.verificationSessions.retrieve(
              vendor.stripeVerificationSessionId,
            );

          // map Stripe session status → our enum
          let mappedStatus:
            | 'NOT_STARTED'
            | 'PROCESSING'
            | 'VERIFIED'
            | 'REQUIRES_INPUT'
            | 'CANCELED'
            | 'FAILED' = 'PROCESSING';

          if (session.status === 'verified') {
            mappedStatus = 'VERIFIED';
          } else if (session.status === 'requires_input') {
            mappedStatus = 'REQUIRES_INPUT';
          } else if (session.status === 'canceled') {
            mappedStatus = 'CANCELED';
          } else if (session.status === 'processing') {
            mappedStatus = 'PROCESSING';
          }

          if (mappedStatus !== vendor.stripeVerificationStatus) {
            const reportId =
              typeof session.last_verification_report === 'string'
                ? session.last_verification_report
                : session.last_verification_report?.id;

            await this.prisma.vendor.update({
              where: { userId },
              data: {
                stripeVerificationStatus: mappedStatus,
                stripeVerificationReportId: reportId,
                kycStatus:
                  mappedStatus === 'VERIFIED' ? 'VERIFIED' : vendor.kycStatus,
                verifiedAt:
                  mappedStatus === 'VERIFIED' && !vendor.verifiedAt
                    ? new Date()
                    : vendor.verifiedAt,
              },
            });
          }

          return {
            status: mappedStatus,
            sessionId: session.id,
            sessionStatus: session.status,
            lastError: session.last_error,
            verifiedAt: vendor.verifiedAt,
          };
        } catch (stripeError) {
          console.error('Error fetching from Stripe:', stripeError);
          // fall back to whatever we last stored
          return {
            status: vendor.stripeVerificationStatus,
            cached: true,
          };
        }
      }

      return {
        status: vendor.stripeVerificationStatus,
        kycStatus: vendor.kycStatus,
        verifiedAt: vendor.verifiedAt,
      };
    } catch (error) {
      console.error('Error getting verification status:', error);
      throw error;
    }
  }

  // Stripe Identity webhook fan-out
  async handleWebhook(event: Stripe.Event) {
    try {
      switch (event.type) {
        case 'identity.verification_session.verified':
        case 'identity.verification_session.requires_input':
        case 'identity.verification_session.processing':
        case 'identity.verification_session.canceled':
          const session = event.data.object;
          await this.updateVerificationFromSession(session);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
      throw error;
    }
  }

  // persist status / report id from a Stripe session object
  private async updateVerificationFromSession(
    session: Stripe.Identity.VerificationSession,
  ) {
    const userId = session.metadata?.userId;
    if (!userId) {
      console.error('No userId in session metadata');
      return;
    }

    let mappedStatus:
      | 'NOT_STARTED'
      | 'PROCESSING'
      | 'VERIFIED'
      | 'REQUIRES_INPUT'
      | 'CANCELED'
      | 'FAILED' = 'PROCESSING';

    if (session.status === 'verified') {
      mappedStatus = 'VERIFIED';
    } else if (session.status === 'requires_input') {
      mappedStatus = 'REQUIRES_INPUT';
    } else if (session.status === 'canceled') {
      mappedStatus = 'CANCELED';
    } else if (session.status === 'processing') {
      mappedStatus = 'PROCESSING';
    }

    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });

    const reportId =
      typeof session.last_verification_report === 'string'
        ? session.last_verification_report
        : session.last_verification_report?.id;

    await this.prisma.vendor.update({
      where: { userId },
      data: {
        stripeVerificationStatus: mappedStatus,
        stripeVerificationReportId: reportId,
        stripeVerificationData: session as any,
        kycStatus: mappedStatus === 'VERIFIED' ? 'VERIFIED' : vendor?.kycStatus,
        verifiedAt:
          mappedStatus === 'VERIFIED' && !vendor?.verifiedAt
            ? new Date()
            : vendor?.verifiedAt,
      },
    });

    console.log(
      `Updated verification status for user ${userId}: ${mappedStatus}`,
    );
  }

  // cancel Stripe session and reset vendor identity fields
  async cancelVerification(userId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId } });

      if (!vendor || !vendor.stripeVerificationSessionId) {
        throw new Error('No active verification session found');
      }

      try {
        await this.stripe.identity.verificationSessions.cancel(
          vendor.stripeVerificationSessionId,
        );
      } catch (error) {
        console.log(
          'Could not cancel Stripe session (may already be completed):',
          error,
        );
      }

      await this.prisma.vendor.update({
        where: { userId },
        data: {
          stripeVerificationStatus: 'NOT_STARTED',
          stripeVerificationSessionId: null,
        },
      });

      return { success: true, message: 'Verification session cancelled' };
    } catch (error) {
      console.error('Error cancelling verification:', error);
      throw error;
    }
  }
}
