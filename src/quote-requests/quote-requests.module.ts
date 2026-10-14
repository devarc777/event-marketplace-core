import { Module, forwardRef } from '@nestjs/common';
import { QuoteRequestsController } from './quote-requests.controller';
import { QuoteRequestsService } from './quote-requests.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { MailModule } from '../mail/mail.module';
import { ExternalVendorsModule } from '../external-vendors/external-vendors.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WorkOrdersModule),
    PaymentsModule,
    MailModule,
    ExternalVendorsModule,
  ],
  controllers: [QuoteRequestsController],
  providers: [QuoteRequestsService],
  exports: [QuoteRequestsService],
})
export class QuoteRequestsModule {}
