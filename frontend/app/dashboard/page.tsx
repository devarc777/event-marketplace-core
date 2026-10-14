"use client";

import React, { useEffect, useMemo, useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRoleContext } from "../../components/RoleContext";
import Image from "next/image";
import { deleteBackendEvent } from "../../lib/services/events";
import { resolveApiBaseUrl } from "@/lib/api-base";
import { getAuthHeaders } from "@/lib/auth-utils";

type TicketSale = {
  eventId: string;
  title: string;
  ticketsSold: number;
  earnings: number;
  currency: string;
};

type OrganizerEvent = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  address: string | null;
  basePrice?: number | null;
  coverImage?: string | null;
  visibility?: string | null;
  vendors?: Array<{
    id: string;
    status: string;
    vendor: {
      id: string;
      businessName: string;
      category: string;
    };
  }>;
};

type Booking = {
  id: string;
  bookingNumber: string;
  totalAmount: number;
  currency: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  user: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  };
  event: {
    id: string;
    title: string;
  };
  tickets: Array<{
    id: string;
    ticketNumber: string;
    price: number;
    tier?: string | null;
    status: string;
  }>;
};

type WorkOrder = {
  id: string;
  status?: string | null;
  createdAt?: string | null;
  paymentStatus?: string | null;
  vendor?: {
    businessName?: string | null;
    category?: string | null;
  } | null;
  quoteRequest?: {
    id: string;
    fullName: string | null;
    eventType: string | null;
    eventDate: string | null;
    quotePrice: number | null;
  } | null;
  serviceBid?: {
    id: string;
    bidAmount: number | null;
    currency: string | null;
    eventService?: {
      id: string;
      title: string | null;
      event?: {
        id: string;
        title: string | null;
      } | null;
    } | null;
  } | null;
};

type QuoteRequest = {
  id: string;
  fullName: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  numberOfGuests: number;
  budgetRange: string;
  status: string;
  createdAt: string;
  vendor: {
    businessName: string;
    category: string;
  };
};

type RFQ = {
  id: string;
  title: string;
  description: string;
  category: string;
  budget?: number | null;
  status: string;
  eventDate?: string | null;
  deadline?: string | null;
  createdAt: string;
  eventId?: string;
  event: {
    id: string;
    title: string;
  };
  proposals?: Array<{
    id: string;
    title: string;
    price: number;
    status: string;
    vendor: {
      businessName: string;
    };
  }>;
};

const API_BASE = resolveApiBaseUrl();

function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...getAuthHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

// Component that handles search params - must be wrapped in Suspense
function StripeConnectRefreshHandler({
  isAuthenticated,
  user,
  router,
  setStripeConnectEnabled,
}: {
  isAuthenticated: boolean;
  user: any;
  router: any;
  setStripeConnectEnabled: (enabled: boolean) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const returnParam = searchParams?.get('return');
    const refreshParam = searchParams?.get('refresh');
    
    if ((returnParam === 'true' || refreshParam === 'true') && isAuthenticated && user?.role === 'ORGANIZER') {
      console.log('🔄 Refreshing Stripe Connect status after onboarding...');
      
      // Force refresh Stripe Connect status
      const refreshStatus = async () => {
        try {
          const response = await authFetch(`${API_BASE}/events/organizer/stripe-connect/status`);
          if (response.ok) {
            const statusData = await response.json();
            setStripeConnectEnabled(statusData.enabled || false);
            console.log('✅ Stripe Connect status refreshed:', statusData.enabled);
            
            // Clean up URL parameters
            router.replace('/dashboard?tab=payouts');
          }
        } catch (error) {
          console.error('Error refreshing Stripe Connect status:', error);
        }
      };
      
      // Small delay to ensure Stripe has processed the onboarding
      setTimeout(refreshStatus, 1000);
    }
  }, [searchParams, isAuthenticated, user, router, setStripeConnectEnabled]);

  return null;
}

