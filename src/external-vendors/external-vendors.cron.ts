import { Cron } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { ExternalVendorsService } from './external-vendors.service';

@Injectable()
export class ExternalVendorsCron {
  private readonly logger = new Logger(ExternalVendorsCron.name);

  constructor(private readonly externalVendorsService: ExternalVendorsService) {}

  // daily OSM sync at 03:00
  @Cron('0 3 * * *')
  async handleDailySync() {
    this.logger.log('Running daily OSM external vendors sync...');
    try {
      const { total } = await this.externalVendorsService.syncAll();
      this.logger.log(`Daily OSM sync finished: ${total} vendors`);
    } catch (err: any) {
      this.logger.error(`Daily OSM sync failed: ${err?.message || err}`);
    }
  }
}
