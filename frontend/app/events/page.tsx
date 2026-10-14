"use client";

import React, { useEffect, useState, Suspense, useRef, useCallback } from "react";
import { createBackendEvent, uploadImage, updateBackendEvent, fetchBackendEvents, fetchBackendEventById } from "../../lib/services/events";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRoleContext } from "../../components/RoleContext";
import { useSearchParams } from 'next/navigation';
import { resolveApiBaseUrl } from "@/lib/api-base";
import { getAuthHeaders } from "@/lib/auth-utils";

function EventsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editEventId = searchParams.get('edit');
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'tickets'>('details');
  const [createdEventId, setCreatedEventId] = useState<string | null>(editEventId);
  const [isEditMode, setIsEditMode] = useState(!!editEventId);
  
  // Lift form state to parent to persist across tab switches
  const [title, setTitle] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [ageRestriction, setAgeRestriction] = useState<'ALL' | '18+' | '21+'>('ALL');
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [address, setAddress] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [coverImageUploading, setCoverImageUploading] = useState(false);
  const [coverImageError, setCoverImageError] = useState<string | null>(null);
  
  // Lift tickets state to parent
  const [tickets, setTickets] = useState<Array<{ name?: string; qty?: number; price?: number }>>([]);
  
  // Auth check: redirect to login if not logged in (same flow as quote-request, etc.)
  const authCheckCancelled = useRef(false);
  useEffect(() => {
    authCheckCancelled.current = false;
    (async () => {
      try {
        const API_BASE = resolveApiBaseUrl();
        const response = await fetch(`${API_BASE}/auth/me`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        if (authCheckCancelled.current) return;
        if (!response.ok) {
          const returnPath = '/events' + (editEventId ? `?edit=${encodeURIComponent(editEventId)}` : '');
          router.replace(`/auth/login?returnUrl=${encodeURIComponent(returnPath)}`);
          return;
        }
        setAuthChecked(true);
      } catch {
        if (authCheckCancelled.current) return;
        router.replace(`/auth/login?returnUrl=${encodeURIComponent('/events')}`);
      }
    })();
    return () => { authCheckCancelled.current = true; };
  }, [router, editEventId]);
  
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.add('page-search-events');
      return () => document.body.classList.remove('page-search-events');
    }
  }, []);

  useEffect(() => {
    if (editEventId) {
      setIsEditMode(true);
      setCreatedEventId(editEventId);
    }
  }, [editEventId]);

  if (!authChecked) {
    return (
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14 font-raleway flex items-center justify-center min-h-[50vh]" style={{ background: 'linear-gradient(180deg,#fafafa 0%, #ffffff 100%)' }}>
        <p className="text-zinc-600">Checking authentication...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-14 font-raleway" style={{background:'linear-gradient(180deg,#fafafa 0%, #ffffff 100%)'}}>
      <div className="mb-8 mt-6">
        <h1 className="text-[34px] leading-tight font-extrabold tracking-tight" style={{ color: '#0B1A33' }}>
          {isEditMode ? 'Edit Event' : 'Create Event'}
        </h1>
        <p className="mt-2 text-zinc-600">
          {isEditMode ? 'Update your event details.' : 'Plan and publish a beautiful event in minutes.'}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 flex items-center gap-2 border-b" style={{ borderColor: '#E5E7EB' }}>
        <button
          onClick={() => setActiveTab('details')}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'details' 
              ? 'text-[#0B1A33]' 
              : 'text-zinc-600 hover:text-[#0B1A33]'
          }`}
          style={{ 
            borderBottom: activeTab === 'details' ? '2px solid #0B1A33' : '2px solid transparent',
            marginBottom: '-2px'
          }}
        >
          1. Event Details
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-3 font-medium transition-colors ${
            activeTab === 'tickets' 
              ? 'text-[#0B1A33]' 
              : 'text-zinc-600 hover:text-[#0B1A33]'
          }`}
          style={{ 
            borderBottom: activeTab === 'tickets' ? '2px solid #0B1A33' : '2px solid transparent',
            marginBottom: '-2px'
          }}
        >
          2. Tickets & Pricing
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && (
        <div className="mb-10 p-0 rounded-3xl overflow-hidden border shadow-lg" style={{ background: '#FFFFFF', borderColor: '#E5E7EB' }}>
          <div className="px-8 py-6" style={{background:'linear-gradient(90deg,#0B1A33 0%, #1a2a4a 100%)'}}>
            <h2 className="text-xl font-semibold" style={{ color: 'white' }}>Event Details</h2>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {isEditMode ? 'Update your event information.' : 'Tell people what your event is about.'}
            </p>
          </div>
          <div className="p-8">
            <CreateEventForm 
              onSuccess={(id?: string) => {
                if (id) setCreatedEventId(id);
                setActiveTab('tickets');
              }} 
              editEventId={editEventId}
              isEditMode={isEditMode}
              // Pass form state and setters
              title={title}
              setTitle={setTitle}
              descriptionHtml={descriptionHtml}
              setDescriptionHtml={setDescriptionHtml}
              ageRestriction={ageRestriction}
              setAgeRestriction={setAgeRestriction}
              startDate={startDate}
              setStartDate={setStartDate}
              startTime={startTime}
              setStartTime={setStartTime}
              endDate={endDate}
              setEndDate={setEndDate}
              endTime={endTime}
              setEndTime={setEndTime}
              address={address}
              setAddress={setAddress}
              zipcode={zipcode}
              setZipcode={setZipcode}
              coverImage={coverImage}
              setCoverImage={setCoverImage}
              coverImageUploading={coverImageUploading}
              setCoverImageUploading={setCoverImageUploading}
              coverImageError={coverImageError}
              setCoverImageError={setCoverImageError}
            />
          </div>
        </div>
      )}

      {activeTab === 'tickets' && (
        <div className="mb-10 p-8 rounded-3xl border shadow-lg" style={{ background: '#FFFFFF', borderColor: '#E5E7EB' }}>
          <TicketsSetup 
            createdEventId={createdEventId} 
            editEventId={editEventId}
            isEditMode={isEditMode}
            tickets={tickets}
            setTickets={setTickets}
          />
        </div>
      )}
    </main>
  );
}