function OrganizerDashboardContent() {
  const router = useRouter();
  const { isAuthenticated, user, authChecked, logout } = useRoleContext();
  const searchParams = useSearchParams();
  const [serverAuthChecked, setServerAuthChecked] = useState(false);
  const serverAuthCancelled = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [ticketSales, setTicketSales] = useState<TicketSale[]>([]);
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [eventServices, setEventServices] = useState<Array<{
    id: string;
    title: string;
    description?: string | null;
    category: string;
    budget?: number | null;
    currency?: string;
    status: string;
    postalCode?: string | null;
    createdAt: string;
    bids?: Array<{
      id: string;
      bidAmount: number;
      status: string;
      vendor: {
        businessName: string;
      };
    }>;
  }>>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "sales" | "vendors" | "requests" | "bookings" | "payouts" | "manage-events">("overview");
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string } | null>(null);
  const [showDeleteEventModal, setShowDeleteEventModal] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [showRFQsModal, setShowRFQsModal] = useState(false);
  const [selectedEventForRFQs, setSelectedEventForRFQs] = useState<OrganizerEvent | null>(null);
  const [loadingEventServices, setLoadingEventServices] = useState(false);
  const [payoutBalance, setPayoutBalance] = useState<number>(0);
  const [payoutHistory, setPayoutHistory] = useState<Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    paidAt?: string | null;
  }>>([]);
  const [stripeConnectEnabled, setStripeConnectEnabled] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Initialize active tab from ?tab= query parameter when available
  useEffect(() => {
    const tab = searchParams?.get('tab');
    if (!tab) return;
    const allowedTabs = ["overview", "sales", "vendors", "requests", "bookings", "payouts", "manage-events"];
    if (allowedTabs.includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  // Explicit auth check (same as /events): redirect to login if not logged in
  useEffect(() => {
    serverAuthCancelled.current = false;
    (async () => {
      try {
        const API_BASE = resolveApiBaseUrl();
        const response = await authFetch(`${API_BASE}/auth/me`);
        if (serverAuthCancelled.current) return;
        if (!response.ok) {
          const currentPath =
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : "/dashboard";
          router.replace(`/auth/login?returnUrl=${encodeURIComponent(currentPath)}`);
          return;
        }
        setServerAuthChecked(true);
      } catch {
        if (serverAuthCancelled.current) return;
        const currentPath =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/dashboard";
        router.replace(`/auth/login?returnUrl=${encodeURIComponent(currentPath)}`);
      }
    })();
    return () => { serverAuthCancelled.current = true; };
  }, [router]);

  // EventServices are already filtered by event when fetched

  useEffect(() => {
    if (!authChecked || !serverAuthChecked) return;
    
    // Wait a bit for auth state to settle after redirect
    if (!isAuthenticated || user?.role !== "ORGANIZER") {
      const timeoutId = setTimeout(() => {
        const currentPath =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/dashboard";

        // If still not authenticated, send to login
        if (!isAuthenticated) {
          router.replace(`/auth/login?redirect=${encodeURIComponent(currentPath)}`);
          return;
        }

        // If this is a vendor account, require a separate organizer login
        // instead of hijacking the organizer dashboard with the vendor one.
        if (user?.role === "VENDOR") {
          router.replace(`/auth/login?redirect=${encodeURIComponent(currentPath)}`);
          return;
        }

        // Any other non-organizer roles can be sent to homepage
        if (user?.role !== "ORGANIZER") {
          router.replace("/");
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const qsEmail = user?.email ? `?email=${encodeURIComponent(user.email)}` : "";
        
        // Fetch all data in parallel
        const [salesRes, eventsRes, workOrdersRes, quoteRequestsRes] = await Promise.all([
          authFetch(`${API_BASE}/events/organizer/ticket-sales`),
          authFetch(`${API_BASE}/events/by-organizer${qsEmail}`),
          authFetch(`${API_BASE}/work-orders/organizer/my-orders`),
          authFetch(`${API_BASE}/quote-requests/my-requests`),
        ]);

        if (!salesRes.ok) throw new Error("Failed to load ticket sales");
        if (!eventsRes.ok) throw new Error("Failed to load events");
        if (!workOrdersRes.ok) throw new Error("Failed to load work orders");
        if (!quoteRequestsRes.ok) throw new Error("Failed to load quote requests");

        const [salesJson, eventsJson, workOrdersJson, quoteRequestsJson] = await Promise.all([
          salesRes.json(),
          eventsRes.json(),
          workOrdersRes.json(),
          quoteRequestsRes.json(),
        ]);

        setTicketSales(Array.isArray(salesJson) ? salesJson : []);
        setEvents(Array.isArray(eventsJson) ? eventsJson : []);
        setWorkOrders(Array.isArray(workOrdersJson) ? workOrdersJson : []);
        setQuoteRequests(Array.isArray(quoteRequestsJson) ? quoteRequestsJson : []);

        // Fetch bookings, vendors, RFQs, and payout data for organizer
        const [bookingsRes, vendorsRes, rfqsRes, balanceRes, payoutHistoryRes, stripeStatusRes] = await Promise.all([
          authFetch(`${API_BASE}/events/organizer/bookings`).catch(() => null),
          authFetch(`${API_BASE}/events/organizer/vendors`).catch(() => null),
          authFetch(`${API_BASE}/events/organizer/rfqs`).catch(() => null),
          authFetch(`${API_BASE}/payouts/organizer/balance`).catch(() => null),
          authFetch(`${API_BASE}/payouts/organizer/history`).catch(() => null),
          authFetch(`${API_BASE}/events/organizer/stripe-connect/status`).catch(() => null),
        ]);

        if (bookingsRes?.ok) {
          const bookingsData = await bookingsRes.json();
          setBookings(Array.isArray(bookingsData) ? bookingsData : []);
        }

        if (vendorsRes?.ok) {
          const vendorsData = await vendorsRes.json();
          // Merge vendors into events
          if (Array.isArray(vendorsData)) {
            setEvents(prevEvents => 
              prevEvents.map(event => {
                const vendorData = vendorsData.find((v: any) => v.eventId === event.id);
                return {
                  ...event,
                  vendors: vendorData?.vendors || [],
                };
              })
            );
          }
        }

        if (rfqsRes?.ok) {
          const rfqsData = await rfqsRes.json();
          console.log('✅ RFQs loaded on dashboard init:', rfqsData);
          setRfqs(Array.isArray(rfqsData) ? rfqsData : []);
        } else if (rfqsRes) {
          console.error('❌ RFQs fetch failed:', rfqsRes.status);
          const errorText = await rfqsRes.text().catch(() => 'Unknown error');
          console.error('Error details:', errorText);
        }

        let balanceData: any = null;
        let historyData: any = null;
        
        if (balanceRes?.ok) {
          balanceData = await balanceRes.json();
          setPayoutBalance(Number(balanceData.balance) || 0);
        }

        if (payoutHistoryRes?.ok) {
          historyData = await payoutHistoryRes.json();
          setPayoutHistory(Array.isArray(historyData) ? historyData : []);
        }

        if (stripeStatusRes?.ok) {
          const statusData = await stripeStatusRes.json();
          setStripeConnectEnabled(statusData.enabled || false);
        } else {
          // If status check failed, check if user has received payments
          // If they have a payout balance or history, Stripe must be connected
          const hasBalance = balanceData && Number(balanceData.balance) > 0;
          const hasHistory = historyData && Array.isArray(historyData) && historyData.length > 0;
          // If they have any balance or payout history, Stripe is definitely connected
          setStripeConnectEnabled(hasBalance || hasHistory);
        }

      } catch (err: any) {
        setError(err?.message || "Unable to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authChecked, serverAuthChecked, isAuthenticated, router, user]);

  const metrics = useMemo(() => {
    const totalEarnings = ticketSales.reduce((sum, s) => sum + (Number(s.earnings) || 0), 0);
    const totalTickets = ticketSales.reduce((sum, s) => sum + (Number(s.ticketsSold) || 0), 0);
    const activeEvents = events.length;
    const openWorkOrders = workOrders.filter(wo => wo.status !== "COMPLETED" && wo.status !== "CANCELLED").length;
    const pendingQuoteRequests = quoteRequests.filter(qr => qr.status === "PENDING" || qr.status === "QUOTED").length;
    const activeVendors = new Set(
      events.flatMap(e => e.vendors?.map(v => v.vendor.id) || [])
    ).size;
    const totalBookings = bookings.length;
    
    return { 
      totalEarnings, 
      totalTickets, 
      activeEvents, 
      openWorkOrders,
      pendingQuoteRequests,
      activeVendors,
      totalBookings,
    };
  }, [ticketSales, events, workOrders, quoteRequests, bookings]);

  const getStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase() || "";
    if (statusLower.includes("completed") || statusLower.includes("accepted") || statusLower === "confirmed") {
      return "bg-green-50 text-green-700 border-green-200";
    }
    if (statusLower.includes("pending") || statusLower === "submitted") {
      return "bg-yellow-50 text-yellow-700 border-yellow-200";
    }
    if (statusLower.includes("cancelled") || statusLower.includes("rejected")) {
      return "bg-red-50 text-red-700 border-red-200";
    }
    if (statusLower.includes("in_progress") || statusLower === "active") {
      return "bg-blue-50 text-blue-700 border-blue-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  const handleLogout = async () => {
    try {
      await logout({ vendor: false });
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleDeleteEvent = (event: OrganizerEvent) => {
    setEventToDelete({ id: event.id, title: event.title });
    setShowDeleteEventModal(true);
  };

  const confirmDeleteEvent = async () => {
    if (!eventToDelete) return;
    
    setDeletingEvent(true);
    try {
      await deleteBackendEvent(eventToDelete.id);
      
      // Refresh events list
      if (user?.email) {
        const qsEmail = user.email ? `?email=${encodeURIComponent(user.email)}` : "";
        const eventsRes = await authFetch(`${API_BASE}/events/by-organizer${qsEmail}`);
        if (eventsRes.ok) {
          const eventsJson = await eventsRes.json();
          setEvents(Array.isArray(eventsJson) ? eventsJson : []);
        }
      }
      
      setShowDeleteEventModal(false);
      setEventToDelete(null);
    } catch (error: any) {
      console.error('Delete error:', error);
      alert(`Failed to delete event: ${error?.message || 'Unknown error'}`);
    } finally {
      setDeletingEvent(false);
    }
  };

  const handleEditEvent = (eventId: string) => {
    router.push(`/events?edit=${eventId}`);
  };

  const handleViewRFQs = async (event: OrganizerEvent) => {
    console.log('🔵 Opening RFQs modal for event:', event.id, event.title);
    setSelectedEventForRFQs(event);
    setShowRFQsModal(true);
    setLoadingEventServices(true);
    
    // Fetch EventServices (post requests) for this event
    try {
      console.log('🔄 Fetching EventServices from:', `${API_BASE}/events/${event.id}/services`);
      const servicesRes = await authFetch(`${API_BASE}/events/${event.id}/services`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      console.log('📡 EventServices response:', {
        status: servicesRes.status,
        ok: servicesRes.ok,
        statusText: servicesRes.statusText
      });
      
      if (servicesRes.ok) {
        const servicesData = await servicesRes.json();
        console.log('✅ EventServices data received:', servicesData);
        console.log('📊 Is array?', Array.isArray(servicesData));
        console.log('📊 EventServices count:', Array.isArray(servicesData) ? servicesData.length : 'Not an array');
        
        if (Array.isArray(servicesData)) {
          // Fetch bids for each service to show proposal count
          const servicesWithBids = await Promise.all(
            servicesData.map(async (service: any) => {
              try {
                const bidsRes = await authFetch(`${API_BASE}/events/${event.id}/services/${service.id}/bids`, {
                  headers: { 'Accept': 'application/json' },
                });
                if (bidsRes.ok) {
                  const bids = await bidsRes.json();
                  return { ...service, bids: Array.isArray(bids) ? bids : [] };
                }
                return { ...service, bids: [] };
              } catch {
                return { ...service, bids: [] };
              }
            })
          );
          setEventServices(servicesWithBids);
          console.log('✅ EventServices state updated, count:', servicesWithBids.length);
        } else {
          console.error('❌ EventServices data is not an array:', typeof servicesData, servicesData);
          setEventServices([]);
        }
      } else {
        const errorText = await servicesRes.text().catch(() => 'Could not read error');
        console.error('❌ EventServices fetch failed:', servicesRes.status, errorText);
        setEventServices([]);
      }
    } catch (error: any) {
      console.error('❌ Error fetching EventServices:', error);
      setEventServices([]);
    } finally {
      setLoadingEventServices(false);
    }
  };

  if (!serverAuthChecked || !authChecked || (!isAuthenticated && !error)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense fallback={null}>
        <StripeConnectRefreshHandler
          isAuthenticated={isAuthenticated}
          user={user}
          router={router}
          setStripeConnectEnabled={setStripeConnectEnabled}
        />
      </Suspense>
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
              </h1>
              <p className="text-slate-600 mt-1">Manage your events, sales, and vendor services</p>
            </div>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 lg:px-8 py-8 space-y-8">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Metrics Cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Total Earnings</p>
            <p className="text-3xl font-bold text-slate-900">
              {metrics.totalEarnings.toLocaleString(undefined, { 
                style: "currency", 
                currency: ticketSales[0]?.currency || "USD" 
              })}
            </p>
            <p className="text-xs text-slate-500 mt-2">From completed sales</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Tickets Sold</p>
            <p className="text-3xl font-bold text-slate-900">{metrics.totalTickets}</p>
            <p className="text-xs text-slate-500 mt-2">Across all events</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Active Events</p>
            <p className="text-3xl font-bold text-slate-900">{metrics.activeEvents}</p>
            <p className="text-xs text-slate-500 mt-2">Published or draft</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Work Orders</p>
            <p className="text-3xl font-bold text-slate-900">{metrics.openWorkOrders}</p>
            <p className="text-xs text-slate-500 mt-2">Vendor services in progress</p>
          </div>
        </section>

        {/* Additional Metrics */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Active Vendors</p>
            <p className="text-2xl font-bold text-slate-900">{metrics.activeVendors}</p>
            <p className="text-xs text-slate-500 mt-2">Working on your events</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Quote Requests</p>
            <p className="text-2xl font-bold text-slate-900">{metrics.pendingQuoteRequests}</p>
            <p className="text-xs text-slate-500 mt-2">Pending or quoted</p>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Total Bookings</p>
            <p className="text-2xl font-bold text-slate-900">{metrics.totalBookings}</p>
            <p className="text-xs text-slate-500 mt-2">All time bookings</p>
              </div>
        </section>

        {/* Tabs */}
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: "overview", label: "Overview" },
              { id: "sales", label: "Ticket Sales" },
              { id: "vendors", label: "Vendors" },
              { id: "requests", label: "Requests" },
              { id: "bookings", label: "Bookings" },
              { id: "payouts", label: "Payouts" },
              { id: "manage-events", label: "Manage Events" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
            </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Top Ticket Sales */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Ticket Sales</h2>
            {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
            ) : ticketSales.length === 0 ? (
              <p className="text-sm text-slate-500">No ticket sales yet.</p>
            ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Event</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Tickets</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Earnings</th>
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-slate-200">
                      {ticketSales.slice(0, 10).map((sale) => (
                      <tr key={sale.eventId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{sale.title}</td>
                        <td className="px-4 py-3 text-slate-700">{sale.ticketsSold}</td>
                        <td className="px-4 py-3 text-slate-900 font-semibold">
                            {Number(sale.earnings).toLocaleString(undefined, { 
                              style: "currency", 
                              currency: sale.currency || "USD" 
                            })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

            {/* Recent Work Orders */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Work Orders</h2>
            {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
          ) : workOrders.length === 0 ? (
            <p className="text-sm text-slate-500">No work orders yet.</p>
          ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Service</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Vendor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Value</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Date</th>
                  </tr>
                </thead>
                    <tbody className="divide-y divide-slate-200">
                      {workOrders.slice(0, 10).map((wo) => {
                    const title =
                      wo.serviceBid?.eventService?.title ||
                      wo.quoteRequest?.eventType ||
                      wo.serviceBid?.eventService?.event?.title ||
                      "Service";
                    const value = wo.serviceBid?.bidAmount ?? wo.quoteRequest?.quotePrice ?? null;
                    const currency = wo.serviceBid?.currency || "USD";
                    return (
                      <tr key={wo.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{title}</td>
                        <td className="px-4 py-3 text-slate-700">{wo.vendor?.businessName || "Vendor"}</td>
                        <td className="px-4 py-3">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${getStatusColor(wo.status || "")}`}>
                            {wo.status || "PENDING"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-900 font-semibold">
                              {value !== null 
                                ? Number(value).toLocaleString(undefined, { style: "currency", currency }) 
                                : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {wo.createdAt ? new Date(wo.createdAt).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
            </div>
          </div>
        )}

        {activeTab === "sales" && (
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">All Ticket Sales</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : ticketSales.length === 0 ? (
              <p className="text-sm text-slate-500">No ticket sales yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Event</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Tickets Sold</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Total Earnings</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Avg per Ticket</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ticketSales.map((sale) => {
                      const avgPerTicket = sale.ticketsSold > 0 
                        ? Number(sale.earnings) / sale.ticketsSold 
                        : 0;
                      return (
                        <tr key={sale.eventId} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{sale.title}</td>
                          <td className="px-4 py-3 text-slate-700">{sale.ticketsSold}</td>
                          <td className="px-4 py-3 text-slate-900 font-semibold">
                            {Number(sale.earnings).toLocaleString(undefined, { 
                              style: "currency", 
                              currency: sale.currency || "USD" 
                            })}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {avgPerTicket.toLocaleString(undefined, { 
                              style: "currency", 
                              currency: sale.currency || "USD" 
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "vendors" && (
          <div className="space-y-6">
            {events.map((event) => (
              event.vendors && event.vendors.length > 0 && (
                <div key={event.id} className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">{event.title}</h2>
                    <span className="text-sm text-slate-500">{event.vendors.length} vendor(s)</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {event.vendors.map((ev) => (
                      <div key={ev.id} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-slate-900">{ev.vendor.businessName}</h3>
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold border ${getStatusColor(ev.status)}`}>
                            {ev.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">{ev.vendor.category}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
            {events.every(e => !e.vendors || e.vendors.length === 0) && (
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
                <p className="text-sm text-slate-500">No vendors assigned to your events yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <div className="space-y-6">
            {/* Quote Requests */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Quote Requests</h2>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : quoteRequests.length === 0 ? (
                <p className="text-sm text-slate-500">No quote requests yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Event Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Vendor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Guests</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Budget</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {quoteRequests.map((qr) => (
                        <tr key={qr.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{qr.eventType}</td>
                          <td className="px-4 py-3 text-slate-700">{qr.vendor.businessName}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {new Date(qr.eventDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{qr.numberOfGuests}</td>
                          <td className="px-4 py-3 text-slate-700">{qr.budgetRange}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${getStatusColor(qr.status)}`}>
                              {qr.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* RFQs */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">RFQs (Request for Quotations)</h2>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : rfqs.length === 0 ? (
                <p className="text-sm text-slate-500">No RFQs yet.</p>
              ) : (
                <div className="space-y-4">
                  {rfqs.map((rfq) => (
                    <div key={rfq.id} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-slate-900">{rfq.title}</h3>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${getStatusColor(rfq.status)}`}>
                          {rfq.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{rfq.description}</p>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span>Event: {rfq.event.title}</span>
                        {rfq.budget && (
                          <span>Budget: {Number(rfq.budget).toLocaleString(undefined, { style: "currency", currency: "USD" })}</span>
                        )}
                        {rfq.deadline && (
                          <span>Deadline: {new Date(rfq.deadline).toLocaleDateString()}</span>
                        )}
                      </div>
                      {rfq.proposals && rfq.proposals.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
                          <p className="text-sm font-semibold text-slate-700 mb-2">Proposals ({rfq.proposals.length}):</p>
                          <div className="space-y-2">
                            {rfq.proposals.map((proposal) => (
                              <div key={proposal.id} className="flex items-center justify-between text-sm">
                                <span className="text-slate-700">{proposal.vendor.businessName} - {proposal.title}</span>
                                <span className="font-semibold text-slate-900">
                                  {Number(proposal.price).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "bookings" && (
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Bookings</h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading...</p>
            ) : bookings.length === 0 ? (
              <p className="text-sm text-slate-500">No bookings yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Booking #</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Event</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Tickets</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {bookings.map((booking) => (
                      <tr key={booking.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{booking.bookingNumber}</td>
                        <td className="px-4 py-3 text-slate-700">{booking.event.title}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {booking.user.firstName || booking.user.lastName
                            ? `${booking.user.firstName || ""} ${booking.user.lastName || ""}`.trim()
                            : booking.user.email || "Customer"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{booking.tickets.length}</td>
                        <td className="px-4 py-3 text-slate-900 font-semibold">
                          {Number(booking.totalAmount).toLocaleString(undefined, { 
                            style: "currency", 
                            currency: booking.currency || "USD" 
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${getStatusColor(booking.paymentStatus)}`}>
                            {booking.paymentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {new Date(booking.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "payouts" && (
          <div className="space-y-6">
            {/* Stripe Connect Setup */}
            {!stripeConnectEnabled && (
              <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-6">
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">Stripe Connect Setup Required</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  You need to set up a Stripe Connect account to receive payouts. This allows you to withdraw your earnings directly to your bank account.
                </p>
                <button
                  onClick={async () => {
                    setCheckingStatus(true);
                    try {
                      const response = await authFetch(`${API_BASE}/events/organizer/stripe-connect/create`, {
                        method: 'POST',
                      });
                      if (response.ok) {
                        const data = await response.json();
                        if (data.onboardingUrl) {
                          window.location.href = data.onboardingUrl;
                        }
                      } else {
                        const errorData = await response.json().catch(() => ({ message: 'Failed to create account' }));
                        alert(errorData.message || 'Failed to create Stripe Connect account');
                      }
                    } catch (error) {
                      console.error('Error creating Stripe Connect account:', error);
                      alert('Failed to create Stripe Connect account');
                    } finally {
                      setCheckingStatus(false);
                    }
                  }}
                  disabled={checkingStatus}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition disabled:opacity-50"
                >
                  {checkingStatus ? "Setting up..." : "Set Up Stripe Connect"}
                </button>
              </div>
            )}

            {/* Available Balance */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Available Balance</h2>
              <div className="flex items-baseline gap-2 mb-6">
                <p className="text-4xl font-bold text-slate-900">
                  ${payoutBalance.toFixed(2)}
                </p>
                <p className="text-sm text-slate-500">USD</p>
              </div>
              <p className="text-sm text-slate-600 mb-2">
                This is your total earnings from ticket sales minus any payouts you've already received.
              </p>
              {stripeConnectEnabled && (
                <p className="text-sm text-blue-600 font-medium">
                  💰 This balance is readily available in your Stripe Connect account. You can withdraw directly from your Stripe dashboard.
                </p>
              )}
            </div>

            {/* Payout History */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Payout History</h2>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : payoutHistory.length === 0 ? (
                <p className="text-sm text-slate-500">No payout history yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Paid At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {payoutHistory.map((payout) => (
                        <tr key={payout.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700">
                            {new Date(payout.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-slate-900 font-semibold">
                            {Number(payout.amount).toLocaleString(undefined, { 
                              style: "currency", 
                              currency: payout.currency || "USD" 
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${getStatusColor(payout.status)}`}>
                              {payout.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "manage-events" && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">All Events</h2>
              {loading ? (
                <p className="text-sm text-slate-500">Loading...</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-slate-500">No events yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Event</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Location</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {events.map((event) => (
                        <tr key={event.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {event.coverImage && (
                                <Image
                                  src={event.coverImage}
                                  alt={event.title}
                                  width={48}
                                  height={48}
                                  className="rounded-lg object-cover"
                                />
                              )}
                              <div>
                                <p className="font-medium text-slate-900">{event.title}</p>
                                {event.basePrice && (
                                  <p className="text-xs text-slate-500">
                                    {Number(event.basePrice).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {event.startDate ? new Date(event.startDate).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {event.address || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                              event.visibility === "PUBLIC" 
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-yellow-50 text-yellow-700 border-yellow-200"
                            }`}>
                              {event.visibility || "DRAFT"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditEvent(event.id)}
                                className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleViewRFQs(event)}
                                className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition"
                              >
                                View RFQs
                              </button>
                              <button
                                onClick={() => handleDeleteEvent(event)}
                                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Event Confirmation Modal */}
      {showDeleteEventModal && eventToDelete && (
        <div
          className="fixed inset-0 z-50 flex justify-center items-start bg-black/50 px-4 pt-24"
          onClick={() => setShowDeleteEventModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden"
            style={{ fontFamily: "Raleway" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
                <svg
                  className="h-6 w-6 text-red-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </div>
              <h3
                className="mb-1 text-center text-lg font-semibold text-gray-900"
                style={{ fontFamily: "Raleway" }}
              >
                Delete Event?
              </h3>
              <p
                className="text-center text-sm text-gray-500"
                style={{ fontFamily: "Raleway" }}
              >
                Are you sure you want to delete &quot;{eventToDelete.title}&quot;? This action cannot be undone.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end sm:bg-white">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteEventModal(false);
                  setEventToDelete(null);
                }}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                style={{ fontFamily: "Raleway" }}
                disabled={deletingEvent}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteEvent}
                className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-50"
                style={{ fontFamily: "Raleway" }}
                disabled={deletingEvent}
              >
                {deletingEvent ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View RFQs Modal */}
      {showRFQsModal && selectedEventForRFQs && (
        <div
          className="fixed inset-0 z-50 flex justify-center items-start bg-black/50 px-4 pt-24 pb-24 overflow-y-auto"
          onClick={() => setShowRFQsModal(false)}
        >
            <div
              className="w-full max-w-4xl rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden my-8"
              style={{ fontFamily: "Raleway" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 pt-6 pb-4">
                <h3
                  className="mb-4 text-xl font-semibold text-gray-900"
                  style={{ fontFamily: "Raleway" }}
                >
                  Post Requests for &quot;{selectedEventForRFQs.title}&quot;
                </h3>
                {loadingEventServices ? (
                  <p className="text-sm text-slate-500">Loading post requests...</p>
                ) : eventServices.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">No post requests found for this event.</p>
                    <button
                      onClick={async () => {
                        if (!selectedEventForRFQs) return;
                        setLoadingEventServices(true);
                        try {
                          console.log('🔄 Manually refreshing EventServices...');
                          const res = await authFetch(`${API_BASE}/events/${selectedEventForRFQs.id}/services`, {
                            headers: { 'Accept': 'application/json' },
                          });
                          console.log('📡 Response status:', res.status, res.ok);
                          if (res.ok) {
                            const data = await res.json();
                            console.log('✅ EventServices data received:', data);
                            console.log('📊 EventServices count:', Array.isArray(data) ? data.length : 'Not an array');
                            if (Array.isArray(data)) {
                              const servicesWithBids = await Promise.all(
                                data.map(async (service: any) => {
                                  try {
                                    const bidsRes = await authFetch(`${API_BASE}/events/${selectedEventForRFQs.id}/services/${service.id}/bids`, {
                                      headers: { 'Accept': 'application/json' },
                                    });
                                    if (bidsRes.ok) {
                                      const bids = await bidsRes.json();
                                      return { ...service, bids: Array.isArray(bids) ? bids : [] };
                                    }
                                    return { ...service, bids: [] };
                                  } catch {
                                    return { ...service, bids: [] };
                                  }
                                })
                              );
                              setEventServices(servicesWithBids);
                            }
                          } else {
                            const errorText = await res.text();
                            console.error('❌ Error:', res.status, errorText);
                            alert(`Failed to load post requests: ${res.status}`);
                          }
                        } catch (e: any) {
                          console.error('❌ Manual refresh error:', e);
                          alert(`Error: ${e?.message || 'Unknown error'}`);
                        } finally {
                          setLoadingEventServices(false);
                        }
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm"
                    >
                      Refresh Post Requests
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="mb-2 text-xs text-slate-500">
                      Showing {eventServices.length} post request{eventServices.length !== 1 ? 's' : ''} for this event
                    </div>
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Title</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Budget</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Postal Code</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Bids/Proposals</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {eventServices.map((service: any) => (
                          <tr key={service.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-slate-900">{service.title}</p>
                                {service.description && (
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{service.description}</p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{service.category}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {service.budget 
                                ? Number(service.budget).toLocaleString(undefined, { style: "currency", currency: service.currency || "USD" })
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-700">{service.postalCode || "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${getStatusColor(service.status)}`}>
                                {service.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {service.bids ? service.bids.length : 0}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {service.createdAt ? new Date(service.createdAt).toLocaleDateString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-6 py-4 sm:bg-white">
                <button
                  type="button"
                  onClick={() => {
                    setShowRFQsModal(false);
                    setSelectedEventForRFQs(null);
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
                  style={{ fontFamily: "Raleway" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-50 flex justify-center items-start bg-black/50 px-4 pt-24"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden"
            style={{ fontFamily: "Raleway" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
                <svg
                  className="h-6 w-6 text-red-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
              </div>
              <h3
                className="mb-1 text-center text-lg font-semibold text-gray-900"
                style={{ fontFamily: "Raleway" }}
              >
                Log out of Evenzs?
              </h3>
              <p
                className="text-center text-sm text-gray-500"
                style={{ fontFamily: "Raleway" }}
              >
                You&apos;ll be signed out of your current session. You can
                always log back in anytime.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end sm:bg-white">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                style={{ fontFamily: "Raleway" }}
              >
                Stay signed in
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
                className="inline-flex items-center justify-center rounded-lg bg-[#0B1A33] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a1528] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                style={{ fontFamily: "Raleway" }}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrganizerDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    }>
      <OrganizerDashboardContent />
    </Suspense>
  );
}
