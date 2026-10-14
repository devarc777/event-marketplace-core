"use client";

import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Footer } from "../../../components/TrustFooter";
import AIVendorChat from "../../../components/AIVendorChat";
import VendorCard from "../../../components/VendorCard";
import { getGeoLocationLabelOncePerSession } from "../../../lib/utils/geoPrefill";
import { resolveApiBaseUrl } from "@/lib/api-base";

interface Vendor {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  businessName: string;
  description?: string;
  category: string;
  profileImage: string | null;
  city: string;
  rating: number;
  reviews: number;
  aiTags?: string[];
  /** True for external (e.g. OSM) vendors not yet on Evenzs */
  isExternal?: boolean;
  isBlocked?: boolean;
}

function getApiBase(): string {
  return resolveApiBaseUrl();
}

function withoutBlockedVendors(list: Vendor[]): Vendor[] {
  return list.filter((vendor) => vendor.isBlocked !== true);
}

// Monochrome SVG Icon Components
const CategoryIcon = ({ name }: { name: string }) => {
  const iconClass = "w-8 h-8 mx-auto fill-current text-gray-700";
  
  const icons: Record<string, React.ReactElement> = {
    'Catering': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 2v2h2v3c0 1.657 1.343 3 3 3h2v11H8V2H3zm6 0v13h1V2H9zm9 0c-2.21 0-4 1.79-4 4v8c0 1.657 1.343 3 3 3s3-1.343 3-3v-4h-2v4c0 .552-.448 1-1 1s-1-.448-1-1V6c0-1.103.897-2 2-2s2 .897 2 2v1h2V6c0-2.21-1.79-4-4-4z"/>
      </svg>
    ),
    'Photography': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
      </svg>
    ),
    'Music & DJ': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
      </svg>
    ),
    'Flowers': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    ),
    'Decoration': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
        <path d="M12 8l-3 1.5v3c0 1.66 1.34 3 3 3s3-1.34 3-3v-3L12 8z"/>
      </svg>
    ),
    'Transportation': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
      </svg>
    ),
    'Security': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
      </svg>
    ),
    'Cleaning': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M19.36 2.72L20.78 4.14 15.06 9.85C14.74 10.17 14.22 10.17 13.9 9.85L12.48 8.43 19.36 2.72M11.93 8.14L10.5 6.72 4.78 12.43C4.46 12.75 4.46 13.27 4.78 13.59L6.2 15L11.93 9.29 13.35 10.7 7.63 16.41C7.31 16.73 7.31 17.25 7.63 17.57L9.05 19L14.78 13.27L16.19 14.69L10.47 20.4C10.15 20.72 9.63 20.72 9.31 20.4L2.43 13.5C2.11 13.18 2.11 12.66 2.43 12.34L8.15 6.63L9.57 8.05L3.85 13.77L9.57 19.5L15.29 13.77L11.93 10.41L10.5 9L11.93 8.14Z"/>
      </svg>
    ),
    'Equipment': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 15.5c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-7.5 8.5h15c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5h-15c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5z"/>
      </svg>
    ),
    'Venue': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 20v-6h4v6h5v-8H3v8h7z"/>
        <path d="M12 2L2 7v2h20V7l-10-5z"/>
      </svg>
    ),
    'Videography': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
      </svg>
    ),
    'Other': (
      <svg className={iconClass} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    )
  };
  
  return icons[name] || icons['Other'];
};

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    'CATERING': '🍽️',
    'PHOTOGRAPHY': '📸',
    'VIDEOGRAPHY': '🎬',
    'MUSIC_DJ': '🎵',
    'DECORATION': '🎨',
    'FLOWERS': '🌸',
    'TRANSPORTATION': '🚗',
    'VENUE': '🏢',
    'EQUIPMENT': '⚙️',
    'SECURITY': '🛡️',
    'CLEANING': '🧹',
    'OTHER': '✨'
  };
  return icons[category] || '✨';
}

// Basic normalization helpers for flexible multi-word search
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SEARCH_STOP_WORDS = new Set([
  "in",
  "at",
  "for",
  "the",
  "and",
  "&",
  "of",
  "on",
]);

