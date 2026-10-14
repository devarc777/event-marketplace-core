import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadsModule } from './uploads/uploads.module';
import { GeoModule } from './geo/geo.module';
import { EventsModule } from './events/events.module';
import { QuoteRequestsModule } from './quote-requests/quote-requests.module';
import { VendorsModule } from './vendors/vendors.module';
import { ExternalVendorsModule } from './external-vendors/external-vendors.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MailModule,
    PaymentsModule,
    UploadsModule,
    GeoModule,
    WorkOrdersModule,
    EventsModule,
    QuoteRequestsModule,
    ExternalVendorsModule,
    AiModule,
    VendorsModule,
  ],
})
export class AppModule {}
