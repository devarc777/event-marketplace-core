import { Module, forwardRef } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { EventReviewsController } from './event-reviews.controller';
import { EventReviewsService } from './event-reviews.service';
import { PrismaModule } from '../prisma/prisma.module';
// import { TicketmasterCronService } from './ticketmaster.cron';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WorkOrdersModule),
    PaymentsModule,
    MailModule,
  ],
  controllers: [EventsController, EventReviewsController],
  providers: [EventsService, EventReviewsService],
  exports: [EventsService, EventReviewsService],
})
export class EventsModule {}