function getSearchTokens(query: string): string[] {
  return normalizeText(query)
    .split(/\s+/)
    .filter((token) => token && !SEARCH_STOP_WORDS.has(token));
}

function VendorMarketplaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [filteredVendors, setFilteredVendors] = useState<Vendor[]>([]);
  const safeFilteredVendors = Array.isArray(filteredVendors) ? filteredVendors : [];
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searching, setSearching] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalOnboarded, setTotalOnboarded] = useState(0);
  const [totalExternal, setTotalExternal] = useState(0);
  const limit = 60;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Guard against overwriting user edits with GPS auto-fill.
  const vendorSearchTouchedRef = useRef(false);

  // Autocomplete suggestions based on current vendors (name, city, category)
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const suggestions = new Set<string>();

    vendors.forEach((vendor) => {
      if (vendor.businessName && vendor.businessName.toLowerCase().includes(query)) {
        suggestions.add(vendor.businessName);
      }
      if (vendor.city && vendor.city.toLowerCase().includes(query)) {
        suggestions.add(vendor.city);
      }
      if (vendor.category && vendor.category.toLowerCase().includes(query)) {
        suggestions.add(vendor.category.replace(/_/g, " "));
      }
    });

    return Array.from(suggestions).slice(0, 8);
  }, [vendors, searchQuery]);

  // Pre-fill search bar from homepage query params (service, location, date) and show filtered results on land
  useEffect(() => {
    const service = searchParams.get('service')?.trim() || '';
    const location = searchParams.get('location')?.trim() || '';
    const date = searchParams.get('date')?.trim() || '';
    if (service || location || date) {
      const combined = [service, location, date].filter(Boolean).join(' ');
      setSearchQuery(combined);
    }
  }, [searchParams]);

  // GPS auto-fill: if URL has no vendor search inputs, prefill the vendor search field.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const service = searchParams.get("service")?.trim() || "";
      const locationParam = searchParams.get("location")?.trim() || "";
      const dateParam = searchParams.get("date")?.trim() || "";
      const hasUrlPreFill = Boolean(service || locationParam || dateParam);

      if (cancelled) return;
      if (hasUrlPreFill) return;
      if (vendorSearchTouchedRef.current) return;
      if (searchQuery.trim()) return;

      const label = await getGeoLocationLabelOncePerSession();
      if (cancelled) return;
      if (!label || !label.trim()) return;
      if (vendorSearchTouchedRef.current) return;
      if (searchQuery.trim()) return;

      setSearchQuery(label);
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    console.log('Marketplace API_BASE:', getApiBase());
    fetchVendors();
  }, [page]);

  useEffect(() => {
    filterVendors();
  }, [vendors, searchQuery, selectedCategory]);

  const fetchVendors = async () => {
    setLoading(true);
    const primaryUrl = `${getApiBase()}/vendors/marketplace?page=${page}&limit=${limit}`;
    const fallbackUrl = `/api/backend/vendors/marketplace?page=${page}&limit=${limit}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      let response = await fetch(primaryUrl, {
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        try { console.warn('Primary body:', await response.text()); } catch {}
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      const list = withoutBlockedVendors(Array.isArray(data) ? data : (data.vendors || []));
      setVendors(list);
      setFilteredVendors(list);
      if (!Array.isArray(data)) {
        setTotal(data.total ?? list.length);
        setTotalOnboarded(data.totalOnboarded ?? 0);
        setTotalExternal(data.totalExternal ?? 0);
      } else {
        setTotal(list.length);
        setTotalOnboarded(0);
        setTotalExternal(0);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('Primary fetch failed, retrying via proxy:', err);

      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 15000);

      try {
        const response2 = await fetch(fallbackUrl, {
          credentials: 'include',
          signal: controller2.signal,
        });
        clearTimeout(timeoutId2);

        if (!response2.ok) {
          try { console.error('Fallback body:', await response2.text()); } catch {}
          return;
        }
        const data2 = await response2.json();
        const list2 = withoutBlockedVendors(Array.isArray(data2) ? data2 : (data2.vendors || []));
        setVendors(list2);
        setFilteredVendors(list2);
        if (!Array.isArray(data2)) {
          setTotal(data2.total ?? list2.length);
          setTotalOnboarded(data2.totalOnboarded ?? 0);
          setTotalExternal(data2.totalExternal ?? 0);
        } else {
          setTotal(list2.length);
          setTotalOnboarded(0);
          setTotalExternal(0);
        }
      } catch (err2) {
        clearTimeout(timeoutId2);
        console.error('Both primary and fallback fetches failed:', err2);
      }
    } finally {
      setLoading(false);
    }
  };

  const filterVendors = () => {
    let filtered = vendors;

    // Search by query
    if (searchQuery.trim()) {
      const tokens = getSearchTokens(searchQuery);
      if (tokens.length) {
        filtered = filtered.filter((vendor) => {
          const searchable = normalizeText(
            [
              vendor.businessName,
              vendor.description,
              vendor.city,
              vendor.category,
              vendor.firstName,
              vendor.lastName,
              (vendor.aiTags || []).join(" "),
            ].join(" ")
          );

          // Require every meaningful word from the search to exist somewhere
          // in the combined vendor text (name, service, city, etc.)
          return tokens.every((token) => searchable.includes(token));
        });
      }
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(vendor => vendor.category === selectedCategory);
    }

    setFilteredVendors(filtered);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('');
  };

  // Handle search button: show "Searching..." and scroll to results
  const handleSearchClick = () => {
    setShowSuggestions(false);
    setSearching(true);
    // Ensure filter runs with latest state in next tick, then scroll
    setTimeout(() => {
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSearching(false);
    }, 200);
  };

  const handleRequestQuote = async (vendor: Vendor) => {
    const url = vendor.isExternal
      ? `/quote-request/external/${vendor.id}`
      : `/quote-request/${vendor.id}`;
    try {
      const response = await fetch(`${getApiBase()}/auth/me`, {
        credentials: 'include'
      });
      if (response.ok) {
        router.push(url);
      } else {
        router.push(`/auth/login?returnUrl=${encodeURIComponent(url)}`);
      }
    } catch (error) {
      router.push(`/auth/login?returnUrl=${encodeURIComponent(url)}`);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      
      {/* Hero Section */}
      <section className="pt-32 pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-6 font-raleway">
              Find the Perfect Vendor
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto font-inter">
              Discover verified vendors for your events. From catering to photography, 
              find the perfect match for your special occasion.
            </p>
            
            {/* Search Bar */}
            <div className="max-w-2xl mx-auto mb-6">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search vendors by service, location, or name..."
                  style={{fontFamily: 'Inter, sans-serif'}}
                  value={searchQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    vendorSearchTouchedRef.current = true;
                    setSearchQuery(value);
                    setShowSuggestions(!!value.trim());
                  }}
                  onFocus={() => {
                    if (searchQuery.trim()) setShowSuggestions(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowSuggestions(false), 120);
                  }}
                  className="w-full px-6 py-4 text-lg border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                />
                {showSuggestions && searchQuery.trim() && searchSuggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-2xl shadow-lg max-h-60 overflow-auto text-sm">
                    {searchSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="block w-full px-4 py-2 text-left hover:bg-gray-100"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSearchQuery(suggestion);
                          setShowSuggestions(false);
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleSearchClick}
                  disabled={searching}
                  className="absolute right-2 top-2 bg-[#0B1A33] text-white px-6 py-2 rounded-full hover:bg-[#1a2a4a] transition-colors font-inter disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>

              {/* AI Vendor Package Suggestion Button */}
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => setShowAIChat(true)}
                  className="inline-flex items-center gap-3 px-6 py-3 bg-[#0B1A33] text-white rounded-full hover:bg-[#1a2a4a] transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
                  style={{ fontFamily: 'Raleway, sans-serif' }}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <span>AI Vendor Package Suggestion</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12 font-raleway">
            Browse by Category
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {[
              { name: 'Catering', value: 'CATERING' },
              { name: 'Photography', value: 'PHOTOGRAPHY' },
              { name: 'Music & DJ', value: 'MUSIC_DJ' },
              { name: 'Flowers', value: 'FLOWERS' },
              { name: 'Decoration', value: 'DECORATION' },
              { name: 'Transportation', value: 'TRANSPORTATION' },
              { name: 'Security', value: 'SECURITY' },
              { name: 'Cleaning', value: 'CLEANING' },
              { name: 'Equipment', value: 'EQUIPMENT' },
              { name: 'Venue', value: 'VENUE' },
              { name: 'Videography', value: 'VIDEOGRAPHY' },
              { name: 'Other', value: 'OTHER' }
            ].map((category) => (
              <button
                key={category.name}
                onClick={() => setSelectedCategory(selectedCategory === category.value ? '' : category.value)}
                className={`border rounded-lg p-6 text-center transition-all ${
                  selectedCategory === category.value
                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-md'
                    : 'bg-white border-gray-200 hover:shadow-md'
                }`}
              >
                <div className="mb-3 flex justify-center">
                  <CategoryIcon name={category.name} />
                </div>
                <h3 className="font-medium font-inter">{category.name}</h3>
              </button>
        ))}
      </div>
    </div>
      </section>

      {/* Verified Vendors Section */}
      <section className="py-16 bg-gray-50" ref={listRef}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex flex-wrap justify-between items-center gap-4 mb-12">
                  <h2 className="text-3xl font-bold text-gray-900 font-raleway">
                    Verified Vendors
                  </h2>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-gray-600 font-inter">
                      {loading ? (
                        <span>Loading...</span>
                      ) : (
                        <span>
                          Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total} vendor{total !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {(searchQuery || selectedCategory) && (
                      <button 
                        onClick={clearFilters}
                        className="text-sm text-blue-600 hover:text-blue-800 underline font-inter"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>
          
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
                  <div className="h-48 bg-gray-200 rounded-lg mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded mb-4"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              ))}
            </div>
                ) : safeFilteredVendors.length === 0 ? (
            <div className="text-center py-12">
              {searchQuery || selectedCategory ? (
                <>
                  <p className="text-gray-500 text-lg font-inter">No vendors found matching your search.</p>
                  <p className="text-gray-400 text-sm mt-2 font-inter">Try adjusting your search terms or filters.</p>
                  <button 
                    onClick={clearFilters}
                    className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-inter"
                  >
                    Clear Filters
                  </button>
                </>
              ) : (
                <>
                  <p className="text-gray-500 text-lg font-inter">No verified vendors available yet.</p>
                  <p className="text-gray-400 text-sm mt-2 font-inter">Check back later for verified vendors.</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {safeFilteredVendors.map((vendor) => (
                <VendorCard
                  key={vendor.id}
                  id={vendor.id}
                  businessName={vendor.businessName}
                  category={vendor.category}
                  city={vendor.city || null}
                  profileImage={vendor.profileImage}
                  rating={vendor.rating}
                  reviews={vendor.reviews}
                  aiTags={vendor.aiTags}
                  isExternal={vendor.isExternal}
                  onRequestQuote={() => handleRequestQuote(vendor)}
                />
              ))}
            </div>
          )}

                {/* Pagination at bottom */}
                {!loading && total > limit && safeFilteredVendors.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
                    <button
                      onClick={() => { setPage((p) => Math.max(1, p - 1)); listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                      disabled={page <= 1}
                      className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-inter font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-gray-600 font-inter">
                      Page {page} of {Math.ceil(total / limit)}
                    </span>
                    <button
                      onClick={() => { setPage((p) => p + 1); listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                      disabled={page >= Math.ceil(total / limit)}
                      className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-inter font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
        </div>
      </section>

      {/* Small CTA Section */}
      <section className="py-8 bg-gray-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-600 mb-4 font-inter">
            Are you a vendor? 
            <a href="/vendor/auth/signup" className="text-blue-600 hover:text-blue-800 font-medium ml-1 font-inter">
              Join our marketplace →
            </a>
          </p>
        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* AI Vendor Chat Modal */}
      <AIVendorChat isOpen={showAIChat} onClose={() => setShowAIChat(false)} />
    </main>
  );
}

export default function VendorMarketplacePage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600 font-inter">Loading...</p>
      </main>
    }>
      <VendorMarketplaceContent />
    </Suspense>
  );
}