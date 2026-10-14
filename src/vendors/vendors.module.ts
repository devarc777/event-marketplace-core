import { Module, forwardRef } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { StripeIdentityService } from './stripe-identity.service';
import { VendorOnboardingAiService } from './vendor-onboarding-ai.service';
import { VendorsController } from './vendors.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { MailModule } from '../mail/mail.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AiModule } from '../ai/ai.module';
import { ExternalVendorsModule } from '../external-vendors/external-vendors.module';

@Module({
  imports: [
    PrismaModule,
    ExternalVendorsModule,
    forwardRef(() => WorkOrdersModule),
    PaymentsModule,
    MailModule,
    UploadsModule,
    AiModule,
  ],
  providers: [VendorsService, StripeIdentityService, VendorOnboardingAiService],
  controllers: [VendorsController],
  exports: [VendorsService],
})
export class VendorsModule {}
