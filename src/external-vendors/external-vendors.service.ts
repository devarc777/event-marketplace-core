import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const OVERPASS_ENDPOINTS = [
  'https://z.overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/cgi/interpreter',
];

const OVERPASS_USER_AGENT = 'EvenzsBot/1.0 (+https://evenzs.com)';

function overpassRequestHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': OVERPASS_USER_AGENT,
    Accept: 'application/json',
  };
}

const OVERPASS_TRANSIENT_HTTP = new Set([429, 502, 503, 504]);
const OVERPASS_ATTEMPTS_PER_ENDPOINT = 5;
const OVERPASS_QUERY_TIMEOUT_SEC = 75;
const SYNC_GRID_ROWS = 2;
const SYNC_GRID_COLS = 2;
const METRO_MIN_VENDORS_WITH_IMAGE = 10;
const SEED_SOURCE = 'EVENZS_SEED';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function subdivideBbox(
  bbox: [number, number, number, number],
  rows: number,
  cols: number,
): [number, number, number, number][] {
  const [s, w, n, e] = bbox;
  const latStep = (n - s) / rows;
  const lonStep = (e - w) / cols;
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push([
        s + r * latStep,
        w + c * lonStep,
        s + (r + 1) * latStep,
        w + (c + 1) * lonStep,
      ]);
    }
  }
  return out;
}

// Overpass bboxes [south, west, north, east]
const SYNC_REGIONS: {
  name: string;
  bbox: [number, number, number, number];
  gridRows?: number;
  gridCols?: number;
}[] = [
  // North America
  { name: 'AMERICA', bbox: [40.48, -74.25, 40.92, -73.7] }, // NYC
  { name: 'AMERICA', bbox: [33.7, -118.67, 34.34, -118.15] }, // LA
  { name: 'AMERICA', bbox: [41.64, -87.94, 42.02, -87.52] }, // Chicago
  { name: 'AMERICA', bbox: [29.52, -95.55, 30.02, -95.02] }, // Houston
  { name: 'AMERICA', bbox: [25.55, -80.35, 25.95, -80.1] }, // Miami
  { name: 'AMERICA', bbox: [37.7, -122.52, 37.84, -122.35] }, // San Francisco
  { name: 'AMERICA', bbox: [47.49, -122.42, 47.73, -122.24] }, // Seattle
  { name: 'AMERICA', bbox: [33.62, -84.55, 33.88, -84.32] }, // Atlanta
  { name: 'AMERICA', bbox: [42.23, -71.2, 42.4, -71.0] }, // Boston
  { name: 'AMERICA', bbox: [32.66, -96.98, 32.9, -96.7] }, // Dallas
  { name: 'AMERICA', bbox: [30.18, -97.88, 30.42, -97.58] }, // Austin
  { name: 'AMERICA', bbox: [39.61, -105.09, 39.82, -104.82] }, // Denver
  { name: 'AMERICA', bbox: [33.29, -112.2, 33.62, -111.93] }, // Phoenix
  { name: 'AMERICA', bbox: [43.58, -79.64, 43.85, -79.12] }, // Toronto
  { name: 'AMERICA', bbox: [49.2, -123.27, 49.35, -123.0] }, // Vancouver
  { name: 'AMERICA', bbox: [19.25, -99.28, 19.5, -98.95] }, // Mexico City
  // Europe
  { name: 'EUROPE', bbox: [51.28, -0.51, 51.69, 0.33] }, // London
  { name: 'EUROPE', bbox: [48.75, 2.22, 48.95, 2.47] }, // Paris
  { name: 'EUROPE', bbox: [52.42, 13.32, 52.59, 13.55] }, // Berlin
  { name: 'EUROPE', bbox: [40.35, -3.79, 40.47, -3.62] }, // Madrid
  { name: 'EUROPE', bbox: [41.79, 12.42, 42.0, 12.55] }, // Rome
  { name: 'EUROPE', bbox: [52.33, 4.75, 52.42, 5.08] }, // Amsterdam
  { name: 'EUROPE', bbox: [48.06, 11.45, 48.22, 11.65] }, // Munich
  { name: 'EUROPE', bbox: [53.3, -6.38, 53.4, -6.18] }, // Dublin
  { name: 'EUROPE', bbox: [41.35, 2.05, 41.47, 2.23] }, // Barcelona
  { name: 'EUROPE', bbox: [45.41, 9.09, 45.52, 9.23] }, // Milan
  { name: 'EUROPE', bbox: [59.28, 18.0, 59.38, 18.15] }, // Stockholm
  { name: 'EUROPE', bbox: [48.15, 16.25, 48.28, 16.45] }, // Vienna
];