function TicketsSetup({ createdEventId, editEventId, isEditMode, tickets, setTickets }: { 
  createdEventId: string | null; 
  editEventId?: string | null;
  isEditMode?: boolean;
  onBack?: () => void;
  tickets: Array<{ name?: string; qty?: number; price?: number }>;
  setTickets: React.Dispatch<React.SetStateAction<Array<{ name?: string; qty?: number; price?: number }>>>;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTickets = async () => {
      // Only load from backend if in edit mode and tickets is empty (initial load)
      if (isEditMode && editEventId && tickets.length === 0) {
        try {
          const eventData = await fetchBackendEventById(editEventId);
          if (eventData?.pricingTiers && Array.isArray(eventData.pricingTiers)) {
            const loadedTickets = eventData.pricingTiers.map((tier: any) => ({
              name: tier.name,
              qty: tier.quantity,
              price: tier.price
            }));
            setTickets(loadedTickets.length > 0 ? loadedTickets : [{}]);
          } else {
            setTickets([{}]);
          }
        } catch (err) {
          console.error('Failed to load tickets:', err);
          setTickets([{}]);
        }
      } else if (tickets.length === 0) {
        // Initialize with empty ticket if array is empty (new event)
        setTickets([{}]);
      }
      setLoading(false);
    };
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editEventId, isEditMode]); // Only run when edit mode changes, not when tickets changes

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4" style={{ color: '#0B1A33' }}>Tickets & Pricing</h2>
        <div className="text-zinc-600">Loading tickets...</div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4" style={{ color: '#0B1A33' }}>Tickets & Pricing</h2>
      <div className="grid gap-3">
        {tickets.map((t, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <input className="rounded-md px-3 py-2 border" placeholder="Ticket name (e.g., General Admission)" value={t.name || ''} onChange={(e)=>{
              const v=[...tickets]; v[i]={...v[i], name:e.target.value || undefined}; setTickets(v);
            }} />
            <input type="number" className="rounded-md px-3 py-2 border" placeholder="Quantity (seats/people)" value={t.qty ?? ''} onChange={(e)=>{
              const val = e.target.value === '' ? undefined : Number(e.target.value);
              const v=[...tickets]; v[i]={...v[i], qty:val}; setTickets(v);
            }} />
            <input type="number" className="rounded-md px-3 py-2 border" placeholder="Price per ticket ($, 0 for free)" value={t.price ?? ''} onChange={(e)=>{
              const val = e.target.value === '' ? undefined : Number(e.target.value);
              const v=[...tickets]; v[i]={...v[i], price:val}; setTickets(v);
            }} />
                  </div>
        ))}
        <button type="button" onClick={()=>setTickets([...tickets, {}])} className="px-4 py-2 rounded-full" style={{ border:'1px solid #E5E7EB' }}>Add Ticket Type</button>
                </div>
      <div className="flex items-center gap-3 mt-4">
                        <button
          disabled={publishing}
                          onClick={async () => {
            if (!createdEventId) {
              alert('Please complete Step 1 first.');
              return;
            }
            setPublishing(true);
            try {
              const normalized = tickets
                .filter(t => (t.name && (t.qty ?? 0) >= 0 && (t.price ?? 0) >= 0))
                .map(t => ({ name: t.name, quantity: t.qty ?? 0, price: t.price ?? 0 }));
              const minPrice = normalized.length ? Math.min(...normalized.map(t => t.price)) : undefined;
              await updateBackendEvent(createdEventId, {
                                status: 'PUBLISHED',
                                visibility: 'PUBLIC',
                pricingTiers: normalized,
                basePrice: minPrice,
              });
              // Redirect to search so the organizer can see the event live
              router.push('/search/events');
            } catch (e) {
              alert('Failed to publish. Please try again.');
            } finally {
              setPublishing(false);
            }
          }}
          className="px-6 py-2 rounded-full"
          style={{ background:'#0B1A33', color:'#FFFFFF', opacity: publishing ? 0.7 : 1 }}
        >
          {publishing ? 'Publishing…' : 'Finish & Publish'}
                        </button>
                      </div>
      {createdEventId && (
        <p className="text-xs text-zinc-500 mt-2">Event ID: {createdEventId}</p>
        )}
      </div>
  );
}

