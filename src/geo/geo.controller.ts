import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { GeoService } from './geo.service';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  // GET /geo/reverse?lat=...&lon=...
  @Get('reverse')
  async reverse(
    @Query('lat') latRaw?: string,
    @Query('lon') lonRaw?: string,
  ): Promise<{ label: string }> {
    const lat = latRaw ? Number(latRaw) : NaN;
    const lon = lonRaw ? Number(lonRaw) : NaN;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new HttpException('lat and lon are required numeric query params', HttpStatus.BAD_REQUEST);
    }

    try {
      const label = await this.geoService.reverseGeocode(lat, lon);
      return { label };
    } catch (err: any) {
      throw new HttpException(
        err?.message || 'Reverse geocoding failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

