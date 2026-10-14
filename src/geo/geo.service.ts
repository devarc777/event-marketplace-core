import { Injectable, Logger } from '@nestjs/common';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  private looksLikeSubArea(value: string): boolean {
    const v = value.toLowerCase();
    return /\b(model town|phase|sector|block|colony|society|scheme|mohalla|neighbou?rhood)\b/.test(
      v,
    );
  }

  private normalizeAdminToCity(value: string): string {
    return value
      .replace(/\b(district|division|tehsil|county|region|province|governorate)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private looksLikeProvinceOrCountry(value: string): boolean {
    const v = value.toLowerCase().trim();
    if (!v) return true;

    if (
      /\b(province|state|country|region|governorate|oblast|territory|federal)\b/.test(v)
    ) {
      return true;
    }

    const blocked = new Set([
      'pakistan',
      'punjab',
      'sindh',
      'khyber pakhtunkhwa',
      'balochistan',
      'islamabad capital territory',
      'gilgit-baltistan',
      'azad jammu and kashmir',
      'azad kashmir',
    ]);
    return blocked.has(v);
  }

  private pickCityFromDisplayName(displayName?: string): string | null {
    if (typeof displayName !== 'string' || !displayName.trim()) return null;
    const parts = displayName.split(',').map((p) => p.trim()).filter(Boolean);

    for (const part of parts) {
      if (this.looksLikeSubArea(part)) continue;
      if (this.looksLikeProvinceOrCountry(part)) continue;
      if (/^\d+$/.test(part)) continue;
      return part;
    }
    return null;
  }

  private getString(obj: JsonRecord, key: string): string | undefined {
    const value = obj[key];
    return typeof value === 'string' ? value : undefined;
  }

  private finalizeCityLabel(value: string): string | null {
    const normalized = this.normalizeAdminToCity(value).trim();
    if (!normalized) return null;
    if (this.looksLikeSubArea(normalized)) return null;
    if (this.looksLikeProvinceOrCountry(normalized)) return null;
    return normalized;
  }

  private pickCityLikeLabel(address: JsonRecord, displayName?: string): string | null {
    const cityCandidates = [
      this.getString(address, 'city'),
      this.getString(address, 'town'),
      this.getString(address, 'village'),
      this.getString(address, 'municipality'),
    ];

    for (const value of cityCandidates) {
      if (!value?.trim()) continue;
      if (this.looksLikeSubArea(value)) continue;
      if (this.looksLikeProvinceOrCountry(value)) continue;
      return value.trim();
    }

    const parentCityCandidates = [
      this.getString(address, 'city_district'),
      this.getString(address, 'county'),
      this.getString(address, 'state_district'),
    ];
    for (const value of parentCityCandidates) {
      if (!value?.trim()) continue;
      const normalized = this.normalizeAdminToCity(value);
      if (!normalized) continue;
      if (this.looksLikeSubArea(normalized)) continue;
      if (this.looksLikeProvinceOrCountry(normalized)) continue;
      return normalized;
    }

    const fromDisplay = this.pickCityFromDisplayName(displayName);
    if (fromDisplay) return fromDisplay;

    for (const value of cityCandidates) {
      if (value?.trim()) return value.trim();
    }

    const state = this.getString(address, 'state');
    return state?.trim() || null;
  }

  async reverseGeocode(lat: number, lon: number): Promise<string> {
    const fallback = `${Number.isFinite(lat) ? lat.toFixed(4) : lat}, ${
      Number.isFinite(lon) ? lon.toFixed(4) : lon
    }`;

    const fetchFn = globalThis.fetch;
    if (!fetchFn) {
      this.logger.warn('Global fetch is not available; using fallback coords label.');
      return fallback;
    }

    const nominatimUrl = new URL('https://nominatim.openstreetmap.org/reverse');
    nominatimUrl.searchParams.set('format', 'jsonv2');
    nominatimUrl.searchParams.set('lat', String(lat));
    nominatimUrl.searchParams.set('lon', String(lon));
    nominatimUrl.searchParams.set('zoom', '10');
    nominatimUrl.searchParams.set('addressdetails', '1');

    const headers: Record<string, string> = {
      'User-Agent': 'Evenz (contact: webmaster@evenzs.com)',
      Accept: 'application/json',
      'Accept-Language': 'en',
    };

    try {
      const res = await fetchFn(nominatimUrl.toString(), { headers, method: 'GET' });
      if (res.ok) {
        const dataUnknown: unknown = await res.json();
        const data = (dataUnknown ?? {}) as JsonRecord;
        const address = (data.address as JsonRecord | undefined) ?? {};
        const displayName = this.getString(data, 'display_name');
        const label = this.pickCityLikeLabel(address, displayName);
        if (label?.trim()) {
          return this.finalizeCityLabel(label) ?? label.trim();
        }
      } else {
        this.logger.warn(`Nominatim reverse failed: ${res.status} ${res.statusText}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Nominatim reverse error: ${message}`);
    }

    try {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/reverse');
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lon));
      url.searchParams.set('count', '1');
      url.searchParams.set('language', 'en');

      const res = await fetchFn(url.toString(), { method: 'GET' });
      if (!res.ok) return fallback;

      const dataUnknown: unknown = await res.json();
      const data = (dataUnknown ?? {}) as JsonRecord;
      const results = Array.isArray(data.results) ? (data.results as JsonRecord[]) : [];
      const first = results[0] ?? {};
      const name = this.getString(first, 'name');
      const admin2 = this.getString(first, 'admin2');
      const admin1 = this.getString(first, 'admin1');
      const admin2Norm = admin2?.trim() ? this.normalizeAdminToCity(admin2) : undefined;
      const label = [admin2Norm, name, admin1].find(
        (v) => typeof v === 'string' && v.trim() && !this.looksLikeSubArea(v),
      );
      if (typeof label === 'string' && label.trim()) {
        return this.finalizeCityLabel(label) ?? label.trim();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Open-Meteo reverse error: ${message}`);
    }

    return fallback;
  }
}