// marketplace geo: America/Europe (+ legacy US_* metros)
const MARKETPLACE_REGION_PREFIXES = ['AMERICA', 'EUROPE', 'US_'] as const;

// HTTP timeout > Overpass [timeout:] (nwr can run long)
const OVERPASS_TIMEOUT_MS = 130000;

// upsert cap per sync run (override: EXTERNAL_VENDORS_SYNC_MAX)
const DEFAULT_MAX_EXTERNAL_VENDORS_SYNC = 2000;

const WEBSITE_FETCH_TIMEOUT_MS = 8000;

const DENY_OSM_KEYVALUES = [
  // bars/clubs — noise for catering-style mapping
  { key: 'amenity', values: ['bar', 'pub', 'nightclub', 'biergarten', 'stripclub', 'casino'] },
  // religious/community — not marketplace vendors
  {
    key: 'amenity',
    values: ['place_of_worship', 'chapel', 'monastery', 'church', 'mosque', 'synagogue', 'temple'],
  },
  { key: 'shop', values: ['liquor', 'tobacco', 'cigarettes', 'adult_store'] },
  { key: 'tourism', values: ['nightclub'] },
  { key: 'office', values: ['religion'] },
  { key: 'religion', values: ['christian', 'muslim', 'hindu', 'buddhist', 'jewish', 'sikh'] },
] as const;

function isDenied(tags: Record<string, string>, name?: string): boolean {
  for (const { key, values } of DENY_OSM_KEYVALUES) {
    const v = tags[key];
    // widen readonly tuple for .includes()
    if (v && (values as readonly string[]).includes(v)) return true;
  }

  const nm = (name || tags['name'] || '').toLowerCase();
  // name denylist when tags are missing
  return (
    /\bbar\b/.test(nm) ||
    /\bpub\b/.test(nm) ||
    /\bnightclub\b/.test(nm) ||
    /\bbrewery\b/.test(nm) ||
    /\btaproom\b/.test(nm) ||
    /\bcasino\b/.test(nm) ||
    /\batheist\b/.test(nm) ||
    /\bchurch\b/.test(nm) ||
    /\bmosque\b/.test(nm) ||
    /\btemple\b/.test(nm) ||
    /\bgurdwara\b/.test(nm) ||
    /\bsynagogue\b/.test(nm) ||
    /\bchapel\b/.test(nm) ||
    /\bministry\b/.test(nm) ||
    /\bparish\b/.test(nm) ||
    /\bcathedral\b/.test(nm)
  );
}

// ingest + marketplace: catering + flowers only
const INGEST_CATEGORIES = ['CATERING', 'FLOWERS'] as const;
type IngestCategory = (typeof INGEST_CATEGORIES)[number];

const STOCK_IMAGE: Record<IngestCategory, string> = {
  CATERING:
    'https://images.unsplash.com/photo-1555244162-803834f70033?w=800&q=80&auto=format&fit=crop',
  FLOWERS:
    'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&q=80&auto=format&fit=crop',
};

const STOCK_IMAGE_URLS = Object.values(STOCK_IMAGE);

