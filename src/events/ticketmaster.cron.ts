import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventsService } from './events.service';

@Injectable()
export class TicketmasterCronService {
  private readonly logger = new Logger(TicketmasterCronService.name);

  constructor(private readonly eventsService: EventsService) {}

  // hourly rolling TM sync (100 events)
  @Cron('0 0 * * * *')
  async syncTicketmasterRegularly() {
    try {
      this.logger.log('TM cron: rolling 100 events...');
      const res = await this.eventsService.syncTicketmasterRolling(100);
      this.logger.log(
        `TM cron: country=${res.country} page=${res.page} fetched=${res.fetched} inserted=${res.inserted} updated=${res.updated}`,
      );
    } catch (e) {
      this.logger.error('Ticketmaster cron sync failed', e);
    }
  }
}
