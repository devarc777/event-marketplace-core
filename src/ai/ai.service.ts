import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EventData {
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  city?: string;
  venue?: string;
  address?: string;
  basePrice?: number;
  category?: string;
  timezone?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly hfToken: string;
  private readonly hfApiUrl =
    'https://router.huggingface.co/models/openai/gpt-oss-20b';

  constructor(private configService: ConfigService) {
    this.hfToken = this.configService.get<string>('HF_TOKEN') || '';
  }

  // parse natural language â†’ event fields
  async parseEventFromText(userInput: string): Promise<EventData> {
    try {
      const systemPrompt = `You are an event planning assistant. Extract event details from the user's message and return ONLY a valid JSON object with these fields:
{
  "title": "string (required)",
  "description": "string (required) - write a short compelling description in neutral marketing tone. Do NOT copy the user's text; write 2-3 original sentences summarizing the event.",
  "startDate": "ISO 8601 date string (optional)",
  "endDate": "ISO 8601 date string (optional)",
  "location": "string (optional - venue or address if present, e.g., 'Gaddafi Stadium, Lahore')",
  "city": "string (optional, e.g., 'Lahore')",
  "venue": "string (optional)",
  "address": "string (optional)",
  "basePrice": "number (optional)",
  "category": "MUSIC | SPORTS | BUSINESS | ARTS | FOOD | TECHNOLOGY | HEALTH | EDUCATION | OTHER (optional)",
  "timezone": "string (optional, e.g., 'America/New_York')"
}

Rules:
- If date is mentioned but not specific, use reasonable defaults (today + 7 days for startDate)
- If only one date is mentioned, use it as startDate
- Extract city and location from the text (e.g., 'Gaddafi Stadium, Lahore')
- If price is mentioned, extract it as basePrice
- Return ONLY the JSON, no other text
- If a field is not mentioned, set it to null or omit it`;

      const userPrompt = `User request: "${userInput}"

Extract event details and return JSON:`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await fetch(this.hfApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages,
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Hugging Face API error: ${response.status} - ${errorText}`,
        );
        throw new Error(`Failed to parse event: ${response.statusText}`);
      }

      const data = await response.json();

      // pick text from whatever shape HF returns
      let aiResponse = '';
      if (data.choices && data.choices[0] && data.choices[0].message) {
        aiResponse = data.choices[0].message.content;
      } else if (data.generated_text) {
        aiResponse = data.generated_text;
      } else if (typeof data === 'string') {
        aiResponse = data;
      }

      // grab the JSON blob from the reply
      let eventData: EventData;

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          eventData = JSON.parse(jsonMatch[0]);
        } catch (e) {
          this.logger.warn(
            'Failed to parse JSON from AI response, using fallback',
          );
          eventData = this.fallbackParsing(userInput);
        }
      } else {
        this.logger.warn('No JSON found in AI response, using fallback');
        eventData = this.fallbackParsing(userInput);
      }

      // backfill anything the model skipped
      if (!eventData.title) {
        eventData.title = this.extractTitle(userInput) || 'New Event';
      }
      if (!eventData.location && !eventData.address && !eventData.city) {
        const loc = this.extractLocation(userInput);
        if (loc.location) eventData.location = loc.location;
        if (loc.city) eventData.city = loc.city;
      }
      if (!eventData.startDate || !eventData.endDate) {
        const dt = this.extractDateTime(userInput);
        if (dt?.startDate)
          eventData.startDate = eventData.startDate || dt.startDate;
        if (dt?.endDate) eventData.endDate = eventData.endDate || dt.endDate;
      }
      if (!eventData.description) {
        eventData.description = this.generateDescription({
          title: eventData.title,
          location: eventData.location || eventData.city || undefined,
          startDate: eventData.startDate,
        });
      }

      return eventData;
    } catch (error) {
      this.logger.error(
        `Error parsing event from text: ${error.message}`,
        error.stack,
      );
      // regex fallback if HF fails
      return this.fallbackParsing(userInput);
    }
  }

  // regex-only parse when the model flakes
  private fallbackParsing(userInput: string): EventData {
    const title = this.extractTitle(userInput) || 'New Event';

    const dateTime = this.extractDateTime(userInput);
    const { location, city } = this.extractLocation(userInput);

    const priceMatch = userInput.match(
      /\$?\s*(\d{1,4})(?:\s*(?:usd|rs|pkr))?/i,
    );
    const basePrice = priceMatch ? parseFloat(priceMatch[1]) : undefined;

    const description = this.generateDescription({
      title,
      location: location || city,
      startDate: dateTime?.startDate,
    });

    return {
      title,
      description,
      startDate:
        dateTime?.startDate ||
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: dateTime?.endDate,
      location,
      city,
      basePrice,
    };
  }

  // rough title from free text
  private extractTitle(userInput: string): string | null {
    const text = userInput.trim().replace(/\s+/g, ' ');
    const lower = text.toLowerCase();

    // cut before "will take place" / "is happening" etc.
    const helperPattern =
      /(.*?)(\s+(will\s+take\s+place|is\s+happening|is\s+scheduled|shall\s+take\s+place))\b/i;
    const helperMatch = text.match(helperPattern);
    let base = helperMatch ? helperMatch[1] : text;

    // stop at first in/at/on
    const prepositions = [' in ', ' at ', ' on '];
    let cutIndex = -1;
    const lowerBase = base.toLowerCase();
    for (const p of prepositions) {
      const idx = lowerBase.indexOf(p);
      if (idx > 0 && (cutIndex === -1 || idx < cutIndex)) cutIndex = idx;
    }
    if (cutIndex > 0) base = base.slice(0, cutIndex);

    base = base.replace(/^\s*(a|an|the)\s+/i, '');
    base = base.replace(/[\s,:;.-]+$/g, '').trim();

    const words = base.split(/\s+/).slice(0, 8).join(' ');
    const cleaned = words.length ? words : base;
    return cleaned ? this.toTitleCase(cleaned) : null;
  }

  private extractLocation(userInput: string): {
    location?: string;
    city?: string;
  } {
    // venue/city after "at" / "in"
    const locRegex = /(at|in)\s+([^,.\n]+(?:\s*,\s*[^,.\n]+)?)/i;
    const m = userInput.match(locRegex);
    let location: string | undefined;
    let city: string | undefined;
    if (m && m[2]) {
      location = m[2].trim();
      // drop date/time noise glued onto the place
      location = location
        .replace(/\s+on\s+.+$/i, '')
        .replace(/\s+ending.*$/i, '')
        .replace(/\s+ends.*$/i, '')
        .replace(/\s+and\s+ends.*$/i, '')
        .replace(/\b(at\s*)?\d{1,2}(?::\d{1,2})?\s*(am|pm)\b/gi, '')
        .replace(/\b\d{1,2}\s*(am|pm)\b/gi, '')
        .replace(/\s+,\s*$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    const cityRegex =
      /\b(lahore|karachi|islamabad|new york|london|delhi|mumbai|paris|berlin|tokyo)\b/i;
    const cityMatch = (location || userInput).match(cityRegex);
    if (cityMatch) {
      city = this.toTitleCase(cityMatch[1]);
      if (
        location &&
        !location.toLowerCase().includes(cityMatch[1].toLowerCase())
      ) {
        location = `${location}, ${city}`;
      }
    }
    return { location, city };
  }

  private extractDateTime(
    userInput: string,
  ): { startDate?: string; endDate?: string } | null {
    const months: Record<string, number> = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      sept: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };

    // am/pm times (start + optional end)
    const timeRegex = /(\b\d{1,2})(?::(\d{1,2}))?[:]?\s*(am|pm)\b/gi;
    let hours = 9,
      minutes = 0,
      hasTime = false;
    let endHours: number | undefined,
      endMinutes: number | undefined,
      hasEndTime = false;

    const timeMatches = Array.from(userInput.matchAll(timeRegex));
    if (timeMatches.length >= 1) {
      const t1 = timeMatches[0];
      hasTime = true;
      hours = parseInt(t1[1], 10);
      minutes = t1[2] ? parseInt(t1[2], 10) : 0;
      const mer1 = (t1[3] || '').toLowerCase();
      if (mer1 === 'pm' && hours < 12) hours += 12;
      if (mer1 === 'am' && hours === 12) hours = 0;
    }
    if (timeMatches.length >= 2) {
      const t2 = timeMatches[1];
      endHours = parseInt(t2[1], 10);
      endMinutes = t2[2] ? parseInt(t2[2], 10) : 0;
      const mer2 = (t2[3] || '').toLowerCase();
      if (mer2 === 'pm' && endHours < 12) endHours = endHours + 12;
      if (mer2 === 'am' && endHours === 12) endHours = 0;
      hasEndTime = true;
    }

    // loose time if no am/pm matched
    if (!hasTime) {
      const fallback = /(\b\d{1,2})(?::(\d{1,2}))?[:]?\s*(am|pm)?\b/i.exec(
        userInput,
      );
      if (fallback) {
        hasTime = true;
        hours = parseInt(fallback[1], 10);
        minutes = fallback[2] ? parseInt(fallback[2], 10) : 0;
        const ampm = fallback[3]?.toLowerCase();
        if (ampm) {
          if (ampm === 'pm' && hours < 12) hours += 12;
          if (ampm === 'am' && hours === 12) hours = 0;
        }
      }
    }

    // "on 15 March" / "on March 15" / bare day-month
    const onDateRegexDayFirst = new RegExp(
      `on\\s+(\\b\\d{1,2}\\b)(?:st|nd|rd|th)?\\s+(\\b(?:${Object.keys(months).join('|')})\\b)(?:\\s+(\\d{4}))?`,
      'i',
    );
    const onDateMatchDayFirst = userInput.match(onDateRegexDayFirst);
    const onDateRegexMonthFirst = new RegExp(
      `on\\s+(\\b(?:${Object.keys(months).join('|')})\\b)\\s+(\\b\\d{1,2}\\b)(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`,
      'i',
    );
    const onDateMatchMonthFirst = userInput.match(onDateRegexMonthFirst);
    const dayMonthYear = new RegExp(
      `(\\b\\d{1,2}\\b)(?:st|nd|rd|th)?\\s+(\\b(?:${Object.keys(months).join('|')})\\b)(?:\\s+(\\d{4}))?`,
      'i',
    );
    const monthDayYear = new RegExp(
      `(\\b(?:${Object.keys(months).join('|')})\\b)\\s+(\\b\\d{1,2}\\b)(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`,
      'i',
    );
    const mdyMatch =
      onDateMatchDayFirst ||
      onDateMatchMonthFirst ||
      userInput.match(dayMonthYear) ||
      userInput.match(monthDayYear);

    let date: Date | null = null;
    if (mdyMatch) {
      let day: number;
      let month: number;
      let year: number;
      if (isNaN(parseInt(mdyMatch[1], 10))) {
        // month-first
        const monthName = mdyMatch[1].toLowerCase();
        month = months[monthName];
        day = parseInt(mdyMatch[2], 10);
        year = mdyMatch[3]
          ? parseInt(mdyMatch[3], 10)
          : new Date().getFullYear();
      } else {
        // day-first
        day = parseInt(mdyMatch[1], 10);
        const monthName = mdyMatch[2].toLowerCase();
        month = months[monthName];
        year = mdyMatch[3]
          ? parseInt(mdyMatch[3], 10)
          : new Date().getFullYear();
      }
      date = new Date(
        year,
        month,
        day,
        hasTime ? hours : 9,
        hasTime ? minutes : 0,
      );
      // past dates â†’ bump a year
      const now = new Date();
      if (date.getTime() < now.getTime()) {
        date.setFullYear(date.getFullYear() + 1);
      }
    }

    // ISO / slash fallbacks
    if (!date) {
      const iso = userInput.match(/(\d{4}-\d{2}-\d{2})/);
      if (iso) {
        const local = `${iso[1]}T${hasTime ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : '09:00'}`;
        date = this.fromLocalString(local);
      }
    }
    if (!date) {
      const slash = userInput.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (slash) {
        const parsed = new Date(slash[1]);
        if (!isNaN(parsed.getTime())) {
          parsed.setHours(hasTime ? hours : 9, hasTime ? minutes : 0, 0, 0);
          date = parsed;
        }
      }
    }

    if (!date) return null;
    const start = new Date(date);
    let end: Date | undefined;

    // second calendar date in the text â†’ endDate
    let secondDate: Date | undefined;
    try {
      const dayMonthYearG = new RegExp(
        `(\\b\\d{1,2}\\b)(?:st|nd|rd|th)?\\s+(\\b(?:${Object.keys(months).join('|')})\\b)(?:\\s+(\\d{4}))?`,
        'ig',
      );
      const monthDayYearG = new RegExp(
        `(\\b(?:${Object.keys(months).join('|')})\\b)\\s+(\\b\\d{1,2}\\b)(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`,
        'ig',
      );
      const foundDates: Array<{ day: number; month: number; year: number }> =
        [];
      const pushDate = (d: RegExpMatchArray, type: 'DMY' | 'MDY') => {
        if (type === 'DMY') {
          const day = parseInt(d[1], 10);
          const month = months[d[2].toLowerCase()];
          const year = d[3] ? parseInt(d[3], 10) : new Date().getFullYear();
          foundDates.push({ day, month, year });
        } else {
          const month = months[d[1].toLowerCase()];
          const day = parseInt(d[2], 10);
          const year = d[3] ? parseInt(d[3], 10) : new Date().getFullYear();
          foundDates.push({ day, month, year });
        }
      };
      for (const m of userInput.matchAll(dayMonthYearG))
        pushDate(m as RegExpMatchArray, 'DMY');
      for (const m of userInput.matchAll(monthDayYearG))
        pushDate(m as RegExpMatchArray, 'MDY');
      if (foundDates.length >= 2) {
        const e = foundDates[1];
        secondDate = new Date(
          e.year,
          e.month,
          e.day,
          hasEndTime ? (endHours ?? 21) : hasTime ? hours : 21,
          hasEndTime ? (endMinutes ?? 0) : hasTime ? minutes : 0,
          0,
          0,
        );
      }
    } catch {}
    if (secondDate) {
      end = secondDate;
    } else if (
      hasEndTime &&
      endHours !== undefined &&
      endMinutes !== undefined
    ) {
      end = new Date(start);
      end.setHours(endHours, endMinutes, 0, 0);
      // overnight: end before start â†’ next day
      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }
    } else if (hasTime) {
      // single time â†’ assume 3h
      end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    }
    return {
      startDate: this.toLocalString(start),
      endDate: end ? this.toLocalString(end) : undefined,
    };
  }

  // local wall time, no TZ: YYYY-MM-DDTHH:mm
  private toLocalString(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  // parse YYYY-MM-DDTHH:mm as local
  private fromLocalString(s: string): Date {
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return new Date(s);
    const [_, y, mo, d, h, mi] = m;
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      0,
      0,
    );
  }

  private generateDescription(input: {
    title: string;
    location?: string;
    startDate?: string;
  }): string {
    const parts: string[] = [];
    parts.push(`${input.title} â€” a memorable experience awaits.`);
    if (input.location) parts.push(`Join us at ${input.location}.`);
    if (input.startDate) {
      const d = new Date(input.startDate);
      const pretty = d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      parts.push(`Kicking off on ${pretty}.`);
    }
    parts.push('Enjoy great vibes and connect with fellow attendees.');
    return parts.join(' ');
  }

  private toTitleCase(s: string): string {
    return s.replace(
      /\w\S*/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase(),
    );
  }

  // USA / US / United States â†’ usa (etc.)
  private normalizeLocationForMatch(location: string): string {
    if (!location || typeof location !== 'string') return '';
    const lower = location.trim().toLowerCase();
    const countryNorm: Record<string, string> = {
      'us': 'usa',
      'u.s': 'usa',
      'u.s.a': 'usa',
      'u.s.a.': 'usa',
      'united states': 'usa',
      'united states of america': 'usa',
      'uk': 'uk',
      'u.k': 'uk',
      'united kingdom': 'uk',
      'uae': 'uae',
      'united arab emirates': 'uae',
    };
    return countryNorm[lower] ?? lower;
  }

  // match vendors to what the user asked for
  async suggestVendorsAndPackages(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    availableVendors: any[],
  ): Promise<{ message: string; vendorSuggestions: any[] }> {
    try {
      const fullContext = [
        ...conversationHistory,
        { role: 'user', content: userMessage },
      ]
        .map((msg) => `${msg.role}: ${msg.content}`)
        .join('\n');

      const requirements = this.extractRequirements(fullContext);

      const filteredVendors = this.filterVendorsByExactCriteria(
        availableVendors,
        requirements,
      );

      this.logger.log(
        `ðŸ” Requirements: ${JSON.stringify(requirements)} â†’ ${filteredVendors.length} vendors`,
      );

      if (filteredVendors.length === 0) {
        const loc = requirements.location || '';
        const locationLabel = loc === 'usa' ? 'USA' : loc.replace(/\b\w/g, (c) => c.toUpperCase());
        let message = requirements.location
          ? `No vendor found in ${locationLabel}.`
          : 'There is no vendor matching your requirements.';
        if (requirements.category) {
          message += ` No ${requirements.category.toLowerCase()} vendors found.`;
        }
        return { message: message.trim(), vendorSuggestions: [] };
      }

      const vendorSuggestions = filteredVendors.map((v) => {
        const services = v.services || v.newServices || [];
        const packages: Array<{ name: string; price: number; description: string }> = [];
        services.slice(0, 2).forEach((s: any) => {
          const pkg = s.packages;
          if (!pkg) return;
          const raw = typeof pkg === 'string' ? (() => { try { return JSON.parse(pkg); } catch { return null; } })() : pkg;
          if (raw && typeof raw === 'object') {
            const first = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
            if (first && (first.price ?? first.basePrice ?? first.cost)) {
              const price = Number(first.price ?? first.basePrice ?? first.cost);
              if (price > 0) {
                packages.push({
                  name: (s.name || 'Package') + (first.tier ? ` - ${first.tier}` : ''),
                  price,
                  description: (first.inclusions || first.description || '') as string,
                });
              }
            }
          }
        });
        return {
          id: v.id,
          businessName: v.businessName || v.name,
          category: v.category,
          city: v.city,
          rating: v.rating ?? v.averageRating ?? 0,
          packages: packages.slice(0, 2),
        };
      });

      let aiResponse = '';
      if (vendorSuggestions.length === 1) {
        const v = vendorSuggestions[0];
        aiResponse = `I found 1 vendor: ${v.businessName}.`;
        if (requirements.category) aiResponse += ` They offer ${(requirements.category || '').toLowerCase()} services.`;
        if (requirements.location) aiResponse += ` They are in ${v.city || requirements.location}.`;
        aiResponse += ' You can request a quote or view their profile below.';
      } else {
        aiResponse = `I found ${vendorSuggestions.length} vendors that match.`;
        if (requirements.category) aiResponse += ` All are ${(requirements.category || '').toLowerCase()} vendors.`;
        if (requirements.location) aiResponse += ` All are in ${(requirements.location || '').replace(/\b\w/g, (c) => c.toUpperCase())}.`;
        aiResponse += ' Here they are:';
      }

      return {
        message: aiResponse,
        vendorSuggestions,
      };
    } catch (error) {
      this.logger.error(
        `Error suggesting vendors: ${error.message}`,
        error.stack,
      );
      return this.preciseVendorSuggestions(userMessage, availableVendors);
    }
  }

  // category / location / price from latest user line
  private extractRequirements(context: string): {
    category?: string;
    exactPrice?: number;
    location?: string;
    minPrice?: number;
    maxPrice?: number;
    packageType?: string; // basic | standard | premium
  } {
    const lower = context.toLowerCase();
    const requirements: any = {};
    // latest user line wins over older chat turns
    const lastUserLine = context.split(/\n/).reverse().find((line) => /^\s*user:\s+/i.test(line));
    const categoryContext = lastUserLine ? lastUserLine.replace(/^\s*user:\s+/i, '').trim().toLowerCase() : lower;

    const categoryMap: Record<string, string> = {
      // photography
      photography: 'PHOTOGRAPHY',
      photographer: 'PHOTOGRAPHY',
      photographers: 'PHOTOGRAPHY',
      photo: 'PHOTOGRAPHY',
      photos: 'PHOTOGRAPHY',
      photographic: 'PHOTOGRAPHY',
      photoshoot: 'PHOTOGRAPHY',
      'photo shoot': 'PHOTOGRAPHY',
      'event photography': 'PHOTOGRAPHY',
      'wedding photography': 'PHOTOGRAPHY',
      'portrait photography': 'PHOTOGRAPHY',
      camera: 'PHOTOGRAPHY',
      cameraman: 'PHOTOGRAPHY',
      camerawoman: 'PHOTOGRAPHY',

      // videography
      videography: 'VIDEOGRAPHY',
      videographer: 'VIDEOGRAPHY',
      videographers: 'VIDEOGRAPHY',
      video: 'VIDEOGRAPHY',
      videos: 'VIDEOGRAPHY',
      'video production': 'VIDEOGRAPHY',
      'video service': 'VIDEOGRAPHY',
      'event video': 'VIDEOGRAPHY',
      'wedding video': 'VIDEOGRAPHY',
      cinematography: 'VIDEOGRAPHY',
      cinematographer: 'VIDEOGRAPHY',
      filming: 'VIDEOGRAPHY',
      film: 'VIDEOGRAPHY',
      filmmaker: 'VIDEOGRAPHY',

      // catering
      catering: 'CATERING',
      caterer: 'CATERING',
      caterers: 'CATERING',
      food: 'CATERING',
      'food service': 'CATERING',
      'catering service': 'CATERING',
      'event catering': 'CATERING',
      'wedding catering': 'CATERING',
      'catering company': 'CATERING',
      'catering business': 'CATERING',
      meal: 'CATERING',
      meals: 'CATERING',
      'catering package': 'CATERING',
      buffet: 'CATERING',
      banquet: 'CATERING',
      chef: 'CATERING',
      chefs: 'CATERING',
      cooking: 'CATERING',

      // music / dj
      music: 'MUSIC_DJ',
      dj: 'MUSIC_DJ',
      djs: 'MUSIC_DJ',
      'disc jockey': 'MUSIC_DJ',
      'disc jockeys': 'MUSIC_DJ',
      deejay: 'MUSIC_DJ',
      deejays: 'MUSIC_DJ',
      musician: 'MUSIC_DJ',
      musicians: 'MUSIC_DJ',
      band: 'MUSIC_DJ',
      bands: 'MUSIC_DJ',
      'live music': 'MUSIC_DJ',
      entertainment: 'MUSIC_DJ',
      sound: 'MUSIC_DJ',
      'sound system': 'MUSIC_DJ',
      audio: 'MUSIC_DJ',
      'audio system': 'MUSIC_DJ',
      'music service': 'MUSIC_DJ',
      'dj service': 'MUSIC_DJ',

      // decoration
      decoration: 'DECORATION',
      decorations: 'DECORATION',
      decor: 'DECORATION',
      decorating: 'DECORATION',
      decorator: 'DECORATION',
      decorators: 'DECORATION',
      'event decoration': 'DECORATION',
      'wedding decoration': 'DECORATION',
      'party decoration': 'DECORATION',
      'venue decoration': 'DECORATION',
      styling: 'DECORATION',
      'event styling': 'DECORATION',
      design: 'DECORATION',
      'event design': 'DECORATION',
      theming: 'DECORATION',
      theme: 'DECORATION',
      setup: 'DECORATION',
      'event setup': 'DECORATION',

      // flowers
      flowers: 'FLOWERS',
      flower: 'FLOWERS',
      florist: 'FLOWERS',
      florists: 'FLOWERS',
      floral: 'FLOWERS',
      'floral arrangement': 'FLOWERS',
      'floral arrangements': 'FLOWERS',
      'flower arrangement': 'FLOWERS',
      'flower arrangements': 'FLOWERS',
      bouquet: 'FLOWERS',
      bouquets: 'FLOWERS',
      'flower service': 'FLOWERS',
      'floral design': 'FLOWERS',
      'floral decoration': 'FLOWERS',

      // transportation
      transportation: 'TRANSPORTATION',
      transport: 'TRANSPORTATION',
      'transportation service': 'TRANSPORTATION',
      'transport service': 'TRANSPORTATION',
      vehicle: 'TRANSPORTATION',
      vehicles: 'TRANSPORTATION',
      car: 'TRANSPORTATION',
      cars: 'TRANSPORTATION',
      limousine: 'TRANSPORTATION',
      limo: 'TRANSPORTATION',
      limos: 'TRANSPORTATION',
      bus: 'TRANSPORTATION',
      buses: 'TRANSPORTATION',
      shuttle: 'TRANSPORTATION',
      shuttles: 'TRANSPORTATION',
      taxi: 'TRANSPORTATION',
      taxis: 'TRANSPORTATION',
      ride: 'TRANSPORTATION',
      rides: 'TRANSPORTATION',
      chauffeur: 'TRANSPORTATION',
      chauffeurs: 'TRANSPORTATION',

      // venue
      venue: 'VENUE',
      venues: 'VENUE',
      location: 'VENUE',
      locations: 'VENUE',
      'event venue': 'VENUE',
      'event space': 'VENUE',
      'event hall': 'VENUE',
      hall: 'VENUE',
      halls: 'VENUE',
      ballroom: 'VENUE',
      ballrooms: 'VENUE',
      'banquet hall': 'VENUE',
      'conference room': 'VENUE',
      'meeting room': 'VENUE',
      'event location': 'VENUE',
      'rental space': 'VENUE',
      'space rental': 'VENUE',

      // security
      security: 'SECURITY',
      'security service': 'SECURITY',
      'security guard': 'SECURITY',
      'security guards': 'SECURITY',
      guard: 'SECURITY',
      guards: 'SECURITY',
      bouncer: 'SECURITY',
      bouncers: 'SECURITY',
      'event security': 'SECURITY',
      'security personnel': 'SECURITY',
      protection: 'SECURITY',
      safety: 'SECURITY',

      // cleaning
      cleaning: 'CLEANING',
      cleaner: 'CLEANING',
      cleaners: 'CLEANING',
      'cleaning service': 'CLEANING',
      janitorial: 'CLEANING',
      'janitorial service': 'CLEANING',
      housekeeping: 'CLEANING',
      'event cleaning': 'CLEANING',
      'post event cleaning': 'CLEANING',
      cleanup: 'CLEANING',
      'clean up': 'CLEANING',

      // equipment rental
      equipment: 'EQUIPMENT_RENTAL',
      'equipment rental': 'EQUIPMENT_RENTAL',
      'equipment rent': 'EQUIPMENT_RENTAL',
      rental: 'EQUIPMENT_RENTAL',
      rentals: 'EQUIPMENT_RENTAL',
      rent: 'EQUIPMENT_RENTAL',
      renting: 'EQUIPMENT_RENTAL',
      'event equipment': 'EQUIPMENT_RENTAL',
      'party equipment': 'EQUIPMENT_RENTAL',
      tables: 'EQUIPMENT_RENTAL',
      chairs: 'EQUIPMENT_RENTAL',
      tents: 'EQUIPMENT_RENTAL',
      tent: 'EQUIPMENT_RENTAL',
      stage: 'EQUIPMENT_RENTAL',
      staging: 'EQUIPMENT_RENTAL',
      'lighting equipment': 'EQUIPMENT_RENTAL',
      'sound equipment': 'EQUIPMENT_RENTAL',
      'audio equipment': 'EQUIPMENT_RENTAL',
      'av equipment': 'EQUIPMENT_RENTAL',
      audiovisual: 'EQUIPMENT_RENTAL',
      projector: 'EQUIPMENT_RENTAL',
      projectors: 'EQUIPMENT_RENTAL',
      screen: 'EQUIPMENT_RENTAL',
      screens: 'EQUIPMENT_RENTAL',
      microphone: 'EQUIPMENT_RENTAL',
      microphones: 'EQUIPMENT_RENTAL',
      'pa system': 'EQUIPMENT_RENTAL',
      'audio equipment rental': 'EQUIPMENT_RENTAL',
    };

    // try contextual phrases first, then bare word match
    for (const [key, value] of Object.entries(categoryMap)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const specificPatterns = [
        new RegExp(
          `(?:package|vendor|service|for|with|need|want|looking for|searching for|find)\\s+${escapedKey}`,
          'i',
        ),
        new RegExp(
          `${escapedKey}\\s+(?:package|vendor|service|provider|company)`,
          'i',
        ),
        new RegExp(`(?:event|wedding|party|corporate)\\s+${escapedKey}`, 'i'),
        new RegExp(`${escapedKey}\\s+(?:service|package|vendor|provider)`, 'i'),
      ];

      const generalPattern = new RegExp(`\\b${escapedKey}\\b`, 'i');

      let matched = false;
      for (const pattern of specificPatterns) {
        if (pattern.test(categoryContext)) {
          requirements.category = value;
          this.logger.log(
            `âœ… Extracted category: ${value} from specific pattern: ${pattern}`,
          );
          matched = true;
          break;
        }
      }

      if (matched) break;

      const genericWords = [
        'for',
        'with',
        'the',
        'a',
        'an',
        'and',
        'or',
        'but',
        'in',
        'on',
        'at',
        'to',
        'of',
      ];
      if (
        !genericWords.includes(key.toLowerCase()) &&
        generalPattern.test(categoryContext)
      ) {
        const wordBoundaryMatch = categoryContext.match(
          new RegExp(`\\b${escapedKey}\\b`, 'i'),
        );
        if (wordBoundaryMatch) {
          const matchIndex = wordBoundaryMatch.index || 0;
          const beforeChar = matchIndex > 0 ? categoryContext[matchIndex - 1] : ' ';
          const afterChar =
            matchIndex + key.length < categoryContext.length
              ? categoryContext[matchIndex + key.length]
              : ' ';

          if (!/[a-z0-9]/.test(beforeChar) && !/[a-z0-9]/.test(afterChar)) {
            requirements.category = value;
            this.logger.log(
              `âœ… Extracted category: ${value} from general pattern: ${key}`,
            );
            break;
          }
        }
      }
    }

    // price / budget mentions
    const pricePatterns = [
      /(?:vendor|package|price|budget|cost|spend|pay|paying|spending|around|about|approximately|roughly|max|maximum|min|minimum|up to|under|below|over|above).*?\$(\d+(?:\.\d+)?)/gi,
      /(?:vendor|package|price|budget|cost|spend|pay|paying|spending|around|about|approximately|roughly|max|maximum|min|minimum|up to|under|below|over|above).*?(\d+(?:\.\d+)?)\s*(?:dollars?|usd|bucks?)/gi,
      /\$(\d+(?:\.\d+)?)/g,
      /(\d+(?:\.\d+)?)\s*(?:dollars?|usd|bucks?)/gi,
      /package\s+(?:for|at|of|around|about)?\s*\$?(\d+(?:\.\d+)?)/gi,
      /(?:package|service|vendor)\s+(?:with|at|for)\s*\$?(\d+(?:\.\d+)?)/gi,
      /(?:price|budget|cost)\s+(?:range|between|from)?\s*\$?(\d+(?:\.\d+)?)/gi,
      /(?:between|from)\s*\$?(\d+(?:\.\d+)?)/gi,
      /budget\s+(?:of|is|around|about)?\s*\$?(\d+(?:\.\d+)?)/gi,
      /(?:my|our|the)\s+budget\s+is\s*\$?(\d+(?:\.\d+)?)/gi,
    ];

    for (const pattern of pricePatterns) {
      const matches = Array.from(context.matchAll(pattern));
      if (matches.length > 0) {
        for (const match of matches) {
          const price = parseFloat(
            match[1] || match[0].replace(/[^0-9.]/g, ''),
          );
          if (price > 0 && price < 1000000) {
            requirements.exactPrice = price;
            break;
          }
        }
        if (requirements.exactPrice) break;
      }
    }

    // basic / standard / premium (and aliases)
    const packageTypePatterns = [
      /\b(basic|standard|premium|economy|deluxe|luxury|starter|professional|enterprise)\s+(?:package|tier|plan|option|service|level)/gi,
      /\b(?:package|tier|plan|option|service|level)\s+(basic|standard|premium|economy|deluxe|luxury|starter|professional|enterprise)/gi,
      /\b(basic|standard|premium|economy|deluxe|luxury|starter|professional|enterprise)\s+(?:tier|package|plan)\s+(?:package|service)/gi,
      /\b(basic|standard|premium|economy|deluxe|luxury|starter|professional|enterprise)\b/gi,
    ];

    const packageTypeMap: Record<string, string> = {
      basic: 'basic',
      economy: 'basic',
      starter: 'basic',
      standard: 'standard',
      professional: 'standard',
      premium: 'premium',
      deluxe: 'premium',
      luxury: 'premium',
      enterprise: 'premium',
    };

    for (const pattern of packageTypePatterns) {
      const matches = context.matchAll(pattern);
      for (const match of matches) {
        const rawType = match[1] || match[0];
        const normalizedType = rawType
          .toLowerCase()
          .replace(/\s+(package|tier|plan|option|service|level)/g, '')
          .trim();

        if (packageTypeMap[normalizedType]) {
          requirements.packageType = packageTypeMap[normalizedType];
          this.logger.log(
            `ðŸ“¦ Extracted package type: ${requirements.packageType} from: ${normalizedType}`,
          );
          break;
        } else if (
          normalizedType === 'basic' ||
          normalizedType === 'standard' ||
          normalizedType === 'premium'
        ) {
          requirements.packageType = normalizedType;
          this.logger.log(`ðŸ“¦ Extracted package type: ${normalizedType}`);
          break;
        }
      }
      if (requirements.packageType) break;
    }

    // location from last user message (prefer trailing "in X")
    const lastUserMessage = context
      .split(/\n/)
      .reverse()
      .find((line) => /^\s*user:\s+/i.test(line));
    const locationContext = lastUserMessage
      ? lastUserMessage.replace(/^\s*user:\s+/i, '').trim()
      : context;
    const locationLower = locationContext.toLowerCase();
    const atEndMatch = locationLower.match(/\b(?:in|at|near|from)\s+([a-z][a-z\s.]{1,50})$/);
    if (atEndMatch && atEndMatch[1]) {
      const raw = atEndMatch[1].trim();
      if (raw.length >= 2 && !/^(vendor|package|service|catering|photography|cleaning|equipment|venue)$/i.test(raw)) {
        requirements.location = this.normalizeLocationForMatch(raw) || raw;
      }
    }
    if (!requirements.location) {
      const anyMatch = locationContext.match(/\b(?:in|at|near|from)\s+([A-Za-z][A-Za-z\s.]{1,50}?)(?=\s*[.,]|$)/gi);
      if (anyMatch && anyMatch[0]) {
        const raw = anyMatch[0].replace(/\b(?:in|at|near|from)\s+/i, '').trim();
        if (raw.length >= 2 && !/^(vendor|package|service|catering|photography|cleaning|equipment|venue)$/i.test(raw)) {
          requirements.location = this.normalizeLocationForMatch(raw) || raw.trim().toLowerCase();
        }
      }
    }

    this.logger.log(
      `ðŸŽ¯ Extracted requirements: ${JSON.stringify(requirements)}`,
    );
    return requirements;
  }

  // category + location only
  private filterVendorsByExactCriteria(
    vendors: any[],
    requirements: any,
  ): any[] {
    let filtered = vendors;

    if (requirements.category) {
      const required = (requirements.category || '').toString().toUpperCase();
      filtered = filtered.filter(
        (v) => (v.category || v.vendorCategory || '').toString().toUpperCase() === required,
      );
      this.logger.log(`ðŸ” Category ${required}: ${filtered.length} vendors`);
    }

    if (requirements.location) {
      const loc = (requirements.location || '').toString().toLowerCase();
      filtered = filtered.filter((v) => {
        const city = (v.city || '').toString().trim().toLowerCase();
        const location = (v.location || '').toString().trim().toLowerCase();
        const country = this.normalizeLocationForMatch((v.country || '').toString()) || (v.country || '').toString().trim().toLowerCase();
        const match = (a: string, b: string) => a && b && (a.includes(b) || b.includes(a));
        return match(city, loc) || match(location, loc) || match(country, loc);
      });
      this.logger.log(`ðŸ” Location ${requirements.location}: ${filtered.length} vendors`);
    }

    return filtered;
  }

  // pull vendors named in the model reply
  private extractVendorSuggestionsPrecise(
    aiResponse: string,
    filteredVendors: any[],
    requirements: any,
  ): any[] {
    const suggestions: any[] = [];
    const responseLower = aiResponse.toLowerCase();

    for (const vendor of filteredVendors) {
      const vendorName = (
        vendor.businessName ||
        vendor.name ||
        ''
      ).toLowerCase();

      if (
        responseLower.includes(vendorName) ||
        responseLower.includes(vendor.id) ||
        responseLower.includes(vendor.category?.toLowerCase() || '')
      ) {
        let packages: any[] = [];

        if (requirements.exactPrice && vendor.matchingPackages) {
          packages = vendor.matchingPackages.map((p: any) => ({
            name: p.name,
            price: p.price,
            description: p.inclusions || '',
          }));
        } else if (vendor.allPackages) {
          packages = vendor.allPackages.slice(0, 2).map((p: any) => ({
            name: p.name,
            price: p.price,
            description: p.inclusions || '',
          }));
        }

        suggestions.push({
          id: vendor.id,
          businessName: vendor.businessName || vendor.name,
          category: vendor.category,
          city: vendor.city,
          rating: vendor.rating || 0,
          packages: packages.length > 0 ? packages : undefined,
        });
      }
    }

    // nothing named â†’ if â‰¤3 filtered, show them all
    if (suggestions.length === 0 && filteredVendors.length <= 3) {
      return filteredVendors.map((v) => ({
        id: v.id,
        businessName: v.businessName || v.name,
        category: v.category,
        city: v.city,
        rating: v.rating || 0,
        packages: (requirements.exactPrice ? v.matchingPackages : v.allPackages)
          ?.slice(0, 2)
          .map((p: any) => ({
            name: p.name,
            price: p.price,
            description: p.inclusions || '',
          })),
      }));
    }

    return suggestions;
  }

  private getSuggestionMessage(requirements: any): string {
    return 'Try adjusting your search criteria.';
  }

  // same filters, no fancy message crafting
  private preciseVendorSuggestions(
    userMessage: string,
    availableVendors: any[],
  ): { message: string; vendorSuggestions: any[] } {
    const requirements = this.extractRequirements(userMessage);
    const filtered = this.filterVendorsByExactCriteria(
      availableVendors,
      requirements,
    );
    if (filtered.length === 0) {
      const loc = requirements.location || '';
      const locationLabel = loc === 'usa' ? 'USA' : loc.replace(/\b\w/g, (c) => c.toUpperCase());
      let message = requirements.location
        ? `No vendor found in ${locationLabel}.`
        : 'There is no vendor matching your requirements.';
      if (requirements.category) message += ` No ${requirements.category.toLowerCase()} vendors found.`;
      return { message: message.trim(), vendorSuggestions: [] };
    }
    const suggestions = filtered.map((v) => ({
      id: v.id,
      businessName: v.businessName || v.name,
      category: v.category,
      city: v.city,
      rating: v.rating ?? v.averageRating ?? 0,
      packages: [] as Array<{ name: string; price: number; description: string }>,
    }));
    let message = '';
    if (suggestions.length === 1) {
      message = `I found 1 vendor: ${suggestions[0].businessName}.`;
      if (requirements.category) message += ` They offer ${(requirements.category || '').toLowerCase()} services.`;
      if (requirements.location) message += ` They are in ${suggestions[0].city || requirements.location}.`;
    } else {
      message = `I found ${suggestions.length} vendors that match.`;
      if (requirements.category) message += ` All are ${(requirements.category || '').toLowerCase()} vendors.`;
      if (requirements.location) message += ` All are in ${(requirements.location || '').replace(/\b\w/g, (c) => c.toUpperCase())}.`;
    }
    message += ' Here they are:';
    return { message, vendorSuggestions: suggestions };
  }

  // title ideas from a partial description
  async generateEventSuggestions(partialInput: string): Promise<string[]> {
    try {
      const prompt = `Given this partial event description: "${partialInput}"
Generate 3-5 short, creative event title suggestions. Return only the titles, one per line, no numbering.`;

      const response = await fetch(this.hfApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate suggestions');
      }

      const data = await response.json();
      const suggestions =
        data.choices?.[0]?.message?.content || data.generated_text || '';

      return suggestions
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.match(/^\d+\./))
        .slice(0, 5);
    } catch (error) {
      this.logger.error(`Error generating suggestions: ${error.message}`);
      return [];
    }
  }

  // tags from an onboarding answer (+ prior Q&A)
  async generateTags(
    vendorResponse: string,
    context?: {
      category?: string;
      previousAnswers?: Array<{ question: string; answer: string }>;
      currentTags?: string[];
    },
  ): Promise<{ tags: string[]; confidence: number }> {
    try {
      let contextInfo = '';
      if (context) {
        const categoryInfo = context.category ? `Business Category: ${context.category}\n` : '';
        const previousAnswersInfo = context.previousAnswers && context.previousAnswers.length > 0
          ? `\nPrevious Q&A:\n${context.previousAnswers.map((a, idx) => `${idx + 1}. Q: ${a.question}\n   A: ${a.answer}`).join('\n')}\n`
          : '';
        contextInfo = `${categoryInfo}${previousAnswersInfo}`;
      }

      const categoryGuidance = this.getCategoryTagGuidance(context?.category);

      const prompt = `You are analyzing a vendor's onboarding responses to generate accurate, category-specific tags.

${contextInfo}Current Question Response: "${vendorResponse}"

Vendor Category: ${context?.category || 'Not specified'}
${categoryGuidance}

Based on ALL the information above, generate 3-5 precise tags that accurately describe this vendor. Focus on:

1. **Category Expertise**: ${context?.category ? `ALWAYS include "${this.getCategoryExpertTag(context.category)}" or similar category-specific tag` : 'Category-based expertise tag'}
2. **Event Type Expertise**: For each event type mentioned (Weddings, Corporate Events, Festivals, etc.), create tags like "Wedding Expert", "Corporate Events Specialist", "Festival Specialist". If they serve multiple event types, prioritize the most common ones.
3. **Experience Level**: Based on years mentioned â†’ "Veteran" (10+), "Experienced" (6-10), "Established" (3-5), "Rising Star" (1-2). Combine with category: "Veteran Catering Expert" or "Experienced Photographer"
4. **Event Size**: Based on guest count â†’ "Large Events" (500+), "Medium Events" (200-500), "Boutique" (0-50)
5. **Service Style**: Based on pricing/quality mentions â†’ "Premium Service", "Budget-Friendly", "Standard"
6. **Specialization**: If they mentioned specific skills (cuisine types, photography styles, music genres, decoration themes, etc.), create specific tags like "Italian Cuisine", "Candid Photography", "Hip-Hop DJ"
7. **Business Traits**: "Quick Response" (if fast response time), "Custom Packages" (if they offer custom), "Multiple Packages" (if they offer multiple)

IMPORTANT RULES:
- ALWAYS include a category-specific expertise tag (e.g., "Catering Expert", "Photography Specialist")
- ALWAYS include event type tags for each event type they serve (e.g., "Wedding Expert", "Corporate Events Specialist")
- Combine experience level with category when possible (e.g., "Veteran Catering Expert", "Experienced Photographer")
- Tags MUST be directly derived from the actual answers given
- Use 1-3 words per tag, title case
- Be specific and accurate - don't make assumptions
- Prioritize event types they serve most frequently
- Examples: "Catering Expert", "Wedding Specialist", "Corporate Events", "Veteran", "Premium Service", "Italian Cuisine", "Large Events"

Return ONLY valid JSON:
{
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.85
}`;

      const response = await fetch(this.hfApiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Hugging Face API error for tag generation: ${response.status} - ${errorText}`,
        );
        return this.fallbackTagGeneration(vendorResponse, context);
      }

      const data = await response.json();
      const aiResponse =
        data.choices?.[0]?.message?.content || data.generated_text || '';

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          return {
            tags: result.tags || [],
            confidence: result.confidence || 0.7,
          };
        } catch (e) {
          this.logger.warn('Failed to parse tag JSON, using fallback');
          return this.fallbackTagGeneration(vendorResponse, context);
        }
      }

      return this.fallbackTagGeneration(vendorResponse, context);
    } catch (error) {
      this.logger.error(
        `Error generating tags: ${error.message}`,
        error.stack,
      );
      return this.fallbackTagGeneration(vendorResponse, context);
    }
  }

  // extra hint lines baked into the tag prompt
  private getCategoryTagGuidance(category?: string): string {
    if (!category) return '';
    
    const guidance: Record<string, string> = {
      CATERING: 'Focus on cuisine types, event types, and service level. Tags like "Catering Expert", "Italian Cuisine", "Wedding Catering"',
      PHOTOGRAPHY: 'Focus on photography styles, event coverage, and expertise. Tags like "Photography Specialist", "Candid Photography", "Event Photographer"',
      VIDEOGRAPHY: 'Focus on video services, styles, and coverage. Tags like "Videography Expert", "Event Coverage", "Drone Videography"',
      MUSIC_DJ: 'Focus on music genres, DJ services, and event types. Tags like "DJ Specialist", "Hip-Hop DJ", "Event DJ"',
      DECORATION: 'Focus on decoration themes, styles, and event types. Tags like "Decoration Expert", "Luxury Decor", "Wedding Decor"',
      FLOWERS: 'Focus on floral arrangements, event types, and styles. Tags like "Floral Expert", "Bridal Flowers", "Event Florist"',
      TRANSPORTATION: 'Focus on vehicle types, service level, and coverage. Tags like "Transportation Service", "Luxury Vehicles", "Event Transport"',
      SECURITY: 'Focus on security services, event types, and expertise. Tags like "Security Expert", "Event Security", "VIP Protection"',
      CLEANING: 'Focus on cleaning services, event types, and specialization. Tags like "Cleaning Service", "Event Cleaning", "Post-Event Cleanup"',
      EQUIPMENT_RENTAL: 'Focus on equipment types, event coverage, and service level. Tags like "Equipment Rental", "AV Equipment", "Event Equipment"',
      VENUE: 'Focus on venue types, capacity, and event types. Tags like "Venue Provider", "Outdoor Venue", "Wedding Venue"',
    };
    
    return guidance[category.toUpperCase()] || '';
  }

  private getCategoryExpertTag(category: string): string {
    const tags: Record<string, string> = {
      CATERING: 'Catering Expert',
      PHOTOGRAPHY: 'Photography Specialist',
      VIDEOGRAPHY: 'Videography Expert',
      MUSIC_DJ: 'DJ Specialist',
      DECORATION: 'Decoration Expert',
      FLOWERS: 'Floral Expert',
      TRANSPORTATION: 'Transportation Service',
      SECURITY: 'Security Expert',
      CLEANING: 'Cleaning Service',
      EQUIPMENT_RENTAL: 'Equipment Rental',
      VENUE: 'Venue Provider',
    };
    
    return tags[category.toUpperCase()] || 'Event Service Provider';
  }

  // rule-based tags if the model fails
  private fallbackTagGeneration(
    vendorResponse: string,
    context?: {
      category?: string;
      previousAnswers?: Array<{ question: string; answer: string }>;
    },
  ): { tags: string[]; confidence: number } {
    const tags: string[] = [];
    const lowerResponse = vendorResponse.toLowerCase();

    // "Question: Answer" â†’ split
    let questionText = '';
    let answerText = vendorResponse;
    if (vendorResponse.includes(':')) {
      const parts = vendorResponse.split(':');
      questionText = parts[0].toLowerCase();
      answerText = parts.slice(1).join(':').trim();
    }
    const lowerAnswer = answerText.toLowerCase();

    if (context?.category) {
      const categoryTag = this.getCategoryExpertTag(context.category);
      tags.push(categoryTag);
    }

    if (context?.previousAnswers && context.previousAnswers.length > 0) {
      const eventTypesAnswer = context.previousAnswers.find(a => 
        a.question.toLowerCase().includes('event') && a.question.toLowerCase().includes('serve')
      );
      if (eventTypesAnswer) {
        const eventTypes = Array.isArray(eventTypesAnswer.answer) 
          ? eventTypesAnswer.answer 
          : [eventTypesAnswer.answer];
        
        eventTypes.forEach(eventType => {
          const eventLower = String(eventType).toLowerCase();
          if (eventLower.includes('wedding')) tags.push('Wedding Expert');
          else if (eventLower.includes('corporate')) tags.push('Corporate Events Specialist');
          else if (eventLower.includes('birthday')) tags.push('Birthday Specialist');
          else if (eventLower.includes('festival')) tags.push('Festival Specialist');
          else if (eventLower.includes('conference')) tags.push('Conference Specialist');
          else if (eventLower.includes('concert')) tags.push('Concert Specialist');
          else if (eventLower.includes('sports')) tags.push('Sports Events Specialist');
          else if (eventLower.includes('exhibition')) tags.push('Exhibition Specialist');
          else if (eventLower.includes('workshop')) tags.push('Workshop Specialist');
          else if (eventLower.includes('graduation')) tags.push('Graduation Specialist');
          else if (eventLower.includes('anniversary')) tags.push('Anniversary Specialist');
          else if (eventLower.includes('baby shower')) tags.push('Baby Shower Specialist');
          else if (eventLower.includes('engagement')) tags.push('Engagement Party Specialist');
          else if (eventLower.includes('religious')) tags.push('Religious Events Specialist');
          else if (eventLower.includes('cultural')) tags.push('Cultural Events Specialist');
          else if (eventLower.includes('charity')) tags.push('Charity Events Specialist');
          else if (eventLower.includes('product launch')) tags.push('Product Launch Specialist');
          else if (eventLower.includes('networking')) tags.push('Networking Events Specialist');
          else if (eventLower.includes('award')) tags.push('Award Ceremony Specialist');
          else if (eventLower.includes('gala')) tags.push('Gala Dinner Specialist');
        });
      }

      const experienceAnswer = context.previousAnswers.find(a => 
        a.question.toLowerCase().includes('experience') || a.question.toLowerCase().includes('year')
      );
      if (experienceAnswer) {
        const expText = experienceAnswer.answer.toLowerCase();
        let experienceLevel = '';
        if (expText.includes('10+') || expText.includes('10')) {
          experienceLevel = 'Veteran';
          tags.push('Veteran');
          if (context?.category) {
            const categoryTag = this.getCategoryExpertTag(context.category);
            tags.push(`Veteran ${categoryTag}`);
          }
        } else if (expText.includes('6-10') || expText.includes('6') || expText.includes('7') || expText.includes('8') || expText.includes('9')) {
          experienceLevel = 'Experienced';
          tags.push('Experienced');
          if (context?.category) {
            const categoryTag = this.getCategoryExpertTag(context.category);
            tags.push(`Experienced ${categoryTag}`);
          }
        } else if (expText.includes('3-5') || expText.includes('3') || expText.includes('4') || expText.includes('5')) {
          experienceLevel = 'Established';
          tags.push('Established');
        } else if (expText.includes('1-2') || expText.includes('1') || expText.includes('2')) {
          experienceLevel = 'Rising Star';
          tags.push('Rising Star');
        }
      }

      const sizeAnswer = context.previousAnswers.find(a => 
        a.question.toLowerCase().includes('size') || a.question.toLowerCase().includes('guest')
      );
      if (sizeAnswer) {
        const sizeText = sizeAnswer.answer.toLowerCase();
        if (sizeText.includes('500+') || sizeText.includes('extra large')) tags.push('Large Events');
        else if (sizeText.includes('200-500') || sizeText.includes('large')) tags.push('Medium-Large Events');
        else if (sizeText.includes('50-200') || sizeText.includes('medium')) tags.push('Medium Events');
        else if (sizeText.includes('0-50') || sizeText.includes('small')) tags.push('Boutique Service');
      }

      // category-specific extras from prior answers
      if (context?.category) {
        const categoryUpper = context.category.toUpperCase();
        
        if (categoryUpper === 'CATERING') {
          const cuisineAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('cuisine')
          );
          if (cuisineAnswer) {
            const cuisineText = cuisineAnswer.answer.toLowerCase();
            if (cuisineText.includes('italian')) tags.push('Italian Cuisine');
            if (cuisineText.includes('asian')) tags.push('Asian Cuisine');
            if (cuisineText.includes('mediterranean')) tags.push('Mediterranean Cuisine');
            if (cuisineText.includes('mexican')) tags.push('Mexican Cuisine');
            if (cuisineText.includes('fusion')) tags.push('Fusion Cuisine');
          }
        }
        
        if (categoryUpper === 'PHOTOGRAPHY') {
          const styleAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('photography style')
          );
          if (styleAnswer) {
            const styleText = styleAnswer.answer.toLowerCase();
            if (styleText.includes('candid')) tags.push('Candid Photography');
            if (styleText.includes('portrait')) tags.push('Portrait Photography');
            if (styleText.includes('artistic')) tags.push('Artistic Photography');
            if (styleText.includes('documentary')) tags.push('Documentary Photography');
          }
        }
        
        if (categoryUpper === 'VIDEOGRAPHY') {
          const serviceAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('videography service')
          );
          if (serviceAnswer) {
            const serviceText = serviceAnswer.answer.toLowerCase();
            if (serviceText.includes('drone')) tags.push('Drone Videography');
            if (serviceText.includes('highlight')) tags.push('Highlight Reels');
            if (serviceText.includes('live streaming')) tags.push('Live Streaming');
          }
        }
        
        if (categoryUpper === 'MUSIC_DJ') {
          const genreAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('music genre') || a.question.toLowerCase().includes('dj service')
          );
          if (genreAnswer) {
            const genreText = genreAnswer.answer.toLowerCase();
            if (genreText.includes('hip-hop')) tags.push('Hip-Hop DJ');
            if (genreText.includes('electronic')) tags.push('Electronic DJ');
            if (genreText.includes('bollywood')) tags.push('Bollywood DJ');
            if (genreText.includes('custom playlist')) tags.push('Custom Playlists');
          }
        }
        
        if (categoryUpper === 'DECORATION') {
          const themeAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('decoration theme')
          );
          if (themeAnswer) {
            const themeText = themeAnswer.answer.toLowerCase();
            if (themeText.includes('luxury')) tags.push('Luxury Decor');
            if (themeText.includes('modern')) tags.push('Modern Decor');
            if (themeText.includes('rustic')) tags.push('Rustic Decor');
            if (themeText.includes('themed')) tags.push('Themed Events');
          }
        }
        
        if (categoryUpper === 'FLOWERS') {
          const flowerAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('floral arrangement')
          );
          if (flowerAnswer) {
            const flowerText = flowerAnswer.answer.toLowerCase();
            if (flowerText.includes('bridal')) tags.push('Bridal Flowers');
            if (flowerText.includes('centerpiece')) tags.push('Centerpieces');
            if (flowerText.includes('ceremony arch')) tags.push('Ceremony Arches');
          }
        }
        
        if (categoryUpper === 'TRANSPORTATION') {
          const transportAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('transportation service')
          );
          if (transportAnswer) {
            const transportText = transportAnswer.answer.toLowerCase();
            if (transportText.includes('luxury')) tags.push('Luxury Vehicles');
            if (transportText.includes('bus')) tags.push('Bus Service');
            if (transportText.includes('airport')) tags.push('Airport Transfers');
          }
        }
        
        if (categoryUpper === 'SECURITY') {
          const securityAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('security service')
          );
          if (securityAnswer) {
            const securityText = securityAnswer.answer.toLowerCase();
            if (securityText.includes('vip')) tags.push('VIP Protection');
            if (securityText.includes('crowd control')) tags.push('Crowd Control');
            if (securityText.includes('surveillance')) tags.push('Surveillance');
          }
        }
        
        if (categoryUpper === 'EQUIPMENT_RENTAL') {
          const equipmentAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('equipment')
          );
          if (equipmentAnswer) {
            const equipmentText = equipmentAnswer.answer.toLowerCase();
            if (equipmentText.includes('audio') || equipmentText.includes('visual')) tags.push('AV Equipment');
            if (equipmentText.includes('lighting')) tags.push('Lighting Equipment');
            if (equipmentText.includes('staging')) tags.push('Staging Equipment');
          }
        }
        
        if (categoryUpper === 'VENUE') {
          const venueAnswer = context.previousAnswers.find(a => 
            a.question.toLowerCase().includes('venue space')
          );
          if (venueAnswer) {
            const venueText = venueAnswer.answer.toLowerCase();
            if (venueText.includes('outdoor')) tags.push('Outdoor Venue');
            if (venueText.includes('rooftop')) tags.push('Rooftop Venue');
            if (venueText.includes('garden')) tags.push('Garden Venue');
            if (venueText.includes('ballroom')) tags.push('Ballroom Venue');
          }
        }
      }
    }

    // tags from the current answer alone
    if (lowerAnswer.includes('year') || questionText.includes('experience')) {
      const yearMatch = lowerAnswer.match(/(\d+)\s*year/);
      if (yearMatch) {
        const years = parseInt(yearMatch[1], 10);
        if (years >= 10) tags.push('Veteran');
        else if (years >= 5) tags.push('Experienced');
        else if (years >= 3) tags.push('Established');
        else tags.push('Rising Star');
      }
    }

    if (questionText.includes('size') || questionText.includes('guest')) {
      if (lowerAnswer.includes('500+') || lowerAnswer.includes('extra large')) {
        tags.push('Large Events');
      } else if (lowerAnswer.includes('200-500') || lowerAnswer.includes('large')) {
        tags.push('Medium-Large Events');
      } else if (lowerAnswer.includes('50-200') || lowerAnswer.includes('medium')) {
        tags.push('Medium Events');
      } else if (lowerAnswer.includes('0-50') || lowerAnswer.includes('small')) {
        tags.push('Boutique Service');
      }
    }

    if (
      lowerAnswer.includes('premium') ||
      lowerAnswer.includes('luxury') ||
      lowerAnswer.includes('high-end') ||
      lowerAnswer.includes('custom packages')
    ) {
      tags.push('Premium Service');
    } else if (
      lowerAnswer.includes('budget') ||
      lowerAnswer.includes('affordable')
    ) {
      tags.push('Budget-Friendly');
    }

    if (questionText.includes('response time') || questionText.includes('inquiry')) {
      if (lowerAnswer.includes('1 hour') || lowerAnswer.includes('within 1')) {
        tags.push('Quick Response');
      }
    }

    if (questionText.includes('package') || questionText.includes('discount')) {
      if (lowerAnswer.includes('yes') && lowerAnswer.includes('multiple')) {
        tags.push('Multiple Packages');
      } else if (lowerAnswer.includes('yes') && lowerAnswer.includes('seasonal')) {
        tags.push('Seasonal Discounts');
      } else if (lowerAnswer.includes('yes') && lowerAnswer.includes('custom')) {
        tags.push('Custom Packages');
      }
    }

    return {
      tags: tags.length > 0 ? tags : ['Event Service Provider'],
      confidence: 0.6,
    };
  }

  // MiniLM embeddings via HF inference
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embeddingUrl =
        'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2';

      const response = await fetch(embeddingUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.hfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: text }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Hugging Face embedding error: ${response.status} - ${errorText}`,
        );
        throw new Error('Failed to generate embedding');
      }

      const data = await response.json();
      // HF sometimes returns nested arrays / { embeddings }
      if (Array.isArray(data)) {
        return data[0] || [];
      } else if (data.embeddings) {
        return data.embeddings[0] || [];
      } else if (Array.isArray(data[0])) {
        return data[0];
      }

      throw new Error('Unexpected embedding response format');
    } catch (error) {
      this.logger.error(
        `Error generating embedding: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }
}