const AUSTIN_DALLAS_SEED_VENDORS: {
  externalId: string;
  region: string;
  name: string;
  category: IngestCategory;
  city: string;
  email: string;
  website: string;
  imageUrl: string;
  lat: number;
  lon: number;
}[] = [
  {
    externalId: 'floor-atx-cat-1',
    region: 'US_TEXAS_AUSTIN',
    name: 'Austin Table Catering',
    category: 'CATERING',
    city: 'Austin',
    email: 'austin.table.catering@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.CATERING,
    lat: 30.2672,
    lon: -97.7431,
  },
  {
    externalId: 'floor-atx-photo-1',
    region: 'US_TEXAS_AUSTIN',
    name: 'Capitol View Catering',
    category: 'CATERING',
    city: 'Austin',
    email: 'capitol.view.catering@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.CATERING,
    lat: 30.2747,
    lon: -97.7405,
  },
  {
    externalId: 'floor-atx-flw-1',
    region: 'US_TEXAS_AUSTIN',
    name: 'Hill Country Florals',
    category: 'FLOWERS',
    city: 'Austin',
    email: 'hillcountry.florals@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.FLOWERS,
    lat: 30.3072,
    lon: -97.7559,
  },
  {
    externalId: 'floor-atx-cat-2',
    region: 'US_TEXAS_AUSTIN',
    name: 'South Lamar Event Kitchen',
    category: 'CATERING',
    city: 'Austin',
    email: 'southlamar.kitchen@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.CATERING,
    lat: 30.2458,
    lon: -97.7657,
  },
  {
    externalId: 'floor-atx-photo-2',
    region: 'US_TEXAS_AUSTIN',
    name: 'Zilker Garden Florals',
    category: 'FLOWERS',
    city: 'Austin',
    email: 'zilker.garden.florals@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.FLOWERS,
    lat: 30.2849,
    lon: -97.7341,
  },
  {
    externalId: 'floor-dfw-cat-1',
    region: 'US_TEXAS_DALLAS',
    name: 'Dallas Uptown Catering',
    category: 'CATERING',
    city: 'Dallas',
    email: 'uptown.catering.dfw@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.CATERING,
    lat: 32.7879,
    lon: -96.7997,
  },
  {
    externalId: 'floor-dfw-photo-1',
    region: 'US_TEXAS_DALLAS',
    name: 'Bishop Arts Kitchen Catering',
    category: 'CATERING',
    city: 'Dallas',
    email: 'bishop.arts.kitchen@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.CATERING,
    lat: 32.7831,
    lon: -96.7796,
  },
  {
    externalId: 'floor-dfw-flw-1',
    region: 'US_TEXAS_DALLAS',
    name: 'Prairie Creek Florist',
    category: 'FLOWERS',
    city: 'Dallas',
    email: 'prairiecreek.florist@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.FLOWERS,
    lat: 32.8065,
    lon: -96.7994,
  },
  {
    externalId: 'floor-dfw-cat-2',
    region: 'US_TEXAS_DALLAS',
    name: 'Trinity River Events Catering',
    category: 'CATERING',
    city: 'Dallas',
    email: 'trinity.events@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.CATERING,
    lat: 32.7767,
    lon: -96.797,
  },
  {
    externalId: 'floor-dfw-photo-2',
    region: 'US_TEXAS_DALLAS',
    name: 'Knox Henderson Blooms',
    category: 'FLOWERS',
    city: 'Dallas',
    email: 'knox.henderson.blooms@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.FLOWERS,
    lat: 32.8151,
    lon: -96.8704,
  },
  {
    externalId: 'floor-atx-flw-2',
    region: 'US_TEXAS_AUSTIN',
    name: 'Lady Bird Blooms',
    category: 'FLOWERS',
    city: 'Austin',
    email: 'ladybird.blooms@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.FLOWERS,
    lat: 30.2591,
    lon: -97.739,
  },
  {
    externalId: 'floor-dfw-flw-2',
    region: 'US_TEXAS_DALLAS',
    name: 'Oak Lawn Floral Design',
    category: 'FLOWERS',
    city: 'Dallas',
    email: 'oaklawn.floral@evenzs.app',
    website: 'https://evenzs.com',
    imageUrl: STOCK_IMAGE.FLOWERS,
    lat: 32.8138,
    lon: -96.8119,
  },
];

