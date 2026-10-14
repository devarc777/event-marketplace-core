import { Controller, Get, Post } from '@nestjs/common';
import { ExternalVendorsService } from './external-vendors.service';

// OSM external vendor sync + debug listing
@Controller('external-vendors')
export class ExternalVendorsController {
  constructor(private readonly externalVendorsService: ExternalVendorsService) {}

  // full OSM sync (await — needed on Lambda); upserts only, no deletes
  @Get('sync')
  @Post('sync')
  async syncNow(): Promise<{
    message: string;
    total: number;
    skipped?: boolean;
    seeded?: number;
    metroWithImageCount?: number;
  }> {
    const result = await this.externalVendorsService.syncAll();
    if (result.skipped) {
      return {
        message: 'Sync already in progress — try again in a few minutes.',
        total: result.total,
        skipped: true,
      };
    }
    return {
      message: 'OSM external vendor sync completed.',
      total: result.total,
      seeded: result.seeded,
      metroWithImageCount: result.metroWithImageCount,
    };
  }

  // debug list (includes claimed)
  @Get()
  async list(): Promise<{ count: number; vendors: any[] }> {
    const vendors = await this.externalVendorsService.listForMarketplace(true);
    return { count: vendors.length, vendors };
  }

  // minimal Overpass probe (Berlin bbox)
  @Get('debug')
  async debug(): Promise<any> {
    return this.externalVendorsService.runOverpassDebug();
  }
}
