import { Module } from '@nestjs/common';
import { ExternalVendorsController } from './external-vendors.controller';
import { ExternalVendorsService } from './external-vendors.service';
import { ExternalVendorsCron } from './external-vendors.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [ExternalVendorsController],
  providers: [ExternalVendorsService, ExternalVendorsCron],
  exports: [ExternalVendorsService],
})
export class ExternalVendorsModule {}