function mapOsmToVendorCategory(tags: Record<string, string>, name?: string): string | null {
  if (isDenied(tags, name)) return null;

  const shop = tags['shop'];
  const craft = tags['craft'];
  const amenity = tags['amenity'];

  if (shop === 'florist' || craft === 'florist') return 'FLOWERS';

  // prefer explicit catering tags over generic restaurants
  if (
    shop === 'catering' ||
    craft === 'caterer' ||
    craft === 'catering' ||
    tags['catering'] !== undefined ||
    tags['service:catering'] !== undefined
  ) {
    return 'CATERING';
  }
  if (amenity === 'restaurant' && (tags['catering'] || tags['service:catering'])) return 'CATERING';

  return null;
}

function buildOverpassQueriesForCategory(
  bbox: [number, number, number, number],
  category: IngestCategory,
  timeoutSec = OVERPASS_QUERY_TIMEOUT_SEC,
): string[] {
  const [s, w, n, e] = bbox;
  const mk = (predicateSuffixes: string[]) => {
    const body = predicateSuffixes
      .map((p) => `  nwr(${s},${w},${n},${e})${p};`)
      .join('\n');
    return `[out:json][timeout:${timeoutSec}];\n(\n${body}\n);\nout center;`;
  };

  switch (category) {
    case 'FLOWERS':
      return [
        mk(['["shop"="florist"]["contact:email"]', '["shop"="florist"]["email"]']),
        mk(['["craft"="florist"]["contact:email"]', '["craft"="florist"]["email"]']),
      ];
    case 'CATERING':
      return [
        mk(['["shop"="catering"]["contact:email"]', '["shop"="catering"]["email"]']),
        mk(['["craft"="caterer"]["contact:email"]', '["craft"="caterer"]["email"]']),
        mk(['["craft"="catering"]["contact:email"]', '["craft"="catering"]["email"]']),
        mk(['["catering"]["contact:email"]', '["catering"]["email"]']),
        mk(['["service:catering"]["contact:email"]', '["service:catering"]["email"]']),
        mk([
          '["amenity"="restaurant"]["catering"]["contact:email"]',
          '["amenity"="restaurant"]["catering"]["email"]',
        ]),
      ];
    default:
      throw new Error(`Unexpected ingest category: ${String(category)}`);
  }
}

function normalizeWebsiteUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function resolveUrl(href: string | undefined, base?: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function fetchPreviewImageFromWebsite(website: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
    const res = await fetch(website, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'EvenzsBot/1.0 (+https://evenzs.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const html = await res.text();

    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);

    const twitterMatch =
      !ogMatch &&
      (html.match(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/i));

    const href = (ogMatch && ogMatch[1]) || (twitterMatch && twitterMatch[1]);
    if (!href) return null;

    return resolveUrl(href, website);
  } catch {
    return null;
  }
}

@Injectable()
export class ExternalVendorsService {
  private readonly logger = new Logger(ExternalVendorsService.name);

  private syncRunInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  // marketplace filter: geo + real image (no stock)
  marketplaceExternalWhere(includeClaimed: boolean): Prisma.ExternalVendorWhereInput {
    const geoScope: Prisma.ExternalVendorWhereInput = {
      AND: [
        { imageUrl: { not: null } },
        { imageUrl: { not: '' } },
        { NOT: { imageUrl: { in: STOCK_IMAGE_URLS } } },
      ],
      category: { in: [...INGEST_CATEGORIES] },
      OR: MARKETPLACE_REGION_PREFIXES.map((prefix) => ({
        region: { startsWith: prefix },
      })),
    };
    if (includeClaimed) return geoScope;
    return { AND: [geoScope, { isClaimed: false }] };
  }

  // sync upsert cap (updates count too)
  private getMaxSyncPerRun(): number {
    const raw = this.configService.get<string | number>('EXTERNAL_VENDORS_SYNC_MAX');
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_EXTERNAL_VENDORS_SYNC;
  }

  private async runOverpassQueryWithRetries(
    query: string,
    regionName: string,
    category: IngestCategory,
    partLabel: string,
    maxToUpsert: number,
  ): Promise<number> {
    const logTag = `${regionName}/${category}${partLabel}`;
    let upsertedThisQuery = 0;

    endpointLoop: for (const endpoint of OVERPASS_ENDPOINTS) {
      for (let attempt = 0; attempt < OVERPASS_ATTEMPTS_PER_ENDPOINT; attempt++) {
        if (attempt > 0) {
          const backoff = 7000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 5000);
          this.logger.log(
            `Overpass ${logTag}: retry ${attempt + 1}/${OVERPASS_ATTEMPTS_PER_ENDPOINT} after ${Math.round(backoff / 1000)}s (${endpoint})`,
          );
          await sleep(backoff);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: overpassRequestHeaders(),
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          if (!res.ok) {
            if (OVERPASS_TRANSIENT_HTTP.has(res.status)) {
              this.logger.warn(
                `Overpass ${logTag} HTTP ${res.status} (attempt ${attempt + 1}, ${endpoint})`,
              );
              continue;
            }
            this.logger.warn(`Overpass ${logTag} failed HTTP ${res.status} (${endpoint})`);
            continue endpointLoop;
          }

          const json = await res.json();
          const elements = json.elements || [];
          let upserted = 0;

          this.logger.log(`Overpass ${logTag}: got ${elements.length} elements (${endpoint})`);

          for (const el of elements) {
            if (upsertedThisQuery >= maxToUpsert) break;

            const tags = el.tags || {};
            const rawEmail = tags['contact:email'] || tags['email'];
            const email = rawEmail && typeof rawEmail === 'string' ? rawEmail : null;
            if (!email) continue;

            const name = tags['name'] || tags['brand'] || 'Unknown';
            const mappedCategory = mapOsmToVendorCategory(tags, name);
            if (!mappedCategory || mappedCategory !== category) continue;

            const rawWebsite = tags['website'] || tags['contact:website'] || tags['url'];
            const website = normalizeWebsiteUrl(rawWebsite);

            let imageUrl =
              resolveUrl(tags['image'] || tags['image:logo'] || tags['logo'], website ?? undefined) ||
              null;
            if (!imageUrl && website) {
              imageUrl = await fetchPreviewImageFromWebsite(website);
            }
            if (!imageUrl) {
              imageUrl = STOCK_IMAGE[category] ?? STOCK_IMAGE.CATERING;
            }

            const externalId = `${el.type}/${el.id}`;
            const address = [
              tags['addr:street'],
              tags['addr:housenumber'],
              tags['addr:city'],
              tags['addr:state'],
              tags['addr:country'],
            ]
              .filter(Boolean)
              .join(', ');

            const lat = el.lat ?? el.center?.lat ?? null;
            const lon = el.lon ?? el.center?.lon ?? null;

            await this.prisma.externalVendor.upsert({
              where: {
                source_externalId: { source: 'OSM', externalId },
              },
              create: {
                source: 'OSM',
                externalId,
                name: String(name).slice(0, 500),
                email: String(email).slice(0, 255),
                phone: (tags['contact:phone'] || tags['phone'])?.slice(0, 100) || null,
                address: address.slice(0, 500) || null,
                city: tags['addr:city']?.slice(0, 200) || null,
                state: tags['addr:state']?.slice(0, 200) || null,
                country: tags['addr:country']?.slice(0, 200) || null,
                lat,
                lon,
                category: mappedCategory,
                website,
                imageUrl,
                region: regionName,
              },
              update: {
                name: String(name).slice(0, 500),
                email: String(email).slice(0, 255),
                phone: (tags['contact:phone'] || tags['phone'])?.slice(0, 100) || null,
                address: address.slice(0, 500) || null,
                city: tags['addr:city']?.slice(0, 200) || null,
                state: tags['addr:state']?.slice(0, 200) || null,
                country: tags['addr:country']?.slice(0, 200) || null,
                lat,
                lon,
                category: mappedCategory,
                website,
                imageUrl,
              },
            });

            upserted++;
            upsertedThisQuery++;
          }

          this.logger.log(`OSM sync ${logTag}: upserted ${upserted} (endpoint=${endpoint})`);
          return upsertedThisQuery;
        } catch (err: any) {
          clearTimeout(timeoutId);
          const msg = err?.message || err;
          const transient =
            err?.name === 'AbortError' || /fetch|timeout|ECONNRESET|ETIMEDOUT/i.test(String(msg));
          this.logger.warn(`Overpass ${logTag} exception (attempt ${attempt + 1}): ${msg}`);
          if (transient && attempt < OVERPASS_ATTEMPTS_PER_ENDPOINT - 1) {
            continue;
          }
        }
      }
    }