function CreateEventForm({ 
  onSuccess, 
  editEventId, 
  isEditMode,
  // Form state props
  title,
  setTitle,
  descriptionHtml,
  setDescriptionHtml,
  ageRestriction,
  setAgeRestriction,
  startDate,
  setStartDate,
  startTime,
  setStartTime,
  endDate,
  setEndDate,
  endTime,
  setEndTime,
  address,
  setAddress,
  zipcode,
  setZipcode,
  coverImage,
  setCoverImage,
  coverImageUploading,
  setCoverImageUploading,
  coverImageError,
  setCoverImageError,
}: { 
  onSuccess: (id?: string) => void;
  editEventId?: string | null;
  isEditMode?: boolean;
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  descriptionHtml: string;
  setDescriptionHtml: React.Dispatch<React.SetStateAction<string>>;
  ageRestriction: 'ALL' | '18+' | '21+';
  setAgeRestriction: React.Dispatch<React.SetStateAction<'ALL' | '18+' | '21+'>>;
  startDate: string;
  setStartDate: React.Dispatch<React.SetStateAction<string>>;
  startTime: string;
  setStartTime: React.Dispatch<React.SetStateAction<string>>;
  endDate: string;
  setEndDate: React.Dispatch<React.SetStateAction<string>>;
  endTime: string;
  setEndTime: React.Dispatch<React.SetStateAction<string>>;
  address: string;
  setAddress: React.Dispatch<React.SetStateAction<string>>;
  zipcode: string;
  setZipcode: React.Dispatch<React.SetStateAction<string>>;
  coverImage: string;
  setCoverImage: React.Dispatch<React.SetStateAction<string>>;
  coverImageUploading: boolean;
  setCoverImageUploading: React.Dispatch<React.SetStateAction<boolean>>;
  coverImageError: string | null;
  setCoverImageError: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const { user, authChecked } = useRoleContext();
  const [submitting, setSubmitting] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [isStripeConnected, setIsStripeConnected] = useState<boolean | null>(null);
  const [checkingStripe, setCheckingStripe] = useState(false);
  const [stripeCheckResolved, setStripeCheckResolved] = useState(false);
  const stripeCheckInFlight = useRef(false);

  const checkStripeStatus = useCallback(async (options?: { blocking?: boolean }) => {
    if (isEditMode || user?.role !== 'ORGANIZER') return;
    if (stripeCheckInFlight.current) return;

    stripeCheckInFlight.current = true;
    const showBlockingLoader = options?.blocking === true;
    if (showBlockingLoader) {
      setCheckingStripe(true);
    }

    try {
      const API_BASE = resolveApiBaseUrl();
      const response = await fetch(`${API_BASE}/events/organizer/stripe-connect/status`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const statusData = await response.json();
        setIsStripeConnected(Boolean(statusData.enabled));
      } else {
        console.error('Stripe status check failed:', response.status);
        if (showBlockingLoader) {
          setIsStripeConnected(false);
        }
      }
    } catch (error) {
      console.error('Error checking Stripe Connect status:', error);
      if (showBlockingLoader) {
        setIsStripeConnected(false);
      }
    } finally {
      stripeCheckInFlight.current = false;
      if (showBlockingLoader) {
        setCheckingStripe(false);
      }
      setStripeCheckResolved(true);
    }
  }, [isEditMode, user?.role]);

  const handleAiCreate = async () => {
    const text = window.prompt('Describe your event (e.g., "A football match will take place at Camp Nou, Barcelona, on December 15, 2025, from 6:00 PM to 8:00 PM.")');
    if (!text || !text.trim()) return;
    try {
      setAiLoading(true);
      const API_BASE = resolveApiBaseUrl();
      const res = await fetch(`${API_BASE}/ai/parse-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const json = await res.json();
      const data = json?.data || {};

      if (data.title) setTitle(data.title);
      if (data.description) setDescriptionHtml(data.description);
      if (data.location) {
        const cleaned = String(data.location)
          .replace(/\b(at\s*)?\d{1,2}(?::\d{1,2})?\s*(am|pm)\b/gi, '')
          .replace(/\b\d{1,2}\s*(am|pm)\b/gi, '')
          .replace(/\s{2,}/g,' ')
          .trim();
        setAddress(cleaned);
      } else if (data.city) {
        setAddress(data.city);
      }

      if (data.startDate) {
        // Accept local string format YYYY-MM-DDTHH:mm (no timezone)
        const m = String(data.startDate).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
        if (m) {
          setStartDate(`${m[1]}-${m[2]}-${m[3]}`);
          setStartTime(`${m[4]}:${m[5]}`);
        } else {
          const d = new Date(data.startDate);
          if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            setStartDate(`${yyyy}-${mm}-${dd}`);
            setStartTime(`${hh}:${mi}`);
          }
        }
      }
      if (data.endDate) {
        const m2 = String(data.endDate).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
        if (m2) {
          setEndDate(`${m2[1]}-${m2[2]}-${m2[3]}`);
          setEndTime(`${m2[4]}:${m2[5]}`);
        } else {
          const d2 = new Date(data.endDate);
          if (!isNaN(d2.getTime())) {
            const yyyy = d2.getFullYear();
            const mm = String(d2.getMonth() + 1).padStart(2, '0');
            const dd = String(d2.getDate()).padStart(2, '0');
            const hh = String(d2.getHours()).padStart(2, '0');
            const mi = String(d2.getMinutes()).padStart(2, '0');
            setEndDate(`${yyyy}-${mm}-${dd}`);
            setEndTime(`${hh}:${mi}`);
          }
        }
      }

      if (!json?.success) {
        console.warn('AI parse returned warning:', json?.error);
      }
    } catch (e) {
      alert('AI could not parse your request. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  // Check Stripe once on load (do not re-check on window focus — file picker triggers focus and unmounts the form)
  useEffect(() => {
    if (isEditMode) {
      setIsStripeConnected(true);
      setStripeCheckResolved(true);
      return;
    }

    if (!authChecked) return;

    if (user?.role !== 'ORGANIZER') {
      setIsStripeConnected(true);
      setStripeCheckResolved(true);
      return;
    }

    checkStripeStatus({ blocking: true });
  }, [isEditMode, authChecked, user?.role, checkStripeStatus]);

  // Prefill form for editing - only load if form is empty (initial load)
  useEffect(() => {
    if (editEventId && isEditMode && !title && !descriptionHtml) {
      const loadData = async () => {
        try {
          const eventData = await fetchBackendEventById(editEventId);
          if (eventData) {
            setTitle(eventData.title || "");
            setDescriptionHtml(eventData.description || "");
            if (eventData.startDate) {
              const d = new Date(eventData.startDate);
              setStartDate(d.toISOString().slice(0,10));
              setStartTime(d.toISOString().slice(11,16));
            }
            if (eventData.endDate) {
              const d2 = new Date(eventData.endDate);
              setEndDate(d2.toISOString().slice(0,10));
              setEndTime(d2.toISOString().slice(11,16));
            }
            setAddress(eventData.address || eventData.city || "");
            setZipcode((eventData as any).zipcode || "");
            setCoverImage(eventData.coverImage || "");
            if (eventData.ageRestriction) {
              setAgeRestriction(eventData.ageRestriction as 'ALL' | '18+' | '21+');
            }
          }
        } catch (err) {
          console.error('Failed to load event data:', err);
          alert('Failed to load event details. Please refresh the page.');
        }
      };
      loadData();
    }
  }, [editEventId, isEditMode]); // Only run when edit mode changes, not on every render

  // Unified modern input style
  const inputStyle: React.CSSProperties = {
    background: '#F7F8FB',
    border: '1px solid #E6E8ED',
    color: '#0B1A33',
    borderRadius: 14,
    padding: '12px 14px',
    boxShadow: 'inset 0 1px 1px rgba(16,24,40,0.02)',
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Block submission if Stripe is not connected (only for new events)
    if (!isEditMode && isStripeConnected === false) {
      alert('Please connect your Stripe account to create events. Go to your dashboard to connect your account.');
      return;
    }
    
    // Validate: Don't allow saving if coverImage is still a blob URL (upload failed)
    if (coverImage && coverImage.startsWith('blob:')) {
      alert('Please wait for the image to finish uploading, or upload a new image.');
      return;
    }
    
    // Validate: Don't allow saving if upload is in progress
    if (coverImageUploading) {
      alert('Please wait for the image upload to complete.');
      return;
    }
    
    setSubmitting(true);
    try {
      // Create date string - if no time provided, use current time or a future time
      const dateTimeString = startTime ? `${startDate}T${startTime}` : `${startDate}T12:00`;
      const startIso = new Date(dateTimeString).toISOString();
      const endIso = endDate ? new Date(endTime ? `${endDate}T${endTime}` : `${endDate}T12:00`).toISOString() : undefined;
      
      // Debug logging
      console.log('📅 Creating event with dates:', {
        startDate,
        startTime: startTime || '12:00 (default)',
        dateTimeString,
        startIso,
        parsedDate: new Date(startIso),
        now: new Date(),
        isFuture: new Date(startIso) > new Date()
      });
      
      if (isEditMode && editEventId) {
        // Update existing
        console.log('🔧 Updating event with data:', {
          title,
          description: descriptionHtml,
          editEventId
        });
        const result = await updateBackendEvent(editEventId, {
          title,
          startDate: startIso,
          endDate: endIso,
          address: address || undefined,
          location: address || undefined,
          zipcode: zipcode || undefined,
          coverImage: coverImage || undefined,
          description: descriptionHtml || undefined,
          ageRestriction,
        });
        console.log('✅ Update result:', result);
        // Don't update local storage for edits - let backend be the source of truth
        onSuccess(editEventId);
      } else {
        // Create new
        let created: any;
        if (!user?.email) throw new Error('User not logged in');
        created = await createBackendEvent({
          title,
          startDate: startIso,
          endDate: endIso,
          address: address || undefined,
          location: address || undefined,
          zipcode: zipcode || undefined,
          coverImage: coverImage || undefined,
          images: [],
          organizerEmail: user.email,
          description: descriptionHtml || undefined,
          status: 'DRAFT',
          visibility: 'PUBLIC',
          ageRestriction,
        });
        // Dispatch custom event to notify other pages that an event was created
        if (typeof window !== 'undefined') {
          console.log('🎉 Dispatching eventCreated event with:', { eventId: created?.id, created });
          // Dispatch immediately
          window.dispatchEvent(new CustomEvent('eventCreated', { detail: { eventId: created?.id, event: created } }));
          // Also dispatch after a short delay to ensure backend has processed
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('eventCreated', { detail: { eventId: created?.id, event: created } }));
          }, 2000);
        }
        onSuccess(created?.id);
      }
    } catch (err) {
      alert('Failed to create event');
    } finally {
      setSubmitting(false);
    }
  };

  // Block the form only on the initial Stripe check — never during uploads or file-picker focus
  const awaitingInitialStripeCheck =
    !isEditMode &&
    user?.role === 'ORGANIZER' &&
    !stripeCheckResolved &&
    (checkingStripe || isStripeConnected === null);

  if (!authChecked || awaitingInitialStripeCheck) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="text-lg text-zinc-600">Checking Stripe connection...</div>
        </div>
      </div>
    );
  }

  if (!isEditMode && isStripeConnected === false) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ background: '#FFFBF0', borderColor: '#FCD34D' }}>
        <div className="mb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: '#FEF3C7' }}>
            <svg className="h-8 w-8" style={{ color: '#F59E0B' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2" style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>
            Stripe Account Required
          </h3>
          <p className="text-zinc-600 mb-6">
            Please connect your Stripe account to create events. This allows you to receive payments for ticket sales.
          </p>
          <Link
            href="/dashboard?tab=payouts"
            className="inline-block px-6 py-3 rounded-full font-medium shadow-sm hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#D4AF37', color: 'black', fontFamily: 'Raleway', fontWeight: 700 }}
          >
            Go to Dashboard to Connect Stripe
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-600">Use AI to prefill your event</div>
        <button
          type="button"
          onClick={handleAiCreate}
          disabled={aiLoading || submitting}
          className="px-4 py-2 rounded-full font-medium shadow-sm"
          style={{ backgroundColor: '#FFFFFF', color: '#0B1A33', border: '1px solid #E5E7EB' }}
        >
          {aiLoading ? 'Thinking…' : 'AI Event Creation'}
        </button>
      </div>
      {/* Step 1: Event Details */}
      <label className="grid gap-1 text-sm">
        <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>Title</span>
        <input
          className="focus:outline-none focus:ring-2"
          style={inputStyle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event title"
          required
        />
      </label>
      
      <label className="grid gap-1 text-sm">
        <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>Description</span>
        <textarea
          key={(isEditMode && editEventId) ? `desc-${editEventId}` : 'desc-new'}
          className="shadow-sm resize-none"
          style={{ ...inputStyle, minHeight: '120px', direction: 'ltr', textAlign: 'left' }}
          value={descriptionHtml}
          onChange={(e) => setDescriptionHtml(e.target.value)}
          placeholder="Enter event description..."
        />
        <span className="text-xs" style={{ color: '#6B7280' }}>Enter your event description here.</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-1 gap-3">
        <label className="grid gap-1 text-sm">
          <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>Age Restriction</span>
          <select
            className="focus:outline-none focus:ring-2"
            style={inputStyle}
            value={ageRestriction}
            onChange={(e) => setAgeRestriction(e.target.value as any)}
          >
            <option value="ALL">All ages</option>
            <option value="18+">18+</option>
            <option value="21+">21+</option>
          </select>
        </label>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>Start Date</span>
          <input
            type="date"
            className="focus:outline-none focus:ring-2"
            style={inputStyle}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>Start Time</span>
          <input
            type="time"
            className="focus:outline-none focus:ring-2"
            style={inputStyle}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>End Date</span>
          <input
            type="date"
            className="focus:outline-none focus:ring-2"
            style={inputStyle}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>End Time</span>
          <input
            type="time"
            className="focus:outline-none focus:ring-2"
            style={inputStyle}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>Address</span>
        <input
          className="focus:outline-none focus:ring-2"
          style={inputStyle}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Event address (optional)"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>Zipcode</span>
        <input
          className="focus:outline-none focus:ring-2"
          style={inputStyle}
          value={zipcode}
          onChange={(e) => setZipcode(e.target.value)}
          placeholder="Zipcode (optional)"
        />
      </label>

      {/* Keep the existing cover image section exactly as it is */}
      <div className="grid gap-1 text-sm">
        <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>
          Cover Image 
          {coverImageUploading && <span className="text-blue-600 ml-2">(Uploading...)</span>}
          {coverImageError && <span className="text-red-600 ml-2">({coverImageError})</span>}
          {coverImage && !coverImageUploading && !coverImageError && `(${coverImage.startsWith('blob:') ? 'Preview - Uploading...' : coverImage.slice(0, 30)}...)`}
        </span>
        <input id="cover-file" type="file" accept="image/*" className="sr-only" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            alert('Image must be under 5MB');
            e.target.value = '';
            return;
          }
          
          setCoverImageError(null);
          setCoverImageUploading(true);
          
          // 1. Show immediate preview with blob URL
          const blobUrl = URL.createObjectURL(file);
          console.log('🖼️ Setting preview:', blobUrl);
          setCoverImage(blobUrl);
          
          // 2. Upload to backend - MUST succeed before saving
          try {
            const uploadedUrl = await uploadImage(file);
            if (uploadedUrl && !uploadedUrl.startsWith('blob:')) {
              console.log('✅ Image uploaded:', uploadedUrl);
              URL.revokeObjectURL(blobUrl);
              setCoverImage(uploadedUrl);
              setCoverImageError(null);
            } else {
              throw new Error('Invalid upload response');
            }
          } catch (err: any) {
            console.error('❌ Upload failed:', err);
            URL.revokeObjectURL(blobUrl);
            setCoverImage('');
            setCoverImageError('Image upload failed. Please try again.');
            alert('Image upload failed. Please try again.');
          } finally {
            setCoverImageUploading(false);
            e.target.value = '';
          }
        }} />
        {coverImage ? (
          <label htmlFor="cover-file" className="block cursor-pointer rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: '#E5E7EB', background: '#FFFFFF' }}>
            <div
              className="relative w-full"
          style={{
                height: '180px',
                backgroundImage: `url(${coverImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            >
              <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" />
              <div className="absolute bottom-2 right-2 px-3 py-1 rounded-full text-sm" style={{ background: '#FFFFFF', color: '#0B1A33', border: '1px solid #E5E7EB' }}>Change</div>
            </div>
          </label>
        ) : (
          <label htmlFor="cover-file" className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed shadow-sm" style={{ borderColor: '#D1D5DB', background: '#FBFBFB', padding: '28px' }}>
            <div className="flex flex-col items-center justify-center text-center" style={{ color: '#6B7280' }}>
              <div className="flex items-center justify-center rounded-full" style={{ width: '48px', height: '48px', background: '#F3F4F6', color: '#9CA3AF', fontSize: '28px', lineHeight: '48px' }}>+</div>
              <div className="mt-2" style={{ fontFamily: 'Raleway' }}>Click to upload</div>
              <div className="text-xs" style={{ color: '#9CA3AF' }}>PNG, JPG up to 5MB</div>
            </div>
      </label>
        )}
      </div>

      {/* Keep the existing buttons exactly as they are */}
      <div className="flex items-center gap-3 mt-6">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-3 rounded-full font-medium elevate-hover shadow-sm"
          style={{ backgroundColor: '#D4AF37', color: 'black', fontFamily: 'Raleway', fontWeight: 700, opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? 'Saving…' : 'Save & Continue'}
        </button>
      <button
          type="button"
        disabled={submitting}
          onClick={(e) => submit(e as any)}
          className="px-6 py-3 rounded-full font-medium shadow-sm"
          style={{ backgroundColor: '#FFFFFF', color: '#0B1A33', border: '1px solid #E5E7EB' }}
      >
          Save as Draft
      </button>
      </div>

      {/* Location Modal */}
      {showLocationModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '24px',
              padding: '40px',
              width: '90%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
          >
            <h2
              style={{
                fontFamily: 'Raleway',
                fontWeight: 600,
                fontSize: '24px',
                color: '#0B1A33',
                margin: '0 0 20px 0',
                textAlign: 'center'
              }}
            >
              Add Location
            </h2>
            
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm">
                <span style={{ color: '#0B1A33', fontFamily: 'Raleway' }}>Venue Name</span>
                <input
                  className="focus:outline-none focus:ring-2"
                  style={inputStyle}
                  placeholder="Enter venue name"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '30px' }}>
              <button
                onClick={() => setShowLocationModal(false)}
                style={{
                  backgroundColor: '#D4AF37',
                  color: 'black',
                  border: 'none',
                  borderRadius: '22px',
                  padding: '12px 32px',
                  fontFamily: 'Raleway',
                  fontWeight: 600,
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                Save Location
              </button>
              <button
                onClick={() => {
                  setShowLocationModal(false);
                  setAddress('');
                }}
                style={{
                  backgroundColor: 'transparent',
                  color: '#D4AF37',
                  border: '2px solid #D4AF37',
                  borderRadius: '22px',
                  padding: '10px 32px',
                  fontFamily: 'Raleway',
                  fontWeight: 610,
                  fontSize: '16px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EventsPageContent />
    </Suspense>
  );
}