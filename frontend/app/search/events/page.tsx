"use client";

import { Suspense, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NormalizedEventItem, searchBackendEvents, fetchExternalStored, fetchAllEvents } from "../../../lib/services/events";
import { getGeoLocationLabelOncePerSession } from "../../../lib/utils/geoPrefill";

type SortKey = "relevance" | "price-asc" | "date-asc";

function useUrlState() {
  const sp = useSearchParams();
  const router = useRouter();
  const params = useMemo(() => new URLSearchParams(sp as any), [sp]);
  function setParam(key: string, value?: string | number) {
    const p = new URLSearchParams(params.toString());
    if (value === undefined || value === "") p.delete(key);
    else p.set(key, String(value));
    router.push(`/search/events?${p.toString()}`);
  }
  return { params, setParam };
}

// Top filter bar styled like homepage hero inputs
function TopFilterBar({
  what,
  where,
  zipcode,
  when,
  priceMin,
  priceMax,
  sort,
  whatSuggestions = [],
  whereSuggestions = [],
  onChange,
  onSubmit,
}: {
  what?: string;
  where?: string;
  zipcode?: string;
  when?: string;
  priceMin?: number;
  priceMax?: number;
  sort: SortKey;
  whatSuggestions?: string[];
  whereSuggestions?: string[];
  onChange: (next: Partial<{ what: string; where: string; zipcode: string; when: string; priceMin: number; priceMax: number; sort: SortKey }>) => void;
  onSubmit?: (currentValues?: { what?: string; where?: string; zipcode?: string; when?: string; priceMin?: string; priceMax?: string }) => void;
}) {
  const [showWhatSuggestions, setShowWhatSuggestions] = useState(false);
  const [showWhereSuggestions, setShowWhereSuggestions] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setShowWhatSuggestions(false);
      setShowWhereSuggestions(false);
      // Pass current input values so flush uses them (avoids stale state when user clears min/max then Enter)
      onSubmit?.({
        what: what ?? "",
        where: where ?? "",
        zipcode: zipcode ?? "",
        when: when ?? "",
        priceMin: localPriceMinInput,
        priceMax: localPriceMaxInput,
      });
    }
  };
  
  // Local state for price inputs to allow free editing
  const [localPriceMinInput, setLocalPriceMinInput] = useState<string>(
    priceMin !== undefined && priceMin !== null ? String(priceMin) : ""
  );
  const [localPriceMaxInput, setLocalPriceMaxInput] = useState<string>(
    priceMax !== undefined && priceMax !== null ? String(priceMax) : ""
  );
  
  // Sync with props when they change externally
  useEffect(() => {
    setLocalPriceMinInput(priceMin !== undefined && priceMin !== null ? String(priceMin) : "");
  }, [priceMin]);
  
  useEffect(() => {
    setLocalPriceMaxInput(priceMax !== undefined && priceMax !== null ? String(priceMax) : "");
  }, [priceMax]);

  return (
    <form 
      className="relative z-40 w-full rounded-2xl p-4"
      style={{ backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)', backgroundColor: '#ffffff' }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.({
          what: what ?? "",
          where: where ?? "",
          zipcode: zipcode ?? "",
          when: when ?? "",
          priceMin: localPriceMinInput,
          priceMax: localPriceMaxInput,
        });
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
        <div className="relative">
          <input
            placeholder="Event"
            className="border border-[#E1E1E1] rounded-3xl px-4 py-3 bg-[#E1E1E1] focus:outline-none w-full"
            style={{ fontFamily: 'Raleway', color: 'black' }}
            value={what || ""}
            onChange={(e) => {
              const value = e.target.value;
              onChange({ what: value });
              setShowWhatSuggestions(!!value.trim());
            }}
            onFocus={() => {
              if ((what || "").trim()) setShowWhatSuggestions(true);
            }}
            onBlur={() => {
              // small delay so click on suggestion still works
              setTimeout(() => setShowWhatSuggestions(false), 120);
            }}
            onKeyDown={handleKeyDown}
          />
          {showWhatSuggestions && whatSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-2xl shadow-lg max-h-60 overflow-auto text-sm">
              {whatSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-gray-100"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ what: suggestion });
                    setShowWhatSuggestions(false);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <input
            placeholder="Where"
            className="border border-[#E1E1E1] rounded-3xl px-4 py-3 bg-[#E1E1E1] focus:outline-none w-full"
            style={{ fontFamily: 'Raleway', color: 'black' }}
            value={where || ""}
            onChange={(e) => {
              const value = e.target.value;
              onChange({ where: value });
              setShowWhereSuggestions(!!value.trim());
            }}
            onFocus={() => {
              if ((where || "").trim()) setShowWhereSuggestions(true);
            }}
            onBlur={() => {
              setTimeout(() => setShowWhereSuggestions(false), 120);
            }}
            onKeyDown={handleKeyDown}
          />
          {showWhereSuggestions && whereSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-2xl shadow-lg max-h-60 overflow-auto text-sm">
              {whereSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-gray-100"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ where: suggestion });
                    setShowWhereSuggestions(false);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          placeholder="Zipcode"
          className="border border-[#E1E1E1] rounded-3xl px-4 py-3 bg-[#E1E1E1] focus:outline-none"
          style={{ fontFamily: 'Raleway', color: 'black' }}
          value={zipcode || ""}
          onChange={(e) => onChange({ zipcode: e.target.value })}
          onKeyDown={handleKeyDown}
        />
        <input
          type="date"
          className="border border-[#E1E1E1] rounded-3xl px-4 py-3 bg-[#E1E1E1] focus:outline-none"
          style={{ fontFamily: 'Raleway', color: 'black' }}
          value={when || ""}
          onChange={(e) => onChange({ when: e.target.value })}
          onKeyDown={handleKeyDown}
        />
        <input
          type="text"
          inputMode="numeric"
          placeholder="Min $"
          className="border border-[#E1E1E1] rounded-3xl px-4 py-3 bg-[#E1E1E1] focus:outline-none"
          style={{ fontFamily: 'Raleway', color: 'black' }}
          value={localPriceMinInput}
          onChange={(e) => {
            const val = e.target.value;
            // Update local state immediately for smooth editing
            setLocalPriceMinInput(val);
            
            // Only allow digits - strip everything else
            const numericVal = val.replace(/[^0-9]/g, '');
            
            // If empty or no digits, set to undefined
            if (numericVal === "" || numericVal.length === 0) {
              onChange({ priceMin: undefined as any });
              return;
            }
            
            // Convert to number and update parent
            const num = Number(numericVal);
            if (!isNaN(num) && num >= 0) {
              onChange({ priceMin: num });
            }
          }}
          onKeyDown={handleKeyDown}
        />
        <input
          type="text"
          inputMode="numeric"
          placeholder="Max $"
          className="border border-[#E1E1E1] rounded-3xl px-4 py-3 bg-[#E1E1E1] focus:outline-none"
          style={{ fontFamily: 'Raleway', color: 'black' }}
          value={localPriceMaxInput}
          onChange={(e) => {
            const val = e.target.value;
            // Update local state immediately for smooth editing
            setLocalPriceMaxInput(val);
            
            // Only allow digits - strip everything else
            const numericVal = val.replace(/[^0-9]/g, '');
            
            // If empty or no digits, set to undefined
            if (numericVal === "" || numericVal.length === 0) {
              onChange({ priceMax: undefined as any });
              return;
            }
            
            // Convert to number and update parent
            const num = Number(numericVal);
            if (!isNaN(num) && num >= 0) {
              onChange({ priceMax: num });
            }
          }}
          onKeyDown={handleKeyDown}
        />
        <select
          className="border border-[#E1E1E1] rounded-3xl px-4 py-3 bg-[#E1E1E1] focus:outline-none"
          style={{ fontFamily: 'Raleway', color: 'black' }}
          value={sort}
          onChange={(e) => onChange({ sort: e.target.value as SortKey })}
        >
          <option value="relevance">Sort: Relevance</option>
          <option value="price-asc">Sort: Price (low to high)</option>
          <option value="date-asc">Sort: Date (soonest)</option>
        </select>
      </div>
    </form>
  );
}

function EventCard({ ev }: { ev: NormalizedEventItem }) {
  const subtitle = useMemo(() => {
    const d = new Date(ev.date);
    const valid = !Number.isNaN(d.getTime());
    const monthDay = valid
      ? `${d.toLocaleDateString('en-US', { month: 'short' })} ${String(d.getDate()).padStart(2, '0')}`
      : 'Date TBD';
    return `${monthDay}${ev.city ? ' · ' + ev.city : ''}`;
  }, [ev.date, ev.city]);
  const fallbackPool = useMemo(() => [
    '/Events/trendingevent1.jpg', '/Events/2.jpg', '/Events/3.jpg', '/Events/4.jpg', '/Events/5.jpg'
  ], []);
  const fallbackForId = useMemo(() => {
    const key = ev.id || 'x';
    let hash = 0; for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return fallbackPool[hash % fallbackPool.length];
  }, [ev.id, fallbackPool]);
  
  const isExternal = ev.source === 'TICKETMASTER' && !!ev.externalUrl;
  const linkUrl = isExternal
    ? (ev.externalUrl as string)
    : ev.source === 'TICKETMASTER'
      ? 'https://www.ticketmaster.com'
      : `/event/${ev.id}`;
  
  return (
    <a 
      href={linkUrl} 
      className="w-full rounded-2xl p-0 block" 
      style={{ backgroundColor: 'transparent', border: '1px solid #00000026' }}
      target={ev.source === 'TICKETMASTER' ? '_blank' : undefined}
      rel={ev.source === 'TICKETMASTER' ? 'noopener noreferrer' : undefined}
    >
      <div className="relative h-64 w-full rounded-t-2xl overflow-hidden">
        <img 
          src={ev.coverImage || fallbackForId} 
          alt={ev.title} 
          className="w-full h-full object-cover" 
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = fallbackForId; }} 
        />
      </div>
      <div className="p-4" style={{ backgroundColor: 'transparent' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 style={{ fontFamily: 'Roboto', fontWeight: 700, fontSize: '18px', lineHeight: '140%', letterSpacing: '0%', color: 'black', flex: 1 }}>
            {ev.title}
          </h3>
          {ev.price && (
            <div style={{ backgroundColor: '#D4AF37', borderRadius: '50px', padding: '4px 12px', fontFamily: 'Roboto', fontSize: '12px', fontWeight: 400 }}>
              {ev.price}
            </div>
          )}
        </div>
        <div className="text-sm text-zinc-600 mb-3">{subtitle}</div>
        <div className="w-full rounded-md text-white py-2 text-center" style={{ backgroundColor: '#0B1A33', borderRadius: '30px' }}>
          {ev.source === 'TICKETMASTER' ? 'View on Ticketmaster' : 'View Event'}
        </div>
      </div>
    </a>
  );
}

function EventsResultsInner() {
  const router = useRouter();
  const { params, setParam } = useUrlState();
  
  // Initialize local state from URL params
  const [localWhat, setLocalWhat] = useState(params.get("what") || "");
  const [localWhere, setLocalWhere] = useState(params.get("where") || "");
  const [localZipcode, setLocalZipcode] = useState(params.get("zipcode") || "");
  const [localWhen, setLocalWhen] = useState(params.get("when") || "");
  const [localPriceMin, setLocalPriceMin] = useState<string>(params.get("priceMin") || "");
  const [localPriceMax, setLocalPriceMax] = useState<string>(params.get("priceMax") || "");
  const [localSort, setLocalSort] = useState<SortKey>((params.get("sort") as SortKey) || "relevance");

  // Guard against overwriting user edits with GPS auto-fill.
  const whereTouchedRef = useRef(false);
  
  // Sync local state with URL params when they change externally (e.g., browser back/forward)
  useEffect(() => {
    setLocalWhat(params.get("what") || "");
    setLocalWhere(params.get("where") || "");
    setLocalZipcode(params.get("zipcode") || "");
    setLocalWhen(params.get("when") || "");
    setLocalPriceMin(params.get("priceMin") || "");
    setLocalPriceMax(params.get("priceMax") || "");
    setLocalSort((params.get("sort") as SortKey) || "relevance");
  }, [params]);
  
  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debounced URL update: single push with all params so min/max/date don't overwrite each other
  const updateUrlParams = (updates: {
    what?: string;
    where?: string;
    zipcode?: string;
    when?: string;
    priceMin?: string;
    priceMax?: string;
  }) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const p = new URLSearchParams(params.toString());
      const setOrDelete = (key: string, value: string | number | undefined) => {
        if (value === undefined || value === "") p.delete(key);
        else p.set(key, String(value));
      };
      if (updates.what !== undefined) setOrDelete('what', updates.what.trim() || undefined);
      if (updates.where !== undefined) setOrDelete('where', updates.where.trim() || undefined);
      if (updates.zipcode !== undefined) setOrDelete('zipcode', updates.zipcode.trim() || undefined);
      if (updates.when !== undefined) setOrDelete('when', updates.when.trim() || undefined);
      if (updates.priceMin !== undefined) {
        const num = updates.priceMin === "" ? undefined : Number(updates.priceMin);
        setOrDelete('priceMin', num !== undefined && !isNaN(num) ? num : undefined);
      }
      if (updates.priceMax !== undefined) {
        const num = updates.priceMax === "" ? undefined : Number(updates.priceMax);
        setOrDelete('priceMax', num !== undefined && !isNaN(num) ? num : undefined);
      }
      router.push(`/search/events?${p.toString()}`);
    }, 250);
  };

  // Flush current search values to URL immediately (e.g. on Enter); use override from form when provided so clearing min/max + Enter shows all events
  const flushSearchParams = (override?: { what?: string; where?: string; zipcode?: string; when?: string; priceMin?: string; priceMax?: string }) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const p = new URLSearchParams(params.toString());
    const setOrDelete = (key: string, value: string | number | undefined) => {
      if (value === undefined || value === "") p.delete(key);
      else p.set(key, String(value));
    };
    const whatVal = override?.what !== undefined ? override.what.trim() : localWhat.trim();
    const whereVal = override?.where !== undefined ? override.where.trim() : localWhere.trim();
    const zipcodeVal = override?.zipcode !== undefined ? override.zipcode.trim() : localZipcode.trim();
    const whenVal = override?.when !== undefined ? override.when.trim() : localWhen.trim();
    const priceMinStr = override?.priceMin !== undefined ? override.priceMin : localPriceMin;
    const priceMaxStr = override?.priceMax !== undefined ? override.priceMax : localPriceMax;
    setOrDelete('what', whatVal || undefined);
    setOrDelete('where', whereVal || undefined);
    setOrDelete('zipcode', zipcodeVal || undefined);
    setOrDelete('when', whenVal || undefined);
    const minNum = priceMinStr.trim() ? Number(priceMinStr) : undefined;
    const maxNum = priceMaxStr.trim() ? Number(priceMaxStr) : undefined;
    setOrDelete('priceMin', minNum !== undefined && !isNaN(minNum) ? minNum : undefined);
    setOrDelete('priceMax', maxNum !== undefined && !isNaN(maxNum) ? maxNum : undefined);
    router.push(`/search/events?${p.toString()}`);
  };
  
  // Get actual values from URL for search (these are what trigger the search)
  const what = params.get("what") || undefined;
  const where = params.get("where") || undefined;
  const zipcode = params.get("zipcode") || undefined;
  const when = params.get("when") || undefined;
  const priceMin = params.get("priceMin") ? Number(params.get("priceMin")) : undefined;
  const priceMax = params.get("priceMax") ? Number(params.get("priceMax")) : undefined;
  const sort = (params.get("sort") as SortKey) || "relevance";

  // GPS auto-fill: prefill `where` only if user hasn't typed and URL has no where yet.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (whereTouchedRef.current) return;
      if (where && where.trim()) return; // URL already has where
      if (localWhere && localWhere.trim()) return; // local already has value

      const label = await getGeoLocationLabelOncePerSession();
      if (cancelled) return;
      if (!label || !label.trim()) return;
      if (whereTouchedRef.current) return;
      if (where && where.trim()) return;
      if (localWhere && localWhere.trim()) return;
      setParam("where", label);
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [where]);
  
  const [page, setPage] = useState(1);
  const [backendLoading, setBackendLoading] = useState(true);
  const [backendData, setBackendData] = useState<NormalizedEventItem[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const pageSize = 20;
  
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.add('page-search-events');
      return () => document.body.classList.remove('page-search-events');
    }
  }, []);
  
  useEffect(() => {
    let cancelled = false;
    setBackendLoading(true);
    
    const hasSearchParams = what || where || zipcode || when || priceMin || priceMax;
    const skip = (page - 1) * pageSize;
    
    const fetchData = async () => {
      try {
        let allEvents = [];
        
        if (hasSearchParams) {
          const searchResult = await searchBackendEvents({ 
            what, 
            where, 
            zipcode,
            when, 
            priceMin, 
            priceMax, 
            limit: pageSize,
            skip: skip
          });
          
          if (!cancelled) {
            const searchEvents = searchResult.events || [];
            const filteredEvents = Array.isArray(searchEvents)
              ? searchEvents.filter((ev: any) => !ev.isFlagged)
              : [];
            allEvents = filteredEvents;
            setSearchTotal(filteredEvents.length);
          }
        } else {
          if (!cancelled) {
            setSearchTotal(0);
          }
          function resolveApiBaseUrl(): string {
            const env = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
            if (env) return env;
            if (typeof window !== 'undefined') {
              const host = window.location.hostname;
              if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3002';
              const base = window.location.origin.replace(/\/$/, '');
              return `${base}/api`;
            }
            return 'http://localhost:3002';
          }
          const backendUrl = resolveApiBaseUrl();
          
          if (page === 1) {
            // Load more events initially (100) for better instant filtering when user starts typing
            const initialLoadLimit = 100;
            const [userEventsResponse, ticketmasterEvents] = await Promise.all([
              fetch(`${backendUrl}/events?limit=${initialLoadLimit}`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store',
              }),
              fetchExternalStored(initialLoadLimit, 0)
            ]);
            
            const userEvents = userEventsResponse.ok ? await userEventsResponse.json() : [];
            const filteredUserEvents = Array.isArray(userEvents) 
              ? userEvents.filter((ev: any) => !ev.isFlagged)
              : [];
            allEvents = [...filteredUserEvents, ...ticketmasterEvents];
          } else {
            const userEventsResponse = await fetch(`${backendUrl}/events?limit=${pageSize}`, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              cache: 'no-store',
            });
            const userEvents = userEventsResponse.ok ? await userEventsResponse.json() : [];
            const filteredUserEvents = Array.isArray(userEvents) 
              ? userEvents.filter((ev: any) => !ev.isFlagged)
              : [];
            const userEventsCount = filteredUserEvents.length;
            const ticketmasterEventsOnPage1 = Math.max(0, pageSize - userEventsCount);
            const ticketmasterSkip = ticketmasterEventsOnPage1 + (page - 2) * pageSize;
            allEvents = await fetchExternalStored(pageSize, ticketmasterSkip);
          }
        }
        
        if (!cancelled) {
          const unflaggedEvents = allEvents.filter((ev: any) => !ev.isFlagged);
          
          const hydrated = unflaggedEvents.map((ev) => {
            const hasValidDate = ev?.date && Number.isFinite(Date.parse(ev.date));
            if (hasValidDate) return ev;
            const s = ev?.startDate;
            let iso = new Date().toISOString();
            try {
              if (typeof s === 'string') {
                if (s.includes('T') || s.includes('Z')) {
                  const d = new Date(s);
                  if (!Number.isNaN(d.getTime())) iso = d.toISOString();
                } else {
                  const d = new Date(`${s}T00:00:00Z`);
                  if (!Number.isNaN(d.getTime())) iso = d.toISOString();
                }
              } else if (s) {
                const d = new Date(s);
                if (!Number.isNaN(d.getTime())) iso = d.toISOString();
              }
            } catch {}
            const externalUrl = ev?.externalUrl ?? ev?.url ?? ev?.link ?? (ev?.links && ev?.links[0]?.url) ?? undefined;
            const source = ev?.source === 'TICKETMASTER' ? 'TICKETMASTER' : ev?.source;
            return { ...ev, date: iso, externalUrl, source };
          });

          const filteredHydrated = hydrated;
          
          setBackendData(filteredHydrated);
          setBackendLoading(false);
        }
      } catch (error) {
        if (!cancelled) setBackendLoading(false);
      }
    };
    
    fetchData();
    return () => { cancelled = true; };
  }, [what, where, zipcode, when, priceMin, priceMax, page]);
  
  useEffect(() => {
    setPage(1);
  }, [what, where, when, priceMin, priceMax]);

  const merged = useMemo(() => {
    const all = backendData;
    let filtered = all;
    const min = priceMin;
    const max = priceMax;
    if ((min !== undefined && min >= 0) || (max !== undefined && max >= 0)) {
      filtered = all.filter((ev) => {
        let n: number | undefined;
        if (typeof ev.price === 'string') {
          const s = ev.price.trim().toLowerCase();
          if (s === 'free') n = 0; else {
            const m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
            if (m) n = Number(m[1]);
          }
        }
        if (n === undefined) return true;
        if (min !== undefined && n < min) return false;
        if (max !== undefined && n > max) return false;
        return true;
      });
    }
    // Partition: our events first, then Ticketmaster
    const ourEvents = filtered.filter((ev) => ev.source !== 'TICKETMASTER');
    const tmEvents = filtered.filter((ev) => ev.source === 'TICKETMASTER');

    const sortByPrice = (a: typeof filtered[0], b: typeof filtered[0]) => {
      const aN = Number((a.price ?? '').toString().replace(/[^0-9.]/g, '')) || 0;
      const bN = Number((b.price ?? '').toString().replace(/[^0-9.]/g, '')) || 0;
      return aN - bN;
    };
    const sortByDate = (a: typeof filtered[0], b: typeof filtered[0]) => {
      const aT = Date.parse(a.date);
      const bT = Date.parse(b.date);
      const aValid = Number.isFinite(aT);
      const bValid = Number.isFinite(bT);
      if (aValid && bValid) return aT - bT;
      if (aValid) return -1;
      if (bValid) return 1;
      return 0;
    };

    let sortedOur: typeof filtered;
    let sortedTm: typeof filtered;
    switch (sort) {
      case "price-asc":
        sortedOur = [...ourEvents].sort(sortByPrice);
        sortedTm = [...tmEvents].sort(sortByPrice);
        break;
      case "date-asc":
        sortedOur = [...ourEvents].sort(sortByDate);
        sortedTm = [...tmEvents].sort(sortByDate);
        break;
      default:
        sortedOur = ourEvents;
        sortedTm = tmEvents;
    }
    return [...sortedOur, ...sortedTm];
  }, [backendData, sort, priceMin, priceMax]);

  const loading = backendLoading;
  const hasSearchParams = what || where || when || priceMin || priceMax;
  
  // Check if user is actively typing (local state differs from URL params)
  const isTyping = localWhat !== (what || "") || 
                   localWhere !== (where || "") || 
                   localZipcode !== (zipcode || "") || 
                   localWhen !== (when || "") ||
                   localPriceMin !== (priceMin !== undefined ? String(priceMin) : "") ||
                   localPriceMax !== (priceMax !== undefined ? String(priceMax) : "");

  // Autocomplete suggestions for "what" (event) and "where" (location) based on current events
  const whatSuggestions = useMemo(() => {
    const raw = localWhat.trim();
    if (!raw) return [];
    // Use the last word the user is typing so suggestions keep working
    // even after selecting an item and adding more text.
    const parts = raw.toLowerCase().split(/\s+/);
    const query = parts[parts.length - 1] || raw.toLowerCase();
    if (!query) return [];
    const titles = backendData
      .map((ev) => ev.title)
      .filter((t): t is string => Boolean(t));
    const unique = Array.from(new Set(titles));
    return unique
      .filter((title) => title.toLowerCase().includes(query))
      .slice(0, 8);
  }, [backendData, localWhat]);

  const whereSuggestions = useMemo(() => {
    if (!localWhere.trim()) return [];
    const query = localWhere.toLowerCase();
    const locations: string[] = [];
    backendData.forEach((ev) => {
      if (ev.city) locations.push(ev.city);
      if ((ev as any).location) locations.push((ev as any).location);
    });
    const unique = Array.from(new Set(locations));
    return unique
      .filter((loc) => loc.toLowerCase().includes(query))
      .slice(0, 8);
  }, [backendData, localWhere]);
  
  // Client-side filtering for instant results as user types
  const instantFilteredResults = useMemo(() => {
    // Only show instant filtered results when user is actively typing
    if (!isTyping) return [];
    
    let filtered = [...backendData];
    
    // Filter by "what" (title)
    if (localWhat.trim()) {
      const query = localWhat.toLowerCase();
      filtered = filtered.filter(ev => 
        ev.title?.toLowerCase().includes(query) ||
        ev.description?.toLowerCase().includes(query)
      );
    }
    
    // Filter by "where" (location/city)
    if (localWhere.trim()) {
      const query = localWhere.toLowerCase();
      filtered = filtered.filter(ev => 
        ev.city?.toLowerCase().includes(query) ||
        ev.location?.toLowerCase().includes(query) ||
        ev.address?.toLowerCase().includes(query)
      );
    }
    
    // Filter by zipcode
    if (localZipcode.trim()) {
      const query = localZipcode.toLowerCase().trim();
      filtered = filtered.filter(ev => {
        // Check zipcode field directly
        if (ev.zipcode?.toLowerCase().includes(query)) return true;
        // Check if city/address contains the zipcode (address might include zipcode)
        if (ev.city?.toLowerCase().includes(query)) return true;
        return false;
      });
    }
    
    // Filter by date
    if (localWhen) {
      const searchDate = new Date(localWhen);
      filtered = filtered.filter(ev => {
        if (!ev.date) return false;
        const evDate = new Date(ev.date);
        return evDate.toDateString() === searchDate.toDateString();
      });
    }
    
    // Filter by price range
    const localMin = localPriceMin ? Number(localPriceMin) : undefined;
    const localMax = localPriceMax ? Number(localPriceMax) : undefined;
    if (localMin !== undefined || localMax !== undefined) {
      filtered = filtered.filter(ev => {
        let n: number | undefined;
        if (typeof ev.price === 'string') {
          const s = ev.price.trim().toLowerCase();
          if (s === 'free') n = 0;
          else {
            const m = s.match(/([0-9]+(?:\.[0-9]+)?)/);
            if (m) n = Number(m[1]);
          }
        }
        if (n === undefined) return true;
        if (localMin !== undefined && n < localMin) return false;
        if (localMax !== undefined && n > localMax) return false;
        return true;
      });
    }
    
    // Apply sorting
    switch (localSort) {
      case "price-asc":
        return [...filtered].sort((a, b) => {
          const aN = Number(a.price?.replace(/[^0-9.]/g, '') || '0') || 0;
          const bN = Number(b.price?.replace(/[^0-9.]/g, '') || '0') || 0;
          return aN - bN;
        });
      case "date-asc":
        return [...filtered].sort((a, b) => {
          const aT = Date.parse(a.date);
          const bT = Date.parse(b.date);
          const aValid = Number.isFinite(aT);
          const bValid = Number.isFinite(bT);
          if (aValid && bValid) return aT - bT;
          if (aValid) return -1;
          if (bValid) return 1;
          return 0;
        });
      default:
        return filtered;
    }
  }, [backendData, localWhat, localWhere, localZipcode, localWhen, localPriceMin, localPriceMax, localSort, isTyping, hasSearchParams]);
  
  const sortedSearchResults = useMemo(() => {
    if (!hasSearchParams) return [];
    const all = backendData;
    switch (sort) {
      case "price-asc":
        return [...all].sort((a, b) => {
          const aN = Number(a.price?.replace(/[^0-9.]/g, '') || '0') || 0;
          const bN = Number(b.price?.replace(/[^0-9.]/g, '') || '0') || 0;
          return aN - bN;
        });
      case "date-asc":
        return [...all].sort((a, b) => {
          const aT = Date.parse(a.date);
          const bT = Date.parse(b.date);
          const aValid = Number.isFinite(aT);
          const bValid = Number.isFinite(bT);
          if (aValid && bValid) return aT - bT;
          if (aValid) return -1;
          if (bValid) return 1;
          return 0;
        });
      default:
        return all;
    }
  }, [backendData, sort, hasSearchParams]);
  
  // Use instant filtered results when typing, otherwise use backend results
  const paged = isTyping ? instantFilteredResults : (hasSearchParams ? sortedSearchResults : merged);
  const totalSearchResults = isTyping ? instantFilteredResults.length : (hasSearchParams ? searchTotal : merged.length);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 font-raleway">
      <h1 className="text-2xl font-semibold" style={{ marginBottom: '1rem' }}>Event results</h1>
      <TopFilterBar
        what={localWhat}
        where={localWhere}
        zipcode={localZipcode}
        when={localWhen}
        priceMin={localPriceMin === "" ? undefined : Number(localPriceMin) || undefined}
        priceMax={localPriceMax === "" ? undefined : Number(localPriceMax) || undefined}
        sort={localSort}
        whatSuggestions={whatSuggestions}
        whereSuggestions={whereSuggestions}
        onSubmit={flushSearchParams}
        onChange={(next) => {
          // Calculate new values
          const newWhat = next.what !== undefined ? next.what : localWhat;
          const newWhere = next.where !== undefined ? next.where : localWhere;
          const newZipcode = next.zipcode !== undefined ? next.zipcode : localZipcode;
          const newWhen = next.when !== undefined ? next.when : localWhen;
          // Handle priceMin: if key present (even when value is undefined for "clear"), use it; otherwise keep current
          const newPriceMin = 'priceMin' in next
            ? (next.priceMin === undefined || next.priceMin === null ? "" : String(next.priceMin))
            : localPriceMin;
          const newPriceMax = 'priceMax' in next
            ? (next.priceMax === undefined || next.priceMax === null ? "" : String(next.priceMax))
            : localPriceMax;
          const newSort = next.sort !== undefined ? next.sort : localSort;
          
          // Update local state immediately for smooth typing
          if (next.what !== undefined) setLocalWhat(next.what);
          if (next.where !== undefined) {
            whereTouchedRef.current = true;
            setLocalWhere(next.where);
          }
          if (next.zipcode !== undefined) setLocalZipcode(next.zipcode);
          if (next.when !== undefined) setLocalWhen(next.when);
          if ('priceMin' in next) {
            setLocalPriceMin(next.priceMin === undefined || next.priceMin === null ? "" : String(next.priceMin));
          }
          if ('priceMax' in next) {
            setLocalPriceMax(next.priceMax === undefined || next.priceMax === null ? "" : String(next.priceMax));
          }
          if (next.sort !== undefined) {
            setLocalSort(next.sort);
            // Sort updates immediately (no debounce)
            setParam('sort', next.sort);
          }
          
          // Debounce URL update for any filter change (including price clear so backspace takes effect after 250ms)
          if (next.what !== undefined || next.where !== undefined || next.zipcode !== undefined || next.when !== undefined || 'priceMin' in next || 'priceMax' in next) {
            updateUrlParams({
              what: newWhat,
              where: newWhere,
              zipcode: newZipcode,
              when: newWhen,
              priceMin: newPriceMin,
              priceMax: newPriceMax,
            });
          }
        }}
      />
      <div className="mt-6">
          {loading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border bg-white/60 animate-pulse">
                  <div className="h-40 bg-zinc-200" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-zinc-200 rounded w-2/3" />
                    <div className="h-3 bg-zinc-200 rounded w-1/2" />
                    <div className="h-8 bg-zinc-200 rounded w-1/3 mt-3" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && merged.length === 0 && (
            <div className="text-zinc-600">No results. Try adjusting filters.</div>
          )}
          {!loading && merged.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paged.map((ev, index) => (
                  <EventCard key={`${ev.source}-${ev.id}-${index}`} ev={ev} />
                ))}
              </div>
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => {
                    setPage(p => Math.max(1, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-sm text-zinc-600 font-medium">
                  Page {page} • {paged.length} of {totalSearchResults} events
                </span>
                <button
                  disabled={(hasSearchParams ? (page * pageSize >= totalSearchResults) : (paged.length < pageSize)) || loading}
                  onClick={() => {
                    setPage(p => p + 1);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                >
                  Next →
                </button>
              </div>
            </>
          )}
      </div>
    </div>
  );
}

export default function EventsResultsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">Loading…</div>}>
      <EventsResultsInner />
    </Suspense>
  );
}