    this.logger.warn(`OSM sync ${logTag}: all endpoints failed`);
    return upsertedThisQuery;
  }

  private async syncCategoryForRegion(
    regionName: string,
    bbox: [number, number, number, number],
    category: IngestCategory,
    maxToUpsert: number,
  ): Promise<number> {
    const queries = buildOverpassQueriesForCategory(bbox, category);
    let total = 0;
    for (let qi = 0; qi < queries.length; qi++) {
      if (total >= maxToUpsert) break;
      const partLabel = queries.length > 1 ? ` [${qi + 1}/${queries.length}]` : '';
      const n = await this.runOverpassQueryWithRetries(
        queries[qi],
        regionName,
        category,
        partLabel,
        maxToUpsert - total,
      );
      total += n;
      if (qi < queries.length - 1) await sleep(1600);
    }
    return total;
  }

  async syncRegion(
    regionName: string,
    bbox: [number, number, number, number],
    maxToUpsert?: number,
  ): Promise<number> {
    const cap = maxToUpsert ?? this.getMaxSyncPerRun();
    let count = 0;
    for (const category of INGEST_CATEGORIES) {
      if (count >= cap) break;
      const remaining = cap - count;
      const n = await this.syncCategoryForRegion(regionName, bbox, category, remaining);
      count += n;
      await sleep(2200);
    }
    return count;
  }

  private async countMetroUnclaimedWithImages(): Promise<number> {
    return this.prisma.externalVendor.count({
      where: this.marketplaceExternalWhere(false),
    });
  }

  private async ensureAustinDallasMinimumVendorsWithImages(minimum: number): Promise<{ inserted: number }> {
    const current = await this.countMetroUnclaimedWithImages();
    if (current >= minimum) {
      this.logger.log(`Austin/Dallas unclaimed with images: ${current} (floor ${minimum}) — OK.`);
      return { inserted: 0 };
    }
    const need = minimum - current;
    let inserted = 0;
    for (const seed of AUSTIN_DALLAS_SEED_VENDORS) {
      if (inserted >= need) break;
      await this.prisma.externalVendor.upsert({
        where: {
          source_externalId: { source: SEED_SOURCE, externalId: seed.externalId },
        },
        create: {
          source: SEED_SOURCE,
          externalId: seed.externalId,
          name: seed.name,
          email: seed.email,
          phone: null,
          address: `${seed.city}, TX`,
          city: seed.city,
          state: 'TX',
          country: 'US',
          lat: seed.lat,
          lon: seed.lon,
          category: seed.category,
          website: seed.website,
          imageUrl: seed.imageUrl,
          region: seed.region,
        },
        update: {
          name: seed.name,
          email: seed.email,
          imageUrl: seed.imageUrl,
          website: seed.website,
          lat: seed.lat,
          lon: seed.lon,
          category: seed.category,
          region: seed.region,
        },
      });
      inserted++;
    }
    const after = await this.countMetroUnclaimedWithImages();
    this.logger.log(
      `Austin/Dallas floor: upserted ${inserted} curated listing(s); unclaimed with images ${current} → ${after} (target ≥${minimum}).`,
    );
    return { inserted };
  }

  // OSM + seed sync (upsert only; never deletes)
  async syncAll(): Promise<{
    total: number;
    skipped?: boolean;
    seeded?: number;
    metroWithImageCount?: number;
  }> {
    if (this.syncRunInProgress) {
      this.logger.warn(
        'OSM sync already running — skipping duplicate start (prevents Overpass 429).',
      );
      return { total: 0, skipped: true };
    }
    this.syncRunInProgress = true;
    try {
      return await this.runSyncAllLocked();
    } finally {
      this.syncRunInProgress = false;
    }
  }

  private async runSyncAllLocked(): Promise<{
    total: number;
    seeded: number;
    metroWithImageCount: number;
  }> {
    let total = 0;
    const maxSync = this.getMaxSyncPerRun();
    const regions = SYNC_REGIONS;

    const jobs: { name: string; bbox: [number, number, number, number] }[] = [];
    for (const region of regions) {
      const rows = region.gridRows ?? SYNC_GRID_ROWS;
      const cols = region.gridCols ?? SYNC_GRID_COLS;
      for (const sub of subdivideBbox(region.bbox, rows, cols)) {
        jobs.push({ name: region.name, bbox: sub });
      }
    }

    this.logger.log(
      `OSM sync: ${jobs.length} tiles (${regions.map((r) => r.name).join(' + ')}); up to ${maxSync} upserts.`,
    );

    const perJobCap = Math.max(1, Math.floor(maxSync / Math.max(1, jobs.length)));
    for (const job of jobs) {
      if (total >= maxSync) break;
      const n = await this.syncRegion(job.name, job.bbox, Math.min(perJobCap, maxSync - total));
      total += n;
      await sleep(4000);
    }
    for (const job of jobs) {
      if (total >= maxSync) break;
      const n = await this.syncRegion(job.name, job.bbox, maxSync - total);
      total += n;
      await sleep(3500);
    }

    this.logger.log(
      `OSM sync complete: ${total} upserts (cap ${maxSync}; updates count as upserts).`,
    );

    this.logCleanupSkipped();
    const { inserted: seeded } = await this.ensureAustinDallasMinimumVendorsWithImages(
      METRO_MIN_VENDORS_WITH_IMAGE,
    );
    const metroWithImageCount = await this.countMetroUnclaimedWithImages();

    return { total, seeded, metroWithImageCount };
  }

  // intentional: sync never deletes rows
  private logCleanupSkipped(): void {
    this.logger.log('External vendor DB cleanup skipped (no deletions on sync).');
  }

  // Overpass connectivity probe
  async runOverpassDebug(): Promise<{
    ok: boolean;
    endpoint: string;
    elementCount: number;
    remark?: string;
    error?: string;
    sampleNames: string[];
  }> {
    const bbox: [number, number, number, number] = [52.5, 13.3, 52.6, 13.5];
    const [s, w, n, e] = bbox;
    const query = `
[out:json][timeout:25];
(
  node(${s},${w},${n},${e})["contact:email"];
  node(${s},${w},${n},${e})["email"];
);
out body;
`.trim();
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: overpassRequestHeaders(),
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const json = await res.json().catch(() => ({}));
        const elements = json.elements || [];
        const sampleNames = elements.slice(0, 5).map((el: any) => (el.tags?.name || el.tags?.brand || 'no-name') as string);
        return {
          ok: res.ok,
          endpoint,
          elementCount: elements.length,
          remark: json.remark,
          error: json.error || (res.ok ? undefined : res.statusText),
          sampleNames,
        };
      } catch (err: any) {
        this.logger.warn(`Overpass debug ${endpoint}: ${err?.message}`);
        continue;
      }
    }
    return {
      ok: false,
      endpoint: 'none',
      elementCount: 0,
      error: 'All Overpass endpoints failed (timeout or network)',
      sampleNames: [],
    };
  }

  // marketplace list (unclaimed by default)
  async listForMarketplace(includeClaimed = false): Promise<any[]> {
    const where = this.marketplaceExternalWhere(includeClaimed);
    const list = await this.prisma.externalVendor.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return list.map((v) => this.mapExternalToMarketplace(v));
  }

  // paginated unclaimed marketplace list
  async listForMarketplacePaginated(skip: number, take: number): Promise<{ list: any[]; total: number }> {
    const where = this.marketplaceExternalWhere(false);
    const [list, total] = await Promise.all([
      this.prisma.externalVendor.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.externalVendor.count({ where }),
    ]);
    return { list: list.map((v) => this.mapExternalToMarketplace(v)), total };
  }

  private mapExternalToMarketplace(v: {
    id: string;
    name: string;
    category: string;
    city: string | null;
    email: string;
    imageUrl?: string | null;
  }) {
    return {
      id: v.id,
      isExternal: true,
      businessName: v.name,
      description: '',
      category: v.category,
      city: v.city || '',
      rating: 0,
      reviews: 0,
      profileImage: v.imageUrl || null,
      aiTags: [],
      email: v.email,
      firstName: '',
      lastName: '',
    };
  }

  // single external by id
  async getById(id: string) {
    return this.prisma.externalVendor.findUnique({
      where: { id },
    });
  }

  // claim token for signup link (7d)
  createClaimToken(externalVendorId: string): string {
    const secret = this.configService.get<string>('JWT_SECRET') || 'evenzs-claim-secret';
    const payload = JSON.stringify({
      externalVendorId,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
    const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sig}`;
  }

  // convert pending external quotes → real QuoteRequests
  private async convertUnconvertedForExternalVendor(externalVendorId: string, vendorId: string): Promise<void> {
    const unconverted = await this.prisma.externalQuoteRequest.findMany({
      where: { externalVendorId, quoteRequestId: null },
    });
    for (const eq of unconverted) {
      const qr = await this.prisma.quoteRequest.create({
        data: {
          vendorId,
          userId: eq.userId ?? undefined,
          fullName: eq.fullName,
          email: eq.email,
          phone: eq.phone,
          eventType: eq.eventType,
          eventDate: eq.eventDate,
          eventLocation: eq.eventLocation,
          numberOfGuests: eq.numberOfGuests,
          budgetRange: eq.budgetRange,
          additionalDetails: eq.additionalDetails ?? undefined,
          status: 'PENDING',
        },
      });
      await this.prisma.externalQuoteRequest.update({
        where: { id: eq.id },
        data: { quoteRequestId: qr.id },
      });
      this.logger.log(`Converted external quote request ${eq.id} -> quote request ${qr.id}`);
    }
  }

  // convert quotes for this user's claimed externals
  async ensureConvertedForVendor(userId: string): Promise<void> {
    const vendor = await this.prisma.vendor.findFirst({ where: { userId } });
    if (!vendor) return;
    const claimed = await this.prisma.externalVendor.findMany({
      where: { claimedByUserId: userId },
      select: { id: true },
    });
    for (const ext of claimed) {
      await this.convertUnconvertedForExternalVendor(ext.id, vendor.id);
    }
  }

  // verify claim token and attach to user
  async claimByToken(userId: string, token: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const parts = token.split('.');
      if (parts.length !== 2) return { ok: false, error: 'Invalid token' };
      const [payloadB64, sig] = parts;
      const secret = this.configService.get<string>('JWT_SECRET') || 'evenzs-claim-secret';
      const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
      if (sig !== expectedSig) return { ok: false, error: 'Invalid token' };
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (payload.exp < Date.now()) return { ok: false, error: 'Token expired' };
      const externalVendorId = payload.externalVendorId;
      if (!externalVendorId) return { ok: false, error: 'Invalid token' };
      const ext = await this.prisma.externalVendor.findUnique({ where: { id: externalVendorId } });
      if (!ext) return { ok: false, error: 'Vendor not found' };
      if (ext.isClaimed) return { ok: true };

      const vendor = await this.prisma.vendor.findFirst({ where: { userId } });
      if (!vendor) {
        await this.prisma.externalVendor.update({
          where: { id: externalVendorId },
          data: { isClaimed: true, claimedByUserId: userId },
        });
        this.logger.log(`External vendor ${externalVendorId} claimed by user ${userId} (no vendor profile yet, no conversions)`);
        return { ok: true };
      }

      await this.prisma.externalVendor.update({
        where: { id: externalVendorId },
        data: { isClaimed: true, claimedByUserId: userId },
      });
      this.logger.log(`External vendor ${externalVendorId} claimed by user ${userId}`);

      await this.convertUnconvertedForExternalVendor(externalVendorId, vendor.id);
      return { ok: true };
    } catch (e: any) {
      this.logger.warn('Claim token error:', e?.message);
      return { ok: false, error: e?.message || 'Invalid token' };
    }
  }
}
