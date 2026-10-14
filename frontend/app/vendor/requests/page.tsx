"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRoleContext } from '../../../components/RoleContext';
import BidNotification from '../../../components/BidNotification';
import BidSubmissionModal from '../../../components/BidSubmissionModal';
import ViewBidModal from '../../../components/ViewBidModal';
import ViewAllBidsModal from '../../../components/ViewAllBidsModal';
import { Footer } from '../../../components/TrustFooter';
import VendorDashboardTopBar from "../../../components/VendorDashboardTopBar";
import { getAuthHeaders, getAuthorizationHeader } from "@/lib/auth-utils";

function resolveApiBaseUrl(): string {
  const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
  if (env) return env;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3002';
    const base = window.location.origin.replace(/\/$/, '');
    return `${base}/api`;
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3002';
}
const API_BASE = resolveApiBaseUrl();

interface BookingRequest {
  id: string;
  customerName: string;
  date: string;
  amount: string;
  currency: string;
  status: string;
  service: {
    name: string;
  };
}

interface QuoteRequest {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  numberOfGuests: string;
  budgetRange: string;
  additionalDetails?: string;
  status: string;
  createdAt: string;
  finalPrice?: number;
  deliveryTime?: string;
  finalPriceDescription?: string;
  finalPriceConfirmed?: boolean;
  finalPriceConfirmedAt?: string;
  escrowLockedAt?: string;
  /** True when request came from external (e.g. OSM) listing before vendor joined Evenzs */
  isExternal?: boolean;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export default function RequestsPage() {
  const router = useRouter();
  const { user } = useRoleContext();
  const [activeTab, setActiveTab] = useState<'booking'|'quote'|'services'|'completed'>('services');
  const [completedWorkOrders, setCompletedWorkOrders] = useState<any[]>([]);
  const [completedWorkLoading, setCompletedWorkLoading] = useState(false);
  // Maintain separate status per tab to avoid invalid filters and cross-tab leaks
  const [quoteStatus, setQuoteStatus] = useState<'ALL'|'QUOTED'|'ACCEPTED'|'REJECTED'>('ALL');
  const [bookingStatus, setBookingStatus] = useState<'PENDING'|'ACCEPTED'|'COMPLETED'>('PENDING');
  const [bookingData, setBookingData] = useState<BookingRequest[]>([]);
  const [quoteData, setQuoteData] = useState<QuoteRequest[]>([]);
  const [eventServices, setEventServices] = useState<any[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [actionById, setActionById] = useState<Record<string, 'contact'|'quote'|'accept'|'reject'>>({});
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [vendorPostalCode, setVendorPostalCode] = useState<string>('');
  const [postalCodeInput, setPostalCodeInput] = useState<string>('');
  const [updatingPostalCode, setUpdatingPostalCode] = useState(false);
  const [selectedServiceForBid, setSelectedServiceForBid] = useState<any | null>(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [selectedBidForView, setSelectedBidForView] = useState<any | null>(null);
  const [showViewBidModal, setShowViewBidModal] = useState(false);
  const [selectedServiceForAllBids, setSelectedServiceForAllBids] = useState<any | null>(null);
  const [showViewAllBidsModal, setShowViewAllBidsModal] = useState(false);
  const [selectedChatQuote, setSelectedChatQuote] = useState<QuoteRequest | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [uploadingChatFile, setUploadingChatFile] = useState(false);
  // Service chat (post-accept)
  const [selectedServiceChat, setSelectedServiceChat] = useState<{ eventId: string; organizerName?: string; eventTitle?: string } | null>(null);
  const [serviceChatMessages, setServiceChatMessages] = useState<any[]>([]);
  const [serviceNewMessage, setServiceNewMessage] = useState('');
  const [uploadingServiceFile, setUploadingServiceFile] = useState(false);
  // Submit work context (separate from chat to avoid opening chat modal)
  const [submitWorkContext, setSubmitWorkContext] = useState<{ eventId?: string; quoteId?: string; serviceBidId?: string } | null>(null);
  const [showVendorNotifications, setShowVendorNotifications] = useState(false);
  const [vendorNotificationsLoading, setVendorNotificationsLoading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBidNotifications, setShowBidNotifications] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [serviceStatus, setServiceStatus] = useState<'ALL' | 'ACCEPTED' | 'REJECTED'>('ALL');
  const [workOrder, setWorkOrder] = useState<any | null>(null);
  const [submittingWork, setSubmittingWork] = useState(false);
  const [serviceWorkOrder, setServiceWorkOrder] = useState<any | null>(null);
  const [submittingServiceWork, setSubmittingServiceWork] = useState(false);
  const [allWorkOrders, setAllWorkOrders] = useState<Record<string, any>>({}); // Map by serviceBidId or quoteRequestId
  // Submit Work Modal states
  const [showSubmitWorkModal, setShowSubmitWorkModal] = useState(false);
  const [submitWorkType, setSubmitWorkType] = useState<'quote' | 'service'>('quote');
  const [submitWorkFiles, setSubmitWorkFiles] = useState<File[]>([]);
  const [submitWorkLinks, setSubmitWorkLinks] = useState<string[]>(['']);
  // Final price confirmation form state
  const [showFinalPriceForm, setShowFinalPriceForm] = useState<string | null>(null);
  const [finalPrice, setFinalPrice] = useState<string>('');
  const [deliveryTime, setDeliveryTime] = useState<string>('');
  const [finalPriceDescription, setFinalPriceDescription] = useState<string>('');
  const [confirmingFinalPrice, setConfirmingFinalPrice] = useState<string | null>(null);
  const [submitWorkMessage, setSubmitWorkMessage] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [stripeConnectEnabled, setStripeConnectEnabled] = useState(false);
  const [checkingStripeConnect, setCheckingStripeConnect] = useState(false);

  async function loadBookingRequests() {
    try {
      console.log('🔍 Loading booking requests with status:', bookingStatus);
      const res = await fetch(`${API_BASE}/vendors/requests?status=${bookingStatus}`, { credentials: 'include', headers: getAuthHeaders() });
      console.log('📡 Booking requests response status:', res.status);
      
      if (!res.ok) {
        console.log('❌ API response not OK:', res.status);
        setBookingData([]);
        return;
      }
      
      const json = await res.json().catch(() => []);
      console.log('📋 Booking requests data:', json);
      setBookingData(Array.isArray(json) ? json : []);
    } catch (error) {
      console.error('❌ Error loading booking requests:', error);
      setBookingData([]);
    }
  }

  async function loadQuoteRequests() {
    try {
      console.log('🔍 Loading quote requests with status:', quoteStatus);
      const url = quoteStatus === 'ALL' 
        ? `${API_BASE}/vendors/quote-requests`
        : `${API_BASE}/vendors/quote-requests?status=${quoteStatus}`;
      const res = await fetch(url, { credentials: 'include', headers: getAuthHeaders() });
      console.log('📡 Quote requests response status:', res.status);
      
      if (!res.ok) {
        console.log('❌ API response not OK:', res.status);
        setQuoteData([]);
        return;
      }
      
      const json = await res.json().catch(() => []);
      console.log('📋 Quote requests data:', json);
      setQuoteData(Array.isArray(json) ? json : []);
    } catch (error) {
      console.error('❌ Error loading quote requests:', error);
      // Try loading all quote requests without status filter
      try {
        console.log('🔄 Trying to load all quote requests...');
        const res = await fetch(`${API_BASE}/vendors/quote-requests`, { credentials: 'include', headers: getAuthHeaders() });
        
        if (!res.ok) {
          console.log('❌ Fallback API response not OK:', res.status);
          setQuoteData([]);
          return;
        }
        
        const json = await res.json().catch(() => []);
        console.log('📋 All quote requests data:', json);
        setQuoteData(Array.isArray(json) ? json : []);
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
        setQuoteData([]);
      }
    }
  }

  async function checkStripeConnectStatus() {
    try {
      setCheckingStripeConnect(true);
      const response = await fetch(`${API_BASE}/vendors/stripe-connect/status`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setStripeConnectEnabled(data.enabled || false);
      }
    } catch (error) {
      console.error('Error checking Stripe Connect status:', error);
      setStripeConnectEnabled(false);
    } finally {
      setCheckingStripeConnect(false);
    }
  }

  async function loadEventServices(silent = false) {
    if (!silent) {
      setServicesLoading(true);
    }
    try {
      console.log('🔍 Loading event services matching postal code...');
      const res = await fetch(`${API_BASE}/vendors/event-services`, { credentials: 'include', headers: getAuthHeaders() });
      console.log('📡 Event services response status:', res.status);
      
      if (!res.ok) {
        console.log('❌ API response not OK:', res.status);
        setEventServices([]);
        return;
      }
      
      const json = await res.json().catch(() => []);
      console.log('📋 Event services data:', json);
      console.log('📋 Event services count:', Array.isArray(json) ? json.length : 0);
      if (Array.isArray(json)) {
        json.forEach((service: any, idx: number) => {
          console.log(`📋 Service ${idx + 1}: id=${service.id}, status=${service.status}, event.isFlagged=${service.event?.isFlagged}, hasBids=${service.bids?.length > 0}`);
        });
      }
      setEventServices(Array.isArray(json) ? json : []);
    } catch (error) {
      console.error('❌ Error loading event services:', error);
      setEventServices([]);
    } finally {
      if (!silent) {
        setServicesLoading(false);
      }
    }
  }

  // Load completed work orders
  async function loadCompletedWorkOrders() {
    setCompletedWorkLoading(true);
    try {
      const response = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const allWorkOrders = await response.json();
        const completed = allWorkOrders.filter((wo: any) => wo.status === 'COMPLETED');
        setCompletedWorkOrders(completed);
      }
    } catch (error) {
      console.error('Error loading completed work orders:', error);
      setCompletedWorkOrders([]);
    } finally {
      setCompletedWorkLoading(false);
    }
  }

  // Load only the active tab's data
  async function loadActive() {
    setLoading(true);
    if (activeTab === 'quote') {
      await loadQuoteRequests();
    } else if (activeTab === 'booking') {
      await loadBookingRequests();
    } else if (activeTab === 'services') {
      // Load both event services (zip-filtered) and quote requests (all)
      await Promise.all([loadEventServices(), loadQuoteRequests()]);
    } else if (activeTab === 'completed') {
      await loadCompletedWorkOrders();
    }
    setLoading(false);
  }

  // Fetch vendor postal code and Stripe Connect status on mount
  useEffect(() => {
    const fetchVendorProfile = async () => {
      try {
        const response = await fetch(`${API_BASE}/vendors/profile`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          const postalCode = data.vendor?.postalCode || '';
          setVendorPostalCode(postalCode);
          setPostalCodeInput(postalCode);
        }
      } catch (error) {
        console.error('Error fetching vendor profile:', error);
      }
    };
    fetchVendorProfile();
    checkStripeConnectStatus();
  }, []);

  // Update postal code
  const handleUpdatePostalCode = async () => {
    if (!postalCodeInput.trim()) {
      setToast({ message: 'Please enter a postal code', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setUpdatingPostalCode(true);
    try {
      const response = await fetch(`${API_BASE}/vendors/profile/postal-code`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ postalCode: postalCodeInput.trim() })
      });

      if (response.ok) {
        const newPostalCode = postalCodeInput.trim();
        setVendorPostalCode(newPostalCode);
        setToast({ message: 'Postal code updated successfully!', type: 'success' });
        setTimeout(() => setToast(null), 3000);
        
        // Silently reload services with new postal code in the background
        if (activeTab === 'services') {
          loadEventServices(true);
        }
      } else {
        const errorText = await response.text();
        const errorMessage = errorText.includes('localhost') 
          ? 'Failed to update postal code. Please try again.' 
          : errorText.length > 100 
            ? 'Failed to update postal code. Please try again.' 
            : errorText;
        setToast({ message: errorMessage, type: 'error' });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (error) {
      console.error('Error updating postal code:', error);
      setToast({ message: 'Error updating postal code. Please try again.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setUpdatingPostalCode(false);
    }
  };

  // Trigger fetch on active tab or its status change
  useEffect(() => { loadActive(); }, [activeTab, quoteStatus, bookingStatus]);
  
  // Periodically refresh work orders to catch status changes (e.g., COMPLETED)
  useEffect(() => {
    const refreshWorkOrders = async () => {
      console.log('🔄 REFRESH WORK ORDERS - Starting periodic refresh, activeTab:', activeTab);
      try {
        const response = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        
        console.log('📥 REFRESH WORK ORDERS - Response status:', response.status);
        
        if (response.ok) {
          const allWorkOrdersData = await response.json();
          console.log('📦 REFRESH WORK ORDERS - Received work orders:', {
            count: allWorkOrdersData.length,
            workOrders: allWorkOrdersData.map((wo: any) => ({
              id: wo.id,
              serviceBidId: wo.serviceBidId,
              quoteRequestId: wo.quoteRequestId,
              status: wo.status,
              paymentStatus: wo.paymentStatus,
              paymentIntentId: wo.paymentIntentId,
              submittedAt: wo.submittedAt,
              completedAt: wo.completedAt
            }))
          });
          
          // Map work orders by serviceBidId and quoteRequestId
          const workOrdersMap: Record<string, any> = {};
          allWorkOrdersData.forEach((wo: any) => {
            if (wo.serviceBidId) {
              workOrdersMap[`service_${wo.serviceBidId}`] = wo;
              console.log('📦 REFRESH WORK ORDERS - Mapped service work order:', {
                key: `service_${wo.serviceBidId}`,
                workOrderId: wo.id,
                status: wo.status,
                paymentStatus: wo.paymentStatus
              });
            }
            if (wo.quoteRequestId) {
              workOrdersMap[`quote_${wo.quoteRequestId}`] = wo;
              console.log('📦 REFRESH WORK ORDERS - Mapped quote work order:', {
                key: `quote_${wo.quoteRequestId}`,
                workOrderId: wo.id,
                status: wo.status,
                paymentStatus: wo.paymentStatus
              });
            }
          });
          
          console.log('✅ REFRESH WORK ORDERS - Setting allWorkOrders map:', {
            mapSize: Object.keys(workOrdersMap).length,
            keys: Object.keys(workOrdersMap)
          });
          setAllWorkOrders(workOrdersMap);
          
          // Also update completed work orders if on completed tab
          if (activeTab === 'completed') {
            const completed = allWorkOrdersData.filter((wo: any) => wo.status === 'COMPLETED');
            console.log('✅ REFRESH WORK ORDERS - Setting completed work orders:', {
              count: completed.length,
              completedIds: completed.map((wo: any) => wo.id)
            });
            setCompletedWorkOrders(completed);
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('❌ REFRESH WORK ORDERS - Failed:', {
            status: response.status,
            error: errorText
          });
        }
      } catch (error) {
        console.error('❌ REFRESH WORK ORDERS - Error:', error);
      }
    };
    
    // Refresh immediately
    console.log('🔄 REFRESH WORK ORDERS - Initial refresh triggered');
    refreshWorkOrders();
    
    // Then refresh every 10 seconds
    const interval = setInterval(() => {
      console.log('🔄 REFRESH WORK ORDERS - Periodic refresh (10s interval)');
      refreshWorkOrders();
    }, 10000);
    return () => {
      console.log('🔄 REFRESH WORK ORDERS - Clearing interval');
      clearInterval(interval);
    };
  }, [activeTab]);

  // Fetch notifications on page load
  useEffect(() => {
    fetchBidNotifications();
    fetchUnreadCount();
    
    // Set up periodic refresh
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Periodically refresh selectedChatQuote if it's ACCEPTED but escrow not locked yet
  useEffect(() => {
    if (!selectedChatQuote || selectedChatQuote.status !== 'ACCEPTED' || selectedChatQuote.escrowLockedAt) {
      return;
    }

    // Refresh quote data every 5 seconds until escrow is locked
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/vendors/quote-requests`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const allQuotes = await response.json();
          const updatedQuote = allQuotes.find((q: QuoteRequest) => q.id === selectedChatQuote.id);
          if (updatedQuote && updatedQuote.escrowLockedAt) {
            setSelectedChatQuote(updatedQuote);
            setQuoteData(prev => prev.map(q => q.id === updatedQuote.id ? updatedQuote : q));
            // Stop refreshing once escrow is locked
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('Error refreshing quote for escrow status:', error);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [selectedChatQuote]);

  // Listen for chat open events from BidNotification modal and open floating chat
  useEffect(() => {
    const handler = async (e: any) => {
      // Get current state values
      const currentQuoteData = quoteData;
      const currentNotifications = notifications;
      try {
        const detail = e?.detail || {};
        
        // Open chat via eventId (from Service Requests -> Chat)
        if (detail.eventId) {
          const extractEventId = (q: any) => q?.eventId || q?.event?.id || q?.booking?.eventId || q?.booking?.event?.id;
          let target: any | null = null;
          // search existing quotes first
          target = (currentQuoteData || []).find((q: any) => extractEventId(q) === detail.eventId) || null;
          if (!target) {
            try {
              const res = await fetch(`${API_BASE}/vendors/quote-requests`, { credentials: 'include', headers: getAuthHeaders() });
              if (res.ok) {
                const allQuotes = await res.json().catch(() => []);
                target = (allQuotes || []).find((q: any) => extractEventId(q) === detail.eventId) || null;
              }
            } catch {}
          }
          if (target) {
            openChat(target);
          }
          return;
        }
        
        // If quoteRequestId is provided (from quote request flow), use it directly
        if (detail.quoteRequestId) {
          setShowVendorNotifications(true);
          if (!currentQuoteData || currentQuoteData.length === 0) {
            await loadQuoteRequests();
            // Reload after fetching
            const res = await fetch(`${API_BASE}/vendors/quote-requests`, { credentials: 'include', headers: getAuthHeaders() });
            if (res.ok) {
              const allQuotes = await res.json().catch(() => []);
              const target = allQuotes.find((q: QuoteRequest) => q.id === detail.quoteRequestId);
              if (target) {
                openChat(target);
              }
            }
          } else {
            const target = currentQuoteData.find(q => q.id === detail.quoteRequestId);
            if (target) {
              openChat(target);
            }
          }
          return;
        }
        
        // Otherwise, this is from bid notification - find existing quote request with organizer
        if (detail.bidMetadata || detail.organizerName) {
          setShowVendorNotifications(true);
          
          let organizerName = (detail.organizerName || '').trim().replace(/\bnull\b/gi, '').trim();
          
          // Helper to normalize names
          const normalize = (str: string) => str.toLowerCase().replace(/\bnull\b/g, '').trim().replace(/\s+/g, ' ');
          const normalizedOrgName = normalize(organizerName);
          
          // Search function
          const findMatch = (quotes: any[]): QuoteRequest | null => {
            return quotes.find((q: any) => {
              if (q.user) {
                const fullName = normalize(`${q.user.firstName || ''} ${q.user.lastName || ''}`);
                if (fullName === normalizedOrgName || fullName.includes(normalizedOrgName) || normalizedOrgName.includes(fullName)) {
                  return true;
                }
              }
              if (q.fullName) {
                const fullName = normalize(q.fullName);
                if (fullName === normalizedOrgName || fullName.includes(normalizedOrgName) || normalizedOrgName.includes(fullName)) {
                  return true;
                }
              }
              return false;
            }) || null;
          };
          
          // Try existing data first
          let matchedQuote = findMatch([...currentQuoteData, ...currentNotifications]);
          
          // If not found, load all quote requests
          if (!matchedQuote) {
            try {
              const res = await fetch(`${API_BASE}/vendors/quote-requests`, { credentials: 'include', headers: getAuthHeaders() });
              if (res.ok) {
                const allQuotes = await res.json().catch(() => []);
                matchedQuote = findMatch(allQuotes);
              }
            } catch (error) {
              console.error('Error loading quote requests:', error);
            }
          }
          
          if (matchedQuote) {
            // Found - add to state and open chat
            setQuoteData(prev => {
              const existing = prev.find(q => q.id === matchedQuote!.id);
              return existing ? prev : [...prev, matchedQuote!];
            });
            setNotifications(prev => {
              const existing = prev.find((n: any) => n.id === matchedQuote!.id);
              return existing ? prev : [...prev, matchedQuote!];
            });
            openChat(matchedQuote);
          }
        }
      } catch (error) {
        console.error('Error handling vendor-open-chat event:', error);
      }
    };
    window.addEventListener('vendor-open-chat', handler as any);
    return () => window.removeEventListener('vendor-open-chat', handler as any);
  }, [quoteData, notifications]);

  // Fetch chat messages for a specific quote request
  const fetchChatMessages = async (quoteId: string) => {
    try {
      const response = await fetch(`${API_BASE}/vendors/quote-requests/${quoteId}/messages`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setChatMessages(data);
      }
    } catch (error) {
      console.error('Error fetching chat messages:', error);
    }
  };

  // Fetch service chat messages for a specific event
  const fetchServiceChatMessages = async (eventId: string) => {
    try {
      const response = await fetch(`${API_BASE}/vendors/events/${eventId}/messages`, { credentials: 'include', headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setServiceChatMessages(data);
      }
    } catch (error) {
      console.error('Error fetching service chat messages:', error);
    }
  };

  // Send a chat message
  const sendChatMessage = async () => {
    if (!selectedChatQuote || !newMessage.trim()) return;
    try {
      // If the quote is synthetic (no real id), create or find one first
      let quoteId = (selectedChatQuote as any).id;
      if (!quoteId || quoteId === 'new') {
        // Try to attach to a service currently focused via a deferred global ref (best-effort)
        // Fallback to first active conversation
        let convo: any = null;
        try {
          const active = await fetchVendorNotifications();
          const list = (active || []).filter((req: any) => req.status === 'QUOTED' || req.status === 'ACCEPTED' || (req as any).status === 'NEGOTIATING');
          if (list.length > 0) convo = list[0];
        } catch {}
        if (!convo) return;
        setSelectedChatQuote(convo);
        quoteId = convo.id;
      }

      const response = await fetch(`${API_BASE}/vendors/quote-requests/${quoteId}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          message: newMessage.trim(),
          attachments: []
        })
      });
      if (response.ok) {
        setNewMessage('');
        fetchChatMessages(quoteId);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  // Open submit work modal
  const openSubmitWorkModal = (type: 'quote' | 'service') => {
    setSubmitWorkType(type);
    setSubmitWorkFiles([]);
    setSubmitWorkLinks(['']);
    setSubmitWorkMessage('');
    setShowSubmitWorkModal(true);
  };

  // Handle file upload for submit work modal
  const handleSubmitWorkFileUpload = async (file: File): Promise<string> => {
    setUploadingFiles(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('📤 Uploading file for work submission:', {
        name: file.name,
        size: file.size,
        type: file.type
      });
      
      const response = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthorizationHeader(),
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload failed:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ File uploaded successfully:', data.url);
      return data.url;
    } catch (error) {
      console.error('❌ File upload error:', error);
      throw error;
    } finally {
      setUploadingFiles(false);
    }
  };

  // Submit work from modal
  const submitWorkFromModal = async () => {
    if (submittingWork || submittingServiceWork) return;
    
    // Validate: need at least message, files, or links
    const hasFiles = submitWorkFiles.length > 0;
    const hasLinks = submitWorkLinks.some(link => link.trim() !== '');
    const hasMessage = submitWorkMessage.trim() !== '';
    
    if (!hasFiles && !hasLinks && !hasMessage) {
      setToast({ message: 'Please add a message, file, or link to submit work.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // Get work order
    let currentWorkOrder: any = null;
    let chatId: string | undefined;

    if (submitWorkType === 'quote') {
      currentWorkOrder = workOrder;
      
      // Check if escrow is locked for quote requests
      // Check escrow status - use submitWorkContext or selectedChatQuote
      const quoteForEscrowCheck = submitWorkContext?.quoteId 
        ? quoteData.find(q => q.id === submitWorkContext.quoteId) || selectedChatQuote
        : selectedChatQuote;
      
      if (quoteForEscrowCheck && !quoteForEscrowCheck.escrowLockedAt) {
        setToast({ 
          message: 'Escrow must be locked before you can submit work. Please wait for the buyer to approve and start escrow.', 
          type: 'error' 
        });
        setTimeout(() => setToast(null), 5000);
        return;
      }
      
      // Get chatId from multiple sources to ensure we have it (prefer submitWorkContext to avoid opening chat)
      chatId = submitWorkContext?.quoteId || selectedChatQuote?.id || workOrder?.quoteRequestId || currentWorkOrder?.quoteRequestId;
      
      if (!chatId && currentWorkOrder?.id) {
        // Try to fetch the work order to get quoteRequestId
        try {
          const woResponse = await fetch(`${API_BASE}/work-orders/${currentWorkOrder.id}`, {
            credentials: 'include',
            headers: getAuthHeaders(),
          });
          if (woResponse.ok) {
            const woData = await woResponse.json();
            chatId = woData.quoteRequestId;
            console.log('✅ Retrieved quoteRequestId from work order API:', chatId);
          }
        } catch (e) {
          console.error('❌ Failed to fetch work order:', e);
        }
      }
      
      if (!chatId) {
        console.error('❌ Chat ID is missing for quote request');
        console.error('❌ selectedChatQuote:', selectedChatQuote);
        console.error('❌ workOrder:', workOrder);
        console.error('❌ currentWorkOrder:', currentWorkOrder);
        setToast({ message: 'Unable to submit: Quote request ID is missing. Please close and reopen the chat.', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        setSubmittingWork(false);
        setSubmittingServiceWork(false);
        setUploadingFiles(false);
        return;
      }
      
      console.log('✅ Using chatId for quote request:', chatId);
      
      const quoteIdForFetch = submitWorkContext?.quoteId || selectedChatQuote?.id;
      if (!currentWorkOrder && quoteIdForFetch) {
        // Try to fetch work order (will auto-create if missing)
        await fetchWorkOrder(quoteIdForFetch);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Re-fetch from API to get updated state
        const response = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const workOrders = await response.json();
          currentWorkOrder = workOrders.find((wo: any) => wo.quoteRequestId === quoteIdForFetch);
          if (currentWorkOrder) {
            setWorkOrder(currentWorkOrder);
          } else {
            // Try one more time after a delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retryResponse = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
              credentials: 'include',
              headers: getAuthHeaders(),
            });
            if (retryResponse.ok) {
              const retryWorkOrders = await retryResponse.json();
              currentWorkOrder = retryWorkOrders.find((wo: any) => wo.quoteRequestId === quoteIdForFetch);
              if (currentWorkOrder) {
                setWorkOrder(currentWorkOrder);
              }
            }
          }
        }
      }
    } else {
      currentWorkOrder = serviceWorkOrder;
      
      // Get chatId from submitWorkContext, selectedServiceChat, or from workOrder's serviceBid
      if (submitWorkContext?.eventId) {
        chatId = submitWorkContext.eventId;
      } else if (selectedServiceChat?.eventId) {
        chatId = selectedServiceChat.eventId;
      } else if (serviceWorkOrder?.serviceBid?.eventService?.eventId) {
        chatId = serviceWorkOrder.serviceBid.eventService.eventId;
      } else if (serviceWorkOrder?.serviceBid?.eventService?.event?.id) {
        chatId = serviceWorkOrder.serviceBid.eventService.event.id;
      } else if (currentWorkOrder?.serviceBid?.eventService?.eventId) {
        chatId = currentWorkOrder.serviceBid.eventService.eventId;
      } else if (currentWorkOrder?.serviceBid?.eventService?.event?.id) {
        chatId = currentWorkOrder.serviceBid.eventService.event.id;
      }
      
      // If still no chatId, try to fetch work order details
      if (!chatId && currentWorkOrder?.id) {
        try {
          const woResponse = await fetch(`${API_BASE}/work-orders/${currentWorkOrder.id}`, {
            credentials: 'include',
            headers: getAuthHeaders(),
          });
          if (woResponse.ok) {
            const woData = await woResponse.json();
            if (woData?.serviceBid?.eventService?.eventId) {
              chatId = woData.serviceBid.eventService.eventId;
            } else if (woData?.serviceBid?.eventService?.event?.id) {
              chatId = woData.serviceBid.eventService.event.id;
            }
          }
        } catch (e) {
          console.error('❌ Failed to fetch work order details:', e);
        }
      }
      
      // Last resort: use serviceBidId as chatId if available
      if (!chatId && currentWorkOrder?.serviceBidId) {
        chatId = currentWorkOrder.serviceBidId;
        console.log('⚠️ Using serviceBidId as chatId fallback:', chatId);
      }
      
      if (!chatId) {
        console.error('❌ Event ID is missing for service request');
        console.error('❌ selectedServiceChat:', selectedServiceChat);
        console.error('❌ serviceWorkOrder:', serviceWorkOrder);
        console.error('❌ currentWorkOrder:', currentWorkOrder);
        setToast({ message: 'Unable to submit: Event ID is missing. Please close and reopen the chat.', type: 'error' });
        setTimeout(() => setToast(null), 3000);
        setSubmittingWork(false);
        setSubmittingServiceWork(false);
        setUploadingFiles(false);
        return;
      }
      
      console.log('✅ Using chatId for service request:', chatId);
      
      const eventIdForFetch = submitWorkContext?.eventId || selectedServiceChat?.eventId;
      if (!currentWorkOrder && eventIdForFetch) {
        await fetchServiceWorkOrder(eventIdForFetch, submitWorkContext?.serviceBidId);
        await new Promise(resolve => setTimeout(resolve, 200));
        // Re-fetch from API to get updated state
        const response = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const workOrders = await response.json();
          const wo = workOrders.find((w: any) => {
            if (!w.serviceBidId || !w.serviceBid) return false;
            const eventIdFromService = w.serviceBid.eventService?.eventId;
            const eventIdFromEvent = w.serviceBid.eventService?.event?.id;
            return eventIdFromService === eventIdForFetch || eventIdFromEvent === eventIdForFetch;
          });
          if (wo) {
            currentWorkOrder = wo;
            setServiceWorkOrder(wo);
          }
        }
      }
    }

    if (!currentWorkOrder) {
      setToast({ message: 'Work order not found. Please refresh the page.', type: 'error' });
      setTimeout(() => setToast(null), 5000);
      return;
    }

    // Upload files and collect URLs
    setSubmittingWork(submitWorkType === 'quote');
    setSubmittingServiceWork(submitWorkType === 'service');
    setUploadingFiles(true);

    try {
      const attachmentUrls: string[] = [];
      
      // Upload files
      for (const file of submitWorkFiles) {
        const url = await handleSubmitWorkFileUpload(file);
        attachmentUrls.push(url);
      }
      
      // Add links
      const validLinks = submitWorkLinks.filter(link => link.trim() !== '');
      attachmentUrls.push(...validLinks);

      // Submit work
      const submitPayload = {
        message: submitWorkMessage.trim() || 'Work submitted',
        attachments: attachmentUrls,
        chatType: submitWorkType === 'quote' ? 'QUOTE_REQUEST' : 'EVENT_CHAT',
        chatId: chatId
      };
      
      console.log('📤 WORK SUBMISSION FLOW - Submitting work:', {
        workOrderId: currentWorkOrder.id,
        workOrderStatus: currentWorkOrder.status,
        paymentStatus: currentWorkOrder.paymentStatus,
        submitType: submitWorkType,
        payload: submitPayload,
        attachmentCount: attachmentUrls.length,
        hasMessage: !!submitWorkMessage.trim()
      });

      const response = await fetch(`${API_BASE}/work-orders/${currentWorkOrder.id}/submit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(submitPayload)
      });

      console.log('📥 WORK SUBMISSION FLOW - Response status:', response.status);

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        console.log('✅ WORK SUBMISSION FLOW - Work submitted successfully:', {
          workOrderId: currentWorkOrder.id,
          result,
          newStatus: result.status
        });
        setToast({ message: 'Work submitted successfully!', type: 'success' });
        setShowSubmitWorkModal(false);
        // Reset form
        setSubmitWorkFiles([]);
        setSubmitWorkLinks(['']);
        setSubmitWorkMessage('');
        // Refresh messages and work order
        if (submitWorkType === 'quote' && submitWorkContext?.quoteId) {
          // Use submitWorkContext instead of selectedChatQuote to avoid opening chat
          await fetchWorkOrder(submitWorkContext.quoteId);
        } else if (submitWorkType === 'quote' && selectedChatQuote) {
          // Fallback to selectedChatQuote if submitWorkContext not available
          await fetchChatMessages(selectedChatQuote.id);
          await fetchWorkOrder(selectedChatQuote.id);
        } else if (submitWorkType === 'service' && submitWorkContext?.eventId) {
          // Use submitWorkContext instead of selectedServiceChat to avoid opening chat
          await fetchServiceWorkOrder(submitWorkContext.eventId, submitWorkContext.serviceBidId);
        } else if (submitWorkType === 'service' && selectedServiceChat) {
          // Fallback to selectedServiceChat if submitWorkContext not available
          await fetchServiceChatMessages(selectedServiceChat.eventId);
          await fetchServiceWorkOrder(selectedServiceChat.eventId);
        }
        setTimeout(() => setToast(null), 3000);
      } else {
        const errorText = await response.text();
        console.error('❌ WORK SUBMISSION FLOW - Failed to submit work:', {
          status: response.status,
          error: errorText,
          workOrderId: currentWorkOrder.id
        });
        setToast({ message: `Failed to submit work: ${errorText || 'Unknown error'}`, type: 'error' });
        setTimeout(() => setToast(null), 5000);
      }
    } catch (error) {
      console.error('Error submitting work:', error);
      setToast({ message: 'Error submitting work. Please try again.', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSubmittingWork(false);
      setSubmittingServiceWork(false);
      setUploadingFiles(false);
    }
  };

  // Submit work for service chat
  const submitServiceWork = async () => {
    if (submittingServiceWork) return;
    if (!serviceNewMessage.trim() && !uploadingServiceFile) return;
    
    // If work order doesn't exist, try to fetch it first
    let currentServiceWorkOrder = serviceWorkOrder;
    if (!currentServiceWorkOrder && selectedServiceChat?.eventId) {
      await fetchServiceWorkOrder(selectedServiceChat.eventId);
      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!serviceWorkOrder) {
        setToast({ message: 'Work order not found. Please refresh the page.', type: 'error' });
        setTimeout(() => setToast(null), 5000);
        return;
      }
      currentServiceWorkOrder = serviceWorkOrder;
    }
    
    if (!currentServiceWorkOrder) {
      setToast({ message: 'No work order found. The bid must be accepted first.', type: 'error' });
      setTimeout(() => setToast(null), 5000);
      return;
    }
    
    setSubmittingServiceWork(true);
    try {
      // Extract attachments from message if any
      const attachmentRegex = /📎\s*([^\n]+):\s*(https?:\/\/[^\s]+)/g;
      const attachments: string[] = [];
      let match;
      while ((match = attachmentRegex.exec(serviceNewMessage)) !== null) {
        attachments.push(match[2]);
      }
      
      const cleanMessage = serviceNewMessage.replace(/📎\s*[^\n]+:\s*https?:\/\/[^\s]+/g, '').trim();
      
      // Get chatId - try multiple sources
      let chatIdForSubmit = selectedServiceChat?.eventId;
      if (!chatIdForSubmit && currentServiceWorkOrder?.serviceBid?.eventService?.eventId) {
        chatIdForSubmit = currentServiceWorkOrder.serviceBid.eventService.eventId;
      } else if (!chatIdForSubmit && currentServiceWorkOrder?.serviceBid?.eventService?.event?.id) {
        chatIdForSubmit = currentServiceWorkOrder.serviceBid.eventService.event.id;
      } else if (!chatIdForSubmit && currentServiceWorkOrder?.serviceBidId) {
        chatIdForSubmit = currentServiceWorkOrder.serviceBidId;
      }
      
      if (!chatIdForSubmit) {
        setToast({ message: 'Unable to submit: Event ID is missing. Please close and reopen the chat.', type: 'error' });
        setTimeout(() => setToast(null), 3000);
        setSubmittingServiceWork(false);
        return;
      }
      
      const response = await fetch(`${API_BASE}/work-orders/${currentServiceWorkOrder.id}/submit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          message: cleanMessage || 'Work submitted',
          attachments,
          chatType: 'EVENT_CHAT',
          chatId: chatIdForSubmit
        })
      });
      
      if (response.ok) {
        setServiceNewMessage('');
        setToast({ message: 'Work submitted successfully!', type: 'success' });
        await fetchServiceChatMessages(selectedServiceChat!.eventId);
        await fetchServiceWorkOrder(selectedServiceChat!.eventId);
        setTimeout(() => setToast(null), 3000);
      } else {
        const errorText = await response.text();
        setToast({ message: `Failed to submit work: ${errorText}`, type: 'error' });
        setTimeout(() => setToast(null), 5000);
      }
    } catch (error) {
      console.error('Error submitting service work:', error);
      setToast({ message: 'Error submitting work. Please try again.', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSubmittingServiceWork(false);
    }
  };

  // Send a service chat message
  const sendServiceChatMessage = async () => {
    if (!selectedServiceChat || !serviceNewMessage.trim()) return;
    try {
      const response = await fetch(`${API_BASE}/vendors/events/${selectedServiceChat.eventId}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          message: serviceNewMessage.trim(),
          attachments: []
        })
      });
      if (response.ok) {
        setServiceNewMessage('');
        fetchServiceChatMessages(selectedServiceChat.eventId);
      }
    } catch (error) {
      console.error('Error sending service message:', error);
    }
  };

  // Upload file attachment for chat
  const handleChatFileUpload = async (file: File): Promise<string> => {
    setUploadingChatFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('📤 Uploading file for chat:', {
        name: file.name,
        size: file.size,
        type: file.type
      });
      
      const response = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthorizationHeader(),
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload failed:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      console.log('✅ File uploaded successfully:', data.url);
      return data.url;
    } catch (error) {
      console.error('❌ File upload error:', error);
      throw error;
    } finally {
      setUploadingChatFile(false);
    }
  };

  // Upload file attachment for service chat
  const handleServiceFileUpload = async (file: File): Promise<string> => {
    setUploadingServiceFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      console.log('📤 Uploading file for service chat:', {
        name: file.name,
        size: file.size,
        type: file.type
      });
      
      const response = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthorizationHeader(),
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload failed:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('✅ File uploaded successfully:', data.url);
      return data.url;
    } catch (error) {
      console.error('❌ File upload error:', error);
      throw error;
    } finally {
      setUploadingServiceFile(false);
    }
  };

  // Fetch work order for a quote request
  const fetchWorkOrder = async (quoteId: string) => {
    try {
      console.log('🔍 Fetching work order for quoteId:', quoteId);
      if (!quoteId) {
        console.warn('⚠️ No quoteId provided to fetchWorkOrder');
        setWorkOrder(null);
        return;
      }
      
      const response = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const workOrders = await response.json();
        console.log('📦 All work orders for quote:', workOrders.length, 'total');
        let workOrder = workOrders.find((wo: any) => wo.quoteRequestId === quoteId);
        console.log('📦 Work order for quote', quoteId, ':', workOrder);
        
        if (workOrder) {
          console.log('✅ Found work order by quoteRequestId:', {
            id: workOrder.id,
            quoteRequestId: workOrder.quoteRequestId,
            status: workOrder.status
          });
          setWorkOrder(workOrder);
          return;
        }
        
        // Work order not found - check if quote is accepted and try to create it
        console.warn('⚠️ Work order not found for quote:', quoteId);
        const quoteResponse = await fetch(`${API_BASE}/vendors/quote-requests`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        if (quoteResponse.ok) {
          const quotes = await quoteResponse.json();
          const quote = quotes.find((q: any) => q.id === quoteId);
          if (quote && quote.status === 'ACCEPTED') {
            console.warn('⚠️ Work order not found for accepted quote. Attempting to create it...', {
              quoteRequestId: quoteId
            });
            
            try {
              const createResponse = await fetch(`${API_BASE}/work-orders/create-from-quote/${quoteId}`, {
                method: 'POST',
                credentials: 'include',
                headers: getAuthHeaders(),
              });
              
              if (createResponse.ok) {
                const newWorkOrder = await createResponse.json();
                console.log('✅ Successfully created work order:', newWorkOrder.id);
                const refreshResponse = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
                  credentials: 'include',
                  headers: getAuthHeaders(),
                });
                if (refreshResponse.ok) {
                  const refreshedWorkOrders = await refreshResponse.json();
                  const foundWorkOrder = refreshedWorkOrders.find((wo: any) => wo.id === newWorkOrder.id);
                  if (foundWorkOrder) {
                    console.log('✅ Found newly created work order with full data');
                    setWorkOrder(foundWorkOrder);
                    return;
                  }
                }
                setWorkOrder(newWorkOrder);
                return;
              } else {
                const errorText = await createResponse.text();
                console.error('❌ Failed to create work order:', createResponse.status, errorText);
              }
            } catch (createError) {
              console.error('❌ Error attempting to create work order:', createError);
            }
          }
        }
        
        setWorkOrder(null);
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to fetch work orders:', response.status, errorText);
        setWorkOrder(null);
      }
    } catch (error) {
      console.error('❌ Error fetching work order:', error);
      setWorkOrder(null);
    }
  };

  // Fetch work order for a service bid (event chat)
  const fetchServiceWorkOrder = async (eventId: string, serviceBidId?: string) => {
    try {
      console.log('🔍 Fetching work order for eventId:', eventId, 'serviceBidId:', serviceBidId);
      if (!eventId) {
        console.warn('⚠️ No eventId provided to fetchServiceWorkOrder');
        setServiceWorkOrder(null);
        return;
      }
      
      // Get all work orders and find one linked to a service bid for this event
      const response = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const workOrders = await response.json();
        console.log('📦 All work orders for service chat:', workOrders.length, 'total');
        console.log('📦 Looking for eventId:', eventId, '(type:', typeof eventId, ')');
        if (serviceBidId) {
          console.log('📦 Also checking for serviceBidId:', serviceBidId);
        }
        
        // First, try to find by serviceBidId if provided (more reliable)
        let workOrder = null;
        if (serviceBidId) {
          workOrder = workOrders.find((wo: any) => {
            return wo.serviceBidId === serviceBidId;
          });
          if (workOrder) {
            console.log('✅ Found work order by serviceBidId:', {
              id: workOrder.id,
              serviceBidId: workOrder.serviceBidId,
              status: workOrder.status
            });
            setServiceWorkOrder(workOrder);
            return;
          }
        }
        
        // If not found by serviceBidId, try to find by eventId
        workOrder = workOrders.find((wo: any) => {
          if (!wo.serviceBidId || !wo.serviceBid) {
            return false;
          }
          
          // Check eventId from eventService - can be in different places
          const eventIdFromService = wo.serviceBid?.eventService?.eventId;
          const eventIdFromEvent = wo.serviceBid?.eventService?.event?.id;
          
          // Convert all to strings for comparison to avoid type mismatch issues
          const searchEventId = String(eventId).trim();
          const serviceEventId = eventIdFromService ? String(eventIdFromService).trim() : null;
          const nestedEventId = eventIdFromEvent ? String(eventIdFromEvent).trim() : null;
          
          // Match by either eventId location (using string comparison)
          const matches = (serviceEventId === searchEventId) || (nestedEventId === searchEventId);
          
          if (matches) {
            console.log('✅ Match found for work order', wo.id, {
              serviceBidId: wo.serviceBidId,
              eventIdFromService: serviceEventId,
              eventIdFromEvent: nestedEventId,
              searchEventId,
              status: wo.status
            });
          }
          
          return matches;
        });
        
        if (workOrder) {
          console.log('✅ Found service work order:', {
            id: workOrder.id,
            serviceBidId: workOrder.serviceBidId,
            status: workOrder.status,
            eventId: workOrder.serviceBid?.eventService?.eventId || workOrder.serviceBid?.eventService?.event?.id
          });
          setServiceWorkOrder(workOrder);
        } else {
          console.warn('⚠️ No work order found for eventId:', eventId);
          if (serviceBidId) {
            console.warn('⚠️ Also checked serviceBidId:', serviceBidId);
          }
          console.warn('Available work orders with service bids:', workOrders
            .filter((wo: any) => wo.serviceBid)
            .map((wo: any) => ({
              id: wo.id,
              serviceBidId: wo.serviceBidId,
              eventIdFromService: wo.serviceBid?.eventService?.eventId,
              eventIdFromEvent: wo.serviceBid?.eventService?.event?.id,
              status: wo.status,
              matchesServiceBidId: serviceBidId ? wo.serviceBidId === serviceBidId : false,
              matchesEventId: wo.serviceBid?.eventService?.eventId === eventId || wo.serviceBid?.eventService?.event?.id === eventId
            })));
          
          // If we have a serviceBidId and the bid is accepted, try to create the work order
          if (serviceBidId) {
            console.warn('⚠️ Work order not found for accepted bid. Attempting to create it...', {
              serviceBidId,
              eventId
            });
            
            // Try to create the work order as a fallback
            try {
              const createResponse = await fetch(`${API_BASE}/work-orders/create-from-bid/${serviceBidId}`, {
                method: 'POST',
                credentials: 'include',
                headers: getAuthHeaders(),
              });
              
              if (createResponse.ok) {
                const newWorkOrder = await createResponse.json();
                console.log('✅ Successfully created work order:', newWorkOrder.id);
                // Fetch all work orders again to get the full structure
                const refreshResponse = await fetch(`${API_BASE}/work-orders/vendor/my-orders`, {
                  credentials: 'include',
                  headers: getAuthHeaders(),
                });
                if (refreshResponse.ok) {
                  const refreshedWorkOrders = await refreshResponse.json();
                  const foundWorkOrder = refreshedWorkOrders.find((wo: any) => wo.id === newWorkOrder.id);
                  if (foundWorkOrder) {
                    console.log('✅ Found newly created work order with full data');
                    setServiceWorkOrder(foundWorkOrder);
                    return;
                  }
                }
                // If refresh failed, use the returned work order
                setServiceWorkOrder(newWorkOrder);
                return;
              } else {
                const errorText = await createResponse.text();
                console.error('❌ Failed to create work order:', createResponse.status, errorText);
                console.error('This might indicate the bid is not accepted or there was an error.');
              }
            } catch (createError) {
              console.error('❌ Error attempting to create work order:', createError);
            }
          }
          
          setServiceWorkOrder(null);
        }
      } else {
        const errorText = await response.text();
        console.error('❌ Failed to fetch work orders:', response.status, errorText);
        setServiceWorkOrder(null);
      }
    } catch (error) {
      console.error('❌ Error fetching service work order:', error);
      setServiceWorkOrder(null);
    }
  };

  // Open chat for a quote request
  const openChat = async (quote: QuoteRequest) => {
    if (quote.isExternal) {
      setToast({ message: 'This request came from your claimed listing. Full messaging coming soon.', type: 'success' });
      return;
    }
    // Fetch the latest quote data to ensure we have escrowLockedAt and other updated fields
    try {
      const response = await fetch(`${API_BASE}/vendors/quote-requests`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const allQuotes = await response.json();
        const updatedQuote = allQuotes.find((q: QuoteRequest) => q.id === quote.id);
        if (updatedQuote) {
          setSelectedChatQuote(updatedQuote);
          // Also update in quoteData array
          setQuoteData(prev => prev.map(q => q.id === updatedQuote.id ? updatedQuote : q));
        } else {
    setSelectedChatQuote(quote);
        }
      } else {
        setSelectedChatQuote(quote);
      }
    } catch (error) {
      console.error('Error fetching updated quote:', error);
      setSelectedChatQuote(quote);
    }
    
    await fetchChatMessages(quote.id);
    // Always try to fetch work order (it might exist even if status check fails)
    await fetchWorkOrder(quote.id);
    // Retry after delay if quote is ACCEPTED to ensure work order is found
    // (work order might be created asynchronously)
    if (quote.status === 'ACCEPTED') {
      setTimeout(async () => {
        await fetchWorkOrder(quote.id);
      }, 500);
      setTimeout(async () => {
        await fetchWorkOrder(quote.id);
      }, 2000);
    }
  };

  // Open service chat by event
  const openServiceChat = async (eventId?: string, organizerName?: string, eventTitle?: string, serviceBidId?: string) => {
    if (!eventId) {
      console.error('❌ Cannot open service chat: eventId is missing');
      return;
    }
    setSelectedServiceChat({ eventId, organizerName, eventTitle });
    await fetchServiceChatMessages(eventId);
    // Fetch work order for service chat - retry multiple times to ensure it's found
    // (work order might be created asynchronously)
    // Pass serviceBidId if available for more reliable lookup
    await fetchServiceWorkOrder(eventId, serviceBidId);
    // Retry after short delay in case work order was just created
    setTimeout(async () => {
      await fetchServiceWorkOrder(eventId, serviceBidId);
    }, 500);
    // Additional retry after longer delay
    setTimeout(async () => {
      await fetchServiceWorkOrder(eventId, serviceBidId);
    }, 2000);
  };

  // Ensure a conversation exists for a given service. If missing, create one and return it.
  const ensureConversationForService = async (service: any) => {
    const eventId = service?.event?.id;
    if (!eventId) throw new Error('Missing eventId');

    const extractEventId = (q: any) => q?.eventId || q?.event?.id || q?.booking?.eventId || q?.booking?.event?.id;
    let target: any = (quoteData || []).find((q: any) => extractEventId(q) === eventId);

    if (!target) {
      try {
        const res = await fetch(`${API_BASE}/vendors/quote-requests`, { credentials: 'include', headers: getAuthHeaders() });
        if (res.ok) {
          const all = await res.json().catch(() => []);
          target = (all || []).find((q: any) => extractEventId(q) === eventId);
        }
      } catch {}
    }

    // If not found, create a minimal quote request so chat thread exists
    if (!target) {
      try {
        const body: any = {
          fullName: (service?.event?.organizerName || 'Customer').toString(),
          email: (service?.event?.organizerEmail || 'customer@unknown.local').toString(),
          phone: 'N/A',
          eventType: service?.event?.title || service?.title || 'Event',
          eventDate: service?.event?.startDate || new Date().toISOString(),
          eventLocation: service?.event?.city || 'Unknown',
          numberOfGuests: 'N/A',
          budgetRange: 'Not specified',
          vendorId: user?.id || ''
        };
        const resp = await fetch(`${API_BASE}/quote-requests`, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify(body)
        });
        if (resp.ok) {
          target = await resp.json();
        }
      } catch {}
    }

    // Final fallback: pick any active conversation so the modal opens
    if (!target) {
      try {
        const active = await fetchVendorNotifications();
        const list = (active || []).filter((req: any) => req.status === 'QUOTED' || req.status === 'ACCEPTED' || (req as any).status === 'NEGOTIATING');
        if (list.length > 0) {
          target = list[0];
        }
      } catch {}
    }

    return target;
  };

  // Open chat given an eventId (used by Service Requests -> Chat)
  const openChatForEvent = async (eventId?: string) => {
    if (!eventId) return;
    const extractEventId = (q: any) => q?.eventId || q?.event?.id || q?.booking?.eventId || q?.booking?.event?.id;
    let target: any = (quoteData || []).find((q: any) => extractEventId(q) === eventId);
    if (!target) {
      try {
        const res = await fetch(`${API_BASE}/vendors/quote-requests`, { credentials: 'include', headers: getAuthHeaders() });
        if (res.ok) {
          const all = await res.json().catch(() => []);
          target = (all || []).find((q: any) => extractEventId(q) === eventId);
        }
      } catch {}
    }
    // Fallback: try match by organizer name from notifications for this event
    if (!target) {
      try {
        const notes = await fetchBidNotifications();
        const note = (notes || []).find((n: any) => (n?.metadata?.eventId || n?.eventId) === eventId);
        if (note) {
          const orgName = (note?.metadata?.organizerName || '').trim();
          if (orgName) {
            const normalize = (str: string) => str.toLowerCase().replace(/\bnull\b/g, '').trim().replace(/\s+/g, ' ');
            const normalizedOrgName = normalize(orgName);
            const ensureAll = async () => {
              if (!quoteData || quoteData.length === 0) {
                try {
                  const r = await fetch(`${API_BASE}/vendors/quote-requests`, { credentials: 'include', headers: getAuthHeaders() });
                  if (r.ok) return await r.json().catch(() => []);
                } catch {}
              }
              return quoteData;
            };
            const allQuotes = await ensureAll();
            target = (allQuotes || []).find((q: any) => {
              const full = q.user ? `${q.user.firstName || ''} ${q.user.lastName || ''}` : (q.fullName || '');
              return normalize(full) === normalizedOrgName || normalize(full).includes(normalizedOrgName) || normalizedOrgName.includes(normalize(full));
            });
          }
        }
      } catch {}
    }
    if (target) {
      openChat(target);
    } else {
      // As a fallback, open the first active conversation so the vendor can start chatting immediately
      try {
        const active = await fetchVendorNotifications();
        const list = (active || []).filter((req: any) => req.status === 'QUOTED' || req.status === 'ACCEPTED' || (req as any).status === 'NEGOTIATING');
        if (list.length > 0) {
          openChat(list[0]);
          return;
        }
      } catch {}
      setToast({ message: 'No conversation available yet for this service.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Fetch vendor notifications (quote requests with user messages)
  const fetchVendorNotifications = async () => {
    setVendorNotificationsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/vendors/quote-requests`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        // Filter for requests that have user messages or are in active states
        const notifications = data.filter((req: any) => 
          req.status === 'QUOTED' || req.status === 'ACCEPTED' || req.status === 'NEGOTIATING'
        );
        return notifications;
      }
    } catch (error) {
      console.error('Error fetching vendor notifications:', error);
    } finally {
      setVendorNotificationsLoading(false);
    }
    return [];
  };

  // Fetch bid acceptance notifications
  const fetchBidNotifications = async () => {
    try {
      console.log('🔔 Fetching bid notifications...');
      const response = await fetch(`${API_BASE}/events/notifications`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      
      console.log('🔔 Notifications response status:', response.status);
      
      if (!response.ok) {
        console.log('❌ Notifications API response not OK:', response.status);
        setNotifications([]);
        return [];
      }
      
      const data = await response.json().catch(() => []);
      console.log('🔔 Notifications data:', data);
      setNotifications(Array.isArray(data) ? data : []);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('❌ Error fetching bid notifications:', error);
      setNotifications([]);
      return [];
    }
  };

  const fetchUnreadCount = async () => {
    try {
      console.log('🔔 Fetching unread count...');
      // Use vendor-specific unread count to match dashboard behavior
      const response = await fetch(`${API_BASE}/vendors/notifications/unread-count`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      
      console.log('🔔 Unread count response status:', response.status);
      
      if (!response.ok) {
        console.log('❌ Unread count API response not OK:', response.status);
        setUnreadCount(0);
        return 0;
      }
      
      const data = await response.json().catch(() => 0);
      console.log('🔔 Unread count data:', data);
      const count = typeof data === 'number' ? data : 0;
      setUnreadCount(count);
      return count;
    } catch (error) {
      console.error('❌ Error fetching unread count:', error);
      setUnreadCount(0);
      return 0;
    }
  };

  async function actBooking(id: string, action: 'accept'|'reject') {
    // Optimistic UI update
    setActingIds(prev => new Set(prev).add(id));
    const prevData = bookingData;
    const nextStatus = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
    setBookingData(prev => prev.map(item => item.id === id ? { ...item, status: nextStatus } : item));
    try {
      const res = await fetch(`${API_BASE}/vendors/requests/${id}/${action}`, { method: 'POST', credentials: 'include', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Action failed');
    } catch (e) {
      // Revert on failure
      setBookingData(prevData);
    } finally {
      setActingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      // Refresh only current set
      loadBookingRequests();
    }
  }

  async function confirmFinalPrice(quoteId: string) {
    if (!finalPrice || parseFloat(finalPrice) <= 0) {
      setToast({ message: 'Please enter a valid final price', type: 'error' });
      return;
    }

    setConfirmingFinalPrice(quoteId);
    try {
      const response = await fetch(`${API_BASE}/vendors/quote-requests/${quoteId}/confirm-final-price`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          finalPrice: parseFloat(finalPrice),
          deliveryTime: deliveryTime || undefined,
          description: finalPriceDescription || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to confirm final price' }));
        throw new Error(errorData.message || 'Failed to confirm final price');
      }

      const updated = await response.json();
      setQuoteData(prev => prev.map(item => 
        item.id === quoteId 
          ? { 
              ...item, 
              finalPrice: updated.finalPrice,
              deliveryTime: updated.deliveryTime,
              finalPriceDescription: updated.finalPriceDescription,
              finalPriceConfirmed: true,
              finalPriceConfirmedAt: updated.finalPriceConfirmedAt,
            } 
          : item
      ));

      setShowFinalPriceForm(null);
      setFinalPrice('');
      setDeliveryTime('');
      setFinalPriceDescription('');
      setToast({ message: 'Final price confirmed! Buyer can now approve and start escrow.', type: 'success' });
    } catch (error: any) {
      console.error('Error confirming final price:', error);
      setToast({ message: error.message || 'Failed to confirm final price', type: 'error' });
    } finally {
      setConfirmingFinalPrice(null);
    }
  }

  async function actQuote(id: string, action: 'contact'|'quote'|'accept'|'reject') {
    // Check Stripe Connect before allowing quote submission
    if (action === 'quote') {
      if (!stripeConnectEnabled) {
        await checkStripeConnectStatus();
        if (!stripeConnectEnabled) {
          setToast({ 
            message: 'Please set up your Stripe Connect account before submitting quotes. Go to Payouts & Withdrawals to complete the setup.', 
            type: 'error' 
          });
          setTimeout(() => setToast(null), 7000);
          return;
        }
      }
    }

    // Optimistic UI update
    setActingIds(prev => new Set(prev).add(id));
    setActionById(prev => ({ ...prev, [id]: action }));
    const prevData = quoteData;
    const mapNext: Record<string, QuoteRequest['status']> = {
      contact: 'CONTACTED',
      quote: 'QUOTED',
      accept: 'ACCEPTED',
      reject: 'REJECTED'
    };
    const nextStatus = mapNext[action];
    setQuoteData(prev => prev.map(item => item.id === id ? { ...item, status: nextStatus } : item));
    try {
      const res = await fetch(`${API_BASE}/vendors/quote-requests/${id}/${action}`, { method: 'POST', credentials: 'include', headers: getAuthHeaders() });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Action failed');
      }
    } catch (e: any) {
      // Revert on failure
      setQuoteData(prevData);
      const errorMessage = e?.message || 'Action failed';
      if (errorMessage.includes('Stripe Connect')) {
        setToast({ message: errorMessage, type: 'error' });
        setTimeout(() => setToast(null), 7000);
      } else {
        setToast({ message: errorMessage, type: 'error' });
        setTimeout(() => setToast(null), 5000);
      }
    } finally {
      setActingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      setActionById(prev => { const { [id]: _removed, ...rest } = prev; return rest; });
      // Refresh only current set
      loadQuoteRequests();
    }
  }

  async function deleteQuote(id: string) {
    if (confirm('Are you sure you want to delete this quote request? This action cannot be undone.')) {
      setDeletingIds(prev => new Set(prev).add(id));
      try {
        await fetch(`${API_BASE}/vendors/quote-requests/${id}/delete`, { method: 'DELETE', credentials: 'include', headers: getAuthHeaders() });
        loadQuoteRequests();
      } catch (error) {
        console.error('Error deleting quote request:', error);
        alert('Failed to delete quote request. Please try again.');
      } finally {
        setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      }
    }
  }

  const bookingTabs: { key: 'PENDING'|'ACCEPTED'|'COMPLETED'; label: string }[] = [
    { key: 'PENDING', label: 'Pending' },
    { key: 'ACCEPTED', label: 'Accepted' },
    { key: 'COMPLETED', label: 'Completed' },
  ];

  const quoteTabs: { key: 'ALL'|'QUOTED'|'ACCEPTED'|'REJECTED'; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'QUOTED', label: 'Quoted' },
    { key: 'ACCEPTED', label: 'Accepted' },
  ];

  const filteredEventServices = useMemo(() => {
    if (serviceStatus === 'ALL') return eventServices;
    return eventServices.filter((service: any) => {
      const status = service?.bids?.[0]?.status || '';
      return status === serviceStatus;
    });
  }, [eventServices, serviceStatus]);

  // Combined list: event services (zip-filtered) + quote requests (filtered by status)
  // IMPORTANT: Filter out COMPLETED work orders from services tab - they should only appear in Completed tab
  const combinedRequests = useMemo(() => {
    const services = filteredEventServices.map((s: any) => ({ ...s, type: 'service' }));
    
    // Filter out services with COMPLETED work orders
    const servicesWithoutCompleted = services.filter((service: any) => {
      // If it's a service request with a bid
      if (service.bids && service.bids.length > 0) {
        const serviceBidId = service.bids[0]?.id;
        if (serviceBidId) {
          const wo = allWorkOrders[`service_${serviceBidId}`];
          // Exclude if work order is COMPLETED
          if (wo && wo.status === 'COMPLETED') {
            return false;
          }
        }
      }
      return true;
    });
    
    // Filter quote requests based on serviceStatus
    let filteredQuotes = quoteData;
    if (serviceStatus === 'REJECTED') {
      filteredQuotes = quoteData.filter((q: any) => q.status === 'REJECTED');
    } else if (serviceStatus === 'ACCEPTED') {
      filteredQuotes = quoteData.filter((q: any) => q.status === 'ACCEPTED');
    }
    // If serviceStatus is 'ALL', show all quote requests
    
    // Filter out quote requests with COMPLETED work orders
    const quotesWithoutCompleted = filteredQuotes.filter((q: any) => {
      if (q.id) {
        const wo = allWorkOrders[`quote_${q.id}`];
        // Exclude if work order is COMPLETED
        if (wo && wo.status === 'COMPLETED') {
          return false;
        }
      }
      return true;
    }).map((q: any) => ({ ...q, type: 'quote' }));
    
    return [...servicesWithoutCompleted, ...quotesWithoutCompleted];
  }, [filteredEventServices, quoteData, serviceStatus, allWorkOrders]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Shared vendor dashboard header (same as /vendor/dashboard) */}
      <VendorDashboardTopBar
        unreadCount={unreadCount}
        onOpenBidNotifications={() => setShowBidNotifications(true)}
      />

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-7xl">
          {/* Page title under the shared header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Raleway, sans-serif' }}>Requests Management</h1>
            <p className="text-base text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Manage your customer requests and quotes</p>
          </div>

          {/* Tab Navigation */}
          <div className="mb-6">
            <div className="inline-flex gap-1 bg-white p-1 rounded-xl shadow-sm border border-gray-200">
              <button 
                onClick={() => setActiveTab('services')} 
                className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  activeTab === 'services' 
                    ? 'bg-[#0B1A33] text-white shadow-lg' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                style={{ fontFamily: 'Raleway, sans-serif' }}
              >
                Service Requests
              </button>
              <button 
                onClick={() => setActiveTab('booking')} 
                className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  activeTab === 'booking' 
                    ? 'bg-[#0B1A33] text-white shadow-lg' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                style={{ fontFamily: 'Raleway, sans-serif', display: 'none' }}
              >
                Booking Requests
              </button>
              <button 
                onClick={() => setActiveTab('completed')} 
                className={`px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${
                  activeTab === 'completed' 
                    ? 'bg-[#0B1A33] text-white shadow-lg' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                style={{ fontFamily: 'Raleway, sans-serif' }}
              >
                Completed Work
              </button>
            </div>
          </div>

          {/* Status Tabs - Only show for quote and booking tabs */}
          {activeTab !== 'services' && (
          <div className="mb-6">
            <div className="flex flex-wrap gap-3">
              {(activeTab === 'booking' ? bookingTabs : quoteTabs).map(t => (
                <button 
                  key={t.key} 
                  onClick={() => activeTab === 'booking' ? setBookingStatus(t.key as any) : setQuoteStatus(t.key as any)} 
                  className={`rounded-full border-2 px-6 py-3 text-sm font-semibold transition-all duration-200 ${
                    (activeTab === 'booking' ? bookingStatus : quoteStatus) === t.key 
                      ? 'bg-[#0B1A33] text-white border-[#0B1A33] shadow-lg transform scale-105' 
                      : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:scale-105'
                  }`}
                  style={{ fontFamily: 'Raleway, sans-serif' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
        </div>
          )}

          {/* Content */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          {loading || (activeTab === 'services' && servicesLoading) ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 border-4 border-[#0B1A33] border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                <p className="text-lg font-medium text-gray-600" style={{ fontFamily: 'Raleway, sans-serif' }}>Loading requests...</p>
                <p className="text-sm text-gray-500 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>Please wait while we fetch your data</p>
              </div>
          ) : (
            <div className="divide-y">
              {activeTab === 'services' ? (
                <>
                  {/* Service Requests Status Filter */}
                  <div className="p-6 bg-white border-b border-gray-200">
                    <div className="flex flex-wrap gap-3">
                      {(['ALL','ACCEPTED','REJECTED'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setServiceStatus(s)}
                          className={`rounded-full border-2 px-6 py-3 text-sm font-semibold transition-all duration-200 ${
                            serviceStatus === s
                              ? 'bg-[#0B1A33] text-white border-[#0B1A33] shadow-lg transform scale-105'
                              : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:scale-105'
                          }`}
                          style={{ fontFamily: 'Raleway, sans-serif' }}
                        >
                          {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Postal Code Input Section */}
                  <div className="p-6 bg-white border-b border-gray-200">
                    <div className="max-w-2xl mx-auto">
                      <h3 
                        className="text-lg font-semibold text-gray-900 mb-1"
                        style={{ fontFamily: 'Raleway, sans-serif' }}
                      >
                        Set Your Postal Code
                      </h3>
                      <p 
                        className="text-sm text-gray-600 mb-4"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Enter your postal code to see service requests in your area. Quote requests will appear here regardless of postal code.
                      </p>
                      
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={postalCodeInput}
                          onChange={(e) => setPostalCodeInput(e.target.value)}
                          placeholder="e.g., 10001"
                          className="w-full px-4 py-2.5 pr-24 bg-white border border-gray-300 rounded-xl focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-base"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdatePostalCode();
                            }
                          }}
                        />
                        <button
                          onClick={handleUpdatePostalCode}
                          disabled={updatingPostalCode || !postalCodeInput.trim()}
                          className="absolute right-1 px-5 py-2 bg-gray-700 text-white rounded-lg font-normal hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {updatingPostalCode ? 'Updating...' : vendorPostalCode ? 'Update' : 'Save'}
                        </button>
                      </div>
                      
                      {vendorPostalCode && (
                        <p 
                          className="text-sm text-gray-600 mt-3"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          Current postal code: <span className="font-medium text-gray-900">{vendorPostalCode}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {combinedRequests.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Raleway, sans-serif' }}>
                        {eventServices.length === 0 && quoteData.length === 0 ? 'No requests found' : 'No requests for selected status'}
                      </h3>
                      <p className="text-gray-600 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {eventServices.length === 0 && quoteData.length === 0
                          ? (vendorPostalCode 
                              ? `No service requests found matching postal code: ${vendorPostalCode}. Try updating your postal code to see requests in other areas. Quote requests will appear here when customers submit them.`
                              : 'Service requests matching your postal code will appear here once you set your postal code above. Quote requests will appear here when customers submit them.')
                          : 'Try switching to a different status or clear the filter with All.'}
                      </p>
                    </div>
                ) : (
                  combinedRequests.map((item: any) => {
                    // Render service request
                    if (item.type === 'service') {
                      const service = item;
                      return (
                    <div key={service.id} className="p-8 hover:bg-gray-50 transition-all duration-200 border-b border-gray-100 last:border-b-0">
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                              <div className="font-bold text-lg text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{service.title}</div>
                                {service.event?.isFlagged && (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M4 15C4 15 5 14 8 14C11 14 13 16 16 16C19 16 20 15 20 15V3C20 3 19 4 16 4C13 4 11 2 8 2C5 2 4 3 4 3V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      <path d="M4 22V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    Flagged
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {service.event?.title} • {service.postalCode}
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                            {service.event?.isFlagged && (
                              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center gap-2">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 15C4 15 5 14 8 14C11 14 13 16 16 16C19 16 20 15 20 15V3C20 3 19 4 16 4C13 4 11 2 8 2C5 2 4 3 4 3V15Z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M4 22V15" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <p className="text-sm font-semibold text-red-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    This event has been flagged. Bidding is currently disabled.
                                  </p>
                                </div>
                              </div>
                            )}
                            {service.description && (
                              <p className="text-sm text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>{service.description}</p>
                            )}
                            <div className="grid grid-cols-2 gap-4 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                              <div><span className="font-semibold text-gray-700">Category:</span> <span className="text-gray-900">{service.category}</span></div>
                              {service.budget && (
                                <div><span className="font-semibold text-gray-700">Budget:</span> <span className="text-gray-900">{service.currency || 'USD'} {parseFloat(service.budget.toString()).toFixed(2)}</span></div>
                              )}
                              {service.event?.startDate && (
                                <div><span className="font-semibold text-gray-700">Event Date:</span> <span className="text-gray-900">{new Date(service.event.startDate).toLocaleDateString()}</span></div>
                              )}
                              {service.event?.city && (
                                <div><span className="font-semibold text-gray-700">Location:</span> <span className="text-gray-900">{service.event.city}</span></div>
                              )}
                            </div>
                            {service.bids && service.bids.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                                <div className="flex items-center justify-between">
                                <p className="text-sm font-semibold text-gray-700">Your Bid: {service.currency || 'USD'} {parseFloat(service.bids[0].bidAmount.toString()).toFixed(2)}</p>
                                  {service.event?.isFlagged && (
                                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded">
                                      Event Flagged
                                    </span>
                                  )}
                                </div>
                                {service.event?.isFlagged && (
                                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                                    <p className="text-yellow-800 font-semibold mb-1">⚠️ Event Flagged After Your Bid</p>
                                    <p className="text-yellow-700">
                                      This event was flagged after you placed your bid. Your bid is still visible, but the event organizer may not be able to accept bids at this time. Please contact support if you have questions.
                                    </p>
                                  </div>
                                )}
                                  {serviceStatus === 'ACCEPTED' && service.bids[0]?.status === 'ACCEPTED' && (() => {
                                  const wo = allWorkOrders[`service_${service.bids[0].id}`];
                                  if (wo?.paymentStatus) {
                                    // Payment should only show as "Paid" when work order is COMPLETED (work accepted) AND paymentStatus is COMPLETED
                                    const isPaid = wo.status === 'COMPLETED' && wo.paymentStatus === 'COMPLETED';
                                    const isPending = wo.paymentStatus === 'PENDING' || (wo.paymentStatus === 'COMPLETED' && wo.status !== 'COMPLETED');
                                    const isRefunded = wo.paymentStatus === 'REFUNDED' || wo.refundStatus === 'REFUNDED';
                                    const hasRefundRequest = wo.refundStatus === 'REQUESTED' || wo.refundStatus === 'NEED_MORE_INFO';
                                    const refundRequested = wo.refundStatus === 'REQUESTED';
                                    
                                    return (
                                      <>
                                        <div className="mt-2 p-2 rounded" style={{
                                          backgroundColor: isRefunded ? '#fff5f5' : isPaid ? '#d1fae5' : isPending ? '#fef3c7' : '#f3f4f6',
                                          border: `1px solid ${isRefunded ? '#dc2626' : isPaid ? '#10b981' : isPending ? '#f59e0b' : '#d1d5db'}`
                                        }}>
                                          <div className="text-xs font-semibold" style={{
                                            color: isRefunded ? '#dc2626' : isPaid ? '#065f46' : isPending ? '#92400e' : '#6b7280',
                                            fontFamily: 'Inter, sans-serif',
                                            letterSpacing: isRefunded ? '0.5px' : 'normal'
                                          }}>
                                            Payment: {isRefunded ? 'REFUNDED' : isPaid ? '💰 Paid' : isPending ? '⏳ Pending' : wo.paymentStatus}
                                          </div>
                                          {isPaid && wo.paymentIntentId && (
                                            <div className="text-xs text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                              ID: {wo.paymentIntentId.substring(0, 20)}...
                                            </div>
                                          )}
                                        </div>
                                        {hasRefundRequest && !isRefunded && (
                                          <div className="mt-2 p-2 rounded" style={{
                                            backgroundColor: '#fffbeb',
                                            border: '1px solid #f59e0b'
                                          }}>
                                            <div className="text-xs font-semibold" style={{
                                              color: '#92400e',
                                              fontFamily: 'Inter, sans-serif'
                                            }}>
                                              {refundRequested 
                                                ? 'Refund Requested' 
                                                : 'Additional Proofs Required'}
                                            </div>
                                            <div className="text-xs mt-1" style={{
                                              color: '#78350f',
                                              fontFamily: 'Inter, sans-serif'
                                            }}>
                                              {refundRequested
                                                ? 'Organiser has requested refund. Admin will decide on it shortly.'
                                                : 'Admin has requested additional proofs from organiser.'}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    );
                                  }
                                  // Check for refund request even if no payment status
                                  if (wo && (wo.refundStatus === 'REQUESTED' || wo.refundStatus === 'NEED_MORE_INFO')) {
                                    const isRefunded = wo.paymentStatus === 'REFUNDED' || wo.refundStatus === 'REFUNDED';
                                    const refundRequested = wo.refundStatus === 'REQUESTED';
                                    if (!isRefunded) {
                                      return (
                                        <div className="mt-2 p-2 rounded" style={{
                                          backgroundColor: '#fffbeb',
                                          border: '1px solid #f59e0b'
                                        }}>
                                          <div className="text-xs font-semibold" style={{
                                            color: '#92400e',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {refundRequested 
                                              ? 'Refund Requested' 
                                              : 'Additional Proofs Required'}
                                          </div>
                                          <div className="text-xs mt-1" style={{
                                            color: '#78350f',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {refundRequested
                                              ? 'Organiser has requested refund. Admin will decide on it shortly.'
                                              : 'Admin has requested additional proofs from organiser.'}
                                          </div>
                                        </div>
                                      );
                                    }
                                  }
                                  return null;
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-3">
                          {service.bids && service.bids.length === 0 ? (
                            <>
                              <button
                                onClick={async () => {
                                  if (service.event?.isFlagged) {
                                    setToast({ message: 'This event has been flagged. Bidding is disabled.', type: 'error' });
                                    setTimeout(() => setToast(null), 5000);
                                    return;
                                  }
                                  // Check Stripe Connect status before allowing bid
                                  if (!stripeConnectEnabled) {
                                    await checkStripeConnectStatus();
                                    if (!stripeConnectEnabled) {
                                      setToast({ 
                                        message: 'Please set up your Stripe Connect account before bidding. Go to Payouts & Withdrawals to complete the setup.', 
                                        type: 'error' 
                                      });
                                      setTimeout(() => setToast(null), 7000);
                                      return;
                                    }
                                  }
                                  setSelectedServiceForBid(service);
                                  setShowBidModal(true);
                                }}
                                disabled={service.event?.isFlagged}
                                className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors shadow-md ${
                                  service.event?.isFlagged
                                    ? 'bg-gray-400 text-white cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                                style={{ fontFamily: 'Raleway, sans-serif' }}
                              >
                                {service.event?.isFlagged ? 'Event Flagged' : 'Place Bid'}
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedServiceForAllBids({
                                    service: {
                                      id: service.id,
                                      title: service.title,
                                      description: service.description,
                                      budget: service.budget,
                                      currency: service.currency || 'USD'
                                    },
                                    eventId: service.event?.id
                                  });
                                  setShowViewAllBidsModal(true);
                                }}
                                className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
                                style={{ fontFamily: 'Raleway, sans-serif' }}
                              >
                                View Bids
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedBidForView({
                                    service: {
                                      id: service.id,
                                      title: service.title,
                                      description: service.description,
                                      budget: service.budget,
                                      currency: service.currency || 'USD'
                                    },
                                    bid: {
                                      id: service.bids[0].id,
                                      bidAmount: parseFloat(service.bids[0].bidAmount.toString()),
                                      currency: service.bids[0].currency || service.currency || 'USD',
                                      message: service.bids[0].message || '',
                                      status: service.bids[0].status,
                                      createdAt: service.bids[0].createdAt
                                    },
                                    eventId: service.event?.id,
                                    eventIsFlagged: service.event?.isFlagged || false,
                                    flagReason: service.event?.flagReason || null
                                  });
                                  setShowViewBidModal(true);
                                }}
                                className="w-full px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors"
                                style={{ fontFamily: 'Raleway, sans-serif' }}
                              >
                                View Bid
                              </button>
                              {serviceStatus === 'ACCEPTED' && service.bids[0]?.status === 'ACCEPTED' && (() => {
                                const wo = allWorkOrders[`service_${service.bids[0].id}`];
                                // Don't show Submit Work button if:
                                // 1. Work order is COMPLETED
                                // 2. Refund has been approved (REFUNDED)
                                // 3. Work order is CANCELLED
                                // 4. Payment status is REFUNDED
                                if (wo && (
                                  wo.status === 'COMPLETED' || 
                                  wo.status === 'CANCELLED' ||
                                  wo.refundStatus === 'REFUNDED' ||
                  wo.paymentStatus === 'REFUNDED'
                                )) {
                                  return null; // Don't show Submit Work button - case is closed
                                }
                                const isRevisionRequested = wo && wo.status === 'REVISION_REQUESTED';
                                const isSubmitted = wo && wo.status === 'SUBMITTED';
                                
                                // If work is submitted, show disabled "Work Submitted" button
                                if (isSubmitted) {
                                  return (
                                    <button
                                      disabled
                                      className="w-full px-6 py-3 bg-gray-300 text-gray-600 rounded-lg font-semibold cursor-not-allowed shadow-sm border border-gray-400"
                                      style={{ fontFamily: 'Raleway, sans-serif' }}
                                    >
                                      ✓ Work Submitted
                                    </button>
                                  );
                                }
                                
                                return (
                                  <button
                                    onClick={async () => {
                                      const eventId = service.event?.id;
                                      if (eventId) {
                                        // Set up submit work context (DO NOT set selectedServiceChat to avoid opening chat modal)
                                        const serviceBidId = service.bids[0]?.id;
                                        setSubmitWorkContext({ eventId, serviceBidId });
                                        // Fetch work order for submit work
                                        await fetchServiceWorkOrder(eventId, serviceBidId);
                                        // Open submit work modal (chat modal will NOT open)
                                        openSubmitWorkModal('service');
                                      } else {
                                        console.error('❌ Cannot submit work: eventId is missing');
                                        alert('Unable to submit work: Event ID is missing');
                                      }
                                    }}
                                    className={`w-full px-6 py-3 text-white rounded-lg font-semibold transition-colors shadow-md ${isRevisionRequested ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-400 hover:bg-green-500'}`}
                                    style={{ fontFamily: 'Raleway, sans-serif' }}
                                  >
                                    {isRevisionRequested ? '🔄 Submit Work Again' : '📦 Submit Work'}
                                  </button>
                                );
                              })()}
                            </>
                          )}
                          <button
                            onClick={() => router.push(`/event/${service.event?.id}`)}
                            className="w-full px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:border-gray-400 hover:bg-gray-50 transition-colors"
                            style={{ fontFamily: 'Raleway, sans-serif' }}
                          >
                            View Event
                          </button>
                        </div>
                      </div>
                    </div>
                      );
                    } else {
                      // Render quote request
                      const r = item;
                      return (
                    <div key={r.id} className="p-8 hover:bg-gray-50 transition-all duration-200 border-b border-gray-100 last:border-b-0">
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-2">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-lg text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{r.fullName}</span>
                                {r.isExternal && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    From listing
                                  </span>
                                )}
                              </div>
                              {r.phone && (
                                <div className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                  {r.phone}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                            <div className="grid grid-cols-2 gap-4 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
                              <div><span className="font-semibold text-gray-700">Event:</span> <span className="text-gray-900">{r.eventType}</span></div>
                              <div><span className="font-semibold text-gray-700">Date:</span> <span className="text-gray-900">{new Date(r.eventDate).toLocaleDateString()}</span></div>
                              <div><span className="font-semibold text-gray-700">Location:</span> <span className="text-gray-900">{r.eventLocation}</span></div>
                              <div><span className="font-semibold text-gray-700">Guests:</span> <span className="text-gray-900">{r.numberOfGuests}</span></div>
                              <div><span className="font-semibold text-gray-700">Budget:</span> <span className="text-gray-900">{r.budgetRange}</span></div>
                            </div>
                            {r.additionalDetails && (
                              <div className="mt-3 pt-3 border-t border-gray-200" style={{ fontFamily: 'Inter, sans-serif' }}>
                                <span className="font-semibold text-gray-700 text-sm">Additional Details:</span>
                                <p className="text-gray-900 text-sm mt-1">{r.additionalDetails}</p>
                              </div>
                            )}
                            {r.status === 'ACCEPTED' && (() => {
                              const wo = allWorkOrders[`quote_${r.id}`];
                              if (wo) {
                                const hasRefundRequest = wo.refundStatus === 'REQUESTED' || wo.refundStatus === 'NEED_MORE_INFO';
                                const refundRequested = wo.refundStatus === 'REQUESTED';
                                const isRefunded = wo.paymentStatus === 'REFUNDED' || wo.refundStatus === 'REFUNDED';
                                
                                return (
                                  <>
                                    {wo.paymentStatus && (
                                      // Payment should only show as "Paid" when work order is COMPLETED (work accepted) AND paymentStatus is COMPLETED
                                      (() => {
                                        const isPaid = wo.status === 'COMPLETED' && wo.paymentStatus === 'COMPLETED';
                                        const isPending = wo.paymentStatus === 'PENDING' || (wo.paymentStatus === 'COMPLETED' && wo.status !== 'COMPLETED');
                                        return (
                                          <div className="mt-3 pt-3 border-t border-gray-200">
                                            <div className="p-2 rounded" style={{
                                              backgroundColor: isRefunded ? '#fff5f5' : isPaid ? '#d1fae5' : isPending ? '#fef3c7' : '#f3f4f6',
                                              border: `1px solid ${isRefunded ? '#dc2626' : isPaid ? '#10b981' : isPending ? '#f59e0b' : '#d1d5db'}`
                                            }}>
                                              <div className="text-xs font-semibold" style={{
                                                color: isRefunded ? '#dc2626' : isPaid ? '#065f46' : isPending ? '#92400e' : '#6b7280',
                                                fontFamily: 'Inter, sans-serif',
                                                letterSpacing: isRefunded ? '0.5px' : 'normal'
                                              }}>
                                                Payment: {isRefunded ? 'REFUNDED' : isPaid ? '💰 Paid' : isPending ? '⏳ Pending' : wo.paymentStatus}
                                              </div>
                                              {isPaid && wo.paymentIntentId && (
                                                <div className="text-xs text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                                  ID: {wo.paymentIntentId.substring(0, 20)}...
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })()
                                    )}
                                    {hasRefundRequest && !isRefunded && (
                                      <div className="mt-3 pt-3 border-t border-gray-200">
                                        <div className="p-2 rounded" style={{
                                          backgroundColor: '#fffbeb',
                                          border: '1px solid #f59e0b'
                                        }}>
                                          <div className="text-xs font-semibold" style={{
                                            color: '#92400e',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {refundRequested 
                                              ? 'Refund Requested' 
                                              : 'Additional Proofs Required'}
                                          </div>
                                          <div className="text-xs mt-1" style={{
                                            color: '#78350f',
                                            fontFamily: 'Inter, sans-serif'
                                          }}>
                                            {refundRequested
                                              ? 'Organiser has requested refund. Admin will decide on it shortly.'
                                              : 'Admin has requested additional proofs from organiser.'}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                        <div className="flex flex-col justify-between">
                          <div className="bg-white rounded-lg p-4 border border-gray-200">
                            <div className="text-xs text-gray-500 mb-2 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>SUBMITTED</div>
                            <div className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{new Date(r.createdAt).toLocaleDateString()}</div>
                          </div>
                          <div className="mt-4">
                            <span className={`inline-flex px-4 py-2 text-xs font-bold rounded-full ${
                              r.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                              r.status === 'CONTACTED' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                              r.status === 'QUOTED' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                              r.status === 'ACCEPTED' ? 'bg-green-100 text-green-800 border border-green-200' :
                              'bg-red-100 text-red-800 border border-red-200'
                            }`} style={{ fontFamily: 'Raleway, sans-serif' }}>
                              {r.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3">
                          {r.status === 'PENDING' && (
                            <>
                              <button 
                                onClick={() => actQuote(r.id, 'quote')} 
                                disabled={actingIds.has(r.id)}
                                className="px-6 py-3 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                              >
                                {actingIds.has(r.id) && actionById[r.id] === 'quote' ? 'Quoting...' : '💰 Send Quote'}
                              </button>
                              <button 
                                onClick={() => actQuote(r.id, 'reject')} 
                                disabled={actingIds.has(r.id)}
                                className="px-6 py-3 bg-red-200 text-red-800 text-sm font-semibold rounded-lg hover:bg-red-300 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105"
                              >
                                {actingIds.has(r.id) && actionById[r.id] === 'reject' ? 'Rejecting...' : 'Reject'}
                              </button>
                              <button 
                                onClick={() => deleteQuote(r.id)} 
                                className="px-6 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 border border-gray-300 hover:border-gray-400"
                              >
                                {deletingIds.has(r.id) ? 'Removing...' : '✕ Remove'}
                              </button>
                            </>
                          )}
                          {r.status === 'CONTACTED' && (
                            <>
                              <button 
                                onClick={() => actQuote(r.id, 'quote')} 
                                disabled={actingIds.has(r.id)}
                                className="px-6 py-3 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                              >
                                {actingIds.has(r.id) && actionById[r.id] === 'quote' ? 'Quoting...' : '💰 Send Quote'}
                              </button>
                              <button 
                                onClick={() => actQuote(r.id, 'reject')} 
                                disabled={actingIds.has(r.id)}
                                className="px-6 py-3 bg-red-200 text-red-800 text-sm font-semibold rounded-lg hover:bg-red-300 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105"
                              >
                                {actingIds.has(r.id) && actionById[r.id] === 'reject' ? 'Rejecting...' : 'Reject'}
                              </button>
                              <button 
                                onClick={() => deleteQuote(r.id)} 
                                className="px-6 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 border border-gray-300 hover:border-gray-400"
                              >
                                {deletingIds.has(r.id) ? 'Removing...' : '✕ Remove'}
                              </button>
                            </>
                          )}
                          {r.status === 'QUOTED' && (
                            <>
                              {!r.finalPriceConfirmed ? (
                                <>
                                  {showFinalPriceForm === r.id ? (
                                    <div className="col-span-full bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                                      <h3 className="font-semibold text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>Confirm Final Price</h3>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                          Final Price ($) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={finalPrice}
                                          onChange={(e) => setFinalPrice(e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                          placeholder="0.00"
                                          required
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                          Delivery Time (Optional)
                                        </label>
                                        <input
                                          type="text"
                                          value={deliveryTime}
                                          onChange={(e) => setDeliveryTime(e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                          placeholder="e.g., 2 weeks, 30 days"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                          Description (Optional)
                                        </label>
                                        <textarea
                                          value={finalPriceDescription}
                                          onChange={(e) => setFinalPriceDescription(e.target.value)}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                          rows={3}
                                          placeholder="Describe what's included in this price..."
                                        />
                                      </div>
                                      <div className="flex gap-2">
                              <button 
                                          onClick={() => {
                                            setShowFinalPriceForm(null);
                                            setFinalPrice('');
                                            setDeliveryTime('');
                                            setFinalPriceDescription('');
                                }} 
                                          disabled={confirmingFinalPrice === r.id}
                                          className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                          Cancel
                              </button>
                                        <button
                                          onClick={() => confirmFinalPrice(r.id)}
                                          disabled={confirmingFinalPrice === r.id || !finalPrice || parseFloat(finalPrice) <= 0}
                                          className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                          {confirmingFinalPrice === r.id ? 'Confirming...' : 'Confirm Final Price'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <button 
                                        onClick={() => setShowFinalPriceForm(r.id)} 
                                        className="px-6 py-3 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                                      >
                                        💰 Confirm Final Price
                                      </button>
                                      <div className="text-xs text-gray-600 mt-2 px-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        You must confirm the final price before the buyer can approve and start escrow.
                                      </div>
                                    </>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-2">
                                    <div className="text-sm font-semibold text-green-800 mb-1" style={{ fontFamily: 'Raleway, sans-serif' }}>
                                      ✓ Final Price Confirmed
                                    </div>
                                    <div className="text-sm text-green-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                                      ${r.finalPrice ? (typeof r.finalPrice === 'number' ? r.finalPrice : parseFloat(String(r.finalPrice))).toFixed(2) : '0.00'}
                                      {r.deliveryTime && ` • ${r.deliveryTime}`}
                                    </div>
                                    {r.escrowLockedAt ? (
                                      <div className="text-xs text-green-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        Escrow locked - You can now submit work
                                      </div>
                                    ) : (
                                      <div className="text-xs text-yellow-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        Waiting for buyer to approve and lock escrow...
                                      </div>
                                    )}
                                  </div>
                                  {/* Show refund request status for accepted quotes */}
                                  {r.status === 'ACCEPTED' && (() => {
                                    const wo = allWorkOrders[`quote_${r.id}`];
                                    if (wo && (wo.refundStatus === 'REQUESTED' || wo.refundStatus === 'NEED_MORE_INFO')) {
                                      const isRefunded = wo.paymentStatus === 'REFUNDED' || wo.refundStatus === 'REFUNDED';
                                      const refundRequested = wo.refundStatus === 'REQUESTED';
                                      if (!isRefunded) {
                                        return (
                                          <div className="p-2 rounded mb-2" style={{
                                            backgroundColor: '#fffbeb',
                                            border: '1px solid #f59e0b'
                                          }}>
                                            <div className="text-xs font-semibold" style={{
                                              color: '#92400e',
                                              fontFamily: 'Inter, sans-serif'
                                            }}>
                                              {refundRequested 
                                                ? 'Refund Requested' 
                                                : 'Additional Proofs Required'}
                                            </div>
                                            <div className="text-xs mt-1" style={{
                                              color: '#78350f',
                                              fontFamily: 'Inter, sans-serif'
                                            }}>
                                              {refundRequested
                                                ? 'Organiser has requested refund. Admin will decide on it shortly.'
                                                : 'Admin has requested additional proofs from organiser.'}
                                            </div>
                                          </div>
                                        );
                                      }
                                    }
                                    return null;
                                  })()}
                                </>
                              )}
                              <button 
                                onClick={() => deleteQuote(r.id)} 
                                className="px-6 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 border border-gray-300 hover:border-gray-400"
                              >
                                {deletingIds.has(r.id) ? 'Removing...' : '✕ Remove'}
                              </button>
                            </>
                          )}
                          {r.status === 'ACCEPTED' && (() => {
                            const wo = allWorkOrders[`quote_${r.id}`];
                            // Don't show Submit Work button if:
                            // 1. Work order is COMPLETED
                            // 2. Refund has been approved (REFUNDED)
                            // 3. Work order is CANCELLED
                            // 4. Payment status is REFUNDED
                            if (wo && (
                              wo.status === 'COMPLETED' || 
                              wo.status === 'CANCELLED' ||
                              wo.refundStatus === 'REFUNDED' ||
                              wo.paymentStatus === 'REFUNDED'
                            )) {
                              return null; // Don't show Submit Work button - case is closed
                            }
                            const isRevisionRequested = wo && wo.status === 'REVISION_REQUESTED';
                            const isSubmitted = wo && wo.status === 'SUBMITTED';
                            
                            // If work is submitted, show disabled "Work Submitted" button
                            if (isSubmitted) {
                              return (
                                <button
                                  disabled
                                  className="px-6 py-3 bg-gray-300 text-gray-600 text-sm font-semibold rounded-lg cursor-not-allowed transition-all duration-200 shadow-sm border border-gray-400"
                                >
                                  ✓ Work Submitted
                                </button>
                              );
                            }
                            
                            return (
                              <>
                                <button
                                  onClick={async () => {
                                    // Set up submit work context (DO NOT set selectedChatQuote to avoid opening chat modal)
                                    setSubmitWorkContext({ quoteId: r.id });
                                    // Fetch the latest quote data to ensure we have escrowLockedAt and other updated fields
                                    try {
                                      const response = await fetch(`${API_BASE}/vendors/quote-requests`, { credentials: 'include', headers: getAuthHeaders() });
                                      if (response.ok) {
                                        const allQuotes = await response.json();
                                        const updatedQuote = allQuotes.find((q: QuoteRequest) => q.id === r.id);
                                        if (updatedQuote) {
                                          // Update quote data but don't set selectedChatQuote (which would open chat)
                                          setQuoteData(prev => prev.map(q => q.id === updatedQuote.id ? updatedQuote : q));
                                        }
                                      }
                                    } catch (error) {
                                      console.error('Error fetching updated quote:', error);
                                    }
                                    await fetchWorkOrder(r.id); // Fetch work order
                                    openSubmitWorkModal('quote'); // Open submit work modal (chat modal will NOT open)
                                  }}
                                  className={`px-6 py-3 text-white text-sm font-semibold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 ${isRevisionRequested ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-400 hover:bg-green-500'}`}
                                >
                                  {isRevisionRequested ? '🔄 Submit Work Again' : '📦 Submit Work'}
                                </button>
                                <button 
                                  onClick={() => deleteQuote(r.id)} 
                                  className="px-6 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 border border-gray-300 hover:border-gray-400"
                                >
                                  {deletingIds.has(r.id) ? 'Removing...' : '✕ Remove'}
                                </button>
                              </>
                            );
                          })()}
                          {r.status === 'NEGOTIATING' && (
                            <>
                              <button 
                                onClick={() => openChat(r)} 
                                className="px-6 py-3 bg-blue-800 text-white text-sm font-semibold rounded-lg hover:bg-blue-900 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
                              >
                                Chat
                              </button>
                              <button 
                                onClick={() => deleteQuote(r.id)} 
                                className="px-6 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 border border-gray-300 hover:border-gray-400"
                              >
                                {deletingIds.has(r.id) ? 'Removing...' : '✕ Remove'}
                              </button>
                            </>
                          )}
                          {r.status === 'REJECTED' && (
                            <>
                              <button 
                                onClick={() => deleteQuote(r.id)} 
                                className="px-6 py-3 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105 border border-gray-300 hover:border-gray-400"
                              >
                                ✕ Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                      );
                    }
                  })
                  )}
                </>
              ) : activeTab === 'booking' ? (
                bookingData.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Raleway, sans-serif' }}>No booking requests found</h3>
                    <p className="text-gray-600 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>Booking requests will appear here when customers book your services.</p>
                    <div className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      💡 Tip: Complete your service listings to get more bookings
                    </div>
                  </div>
                ) : (
                  bookingData.map((r) => (
                    <div key={r.id} className="p-8 hover:bg-gray-50 transition-all duration-200 border-b border-gray-100 last:border-b-0">
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
                        <div className="md:col-span-2">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                            </div>
                            <div>
                              <div className="font-bold text-lg text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{r.customerName}</div>
                              <div className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>{new Date(r.date).toLocaleDateString()}</div>
                            </div>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>{r?.service?.name}</div>
                        </div>
                        <div className="bg-white rounded-lg p-4 border border-gray-200">
                          <div className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{r.amount} {r.currency}</div>
                        </div>
                        <div className="flex flex-col gap-3">
                    {r.status === 'PENDING' ? (
                      <>
                              <button 
                                onClick={() => actBooking(r.id, 'accept')} 
                                disabled={actingIds.has(r.id)}
                                className="px-6 py-3 bg-green-200 text-green-800 text-sm font-semibold rounded-lg hover:bg-green-300 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105"
                              >
                                Accept
                              </button>
                              <button 
                                onClick={() => actBooking(r.id, 'reject')} 
                                disabled={actingIds.has(r.id)}
                                className="px-6 py-3 bg-red-200 text-red-800 text-sm font-semibold rounded-lg hover:bg-red-300 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105"
                              >
                                Reject
                              </button>
                      </>
                    ) : (
                            <div className="text-center">
                              <span className={`inline-flex px-4 py-2 text-xs font-bold rounded-full ${
                                r.status === 'ACCEPTED' ? 'bg-green-100 text-green-800 border border-green-200' : 
                                r.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                'bg-gray-100 text-gray-800 border border-gray-200'
                              }`} style={{ fontFamily: 'Raleway, sans-serif' }}>
                                {r.status}
                              </span>
                            </div>
                    )}
                  </div>
                </div>
                    </div>
                  ))
                )
              ) : activeTab === 'completed' ? (
                completedWorkLoading || loading ? (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 border-4 border-[#0B1A33] border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                    <p className="text-lg font-medium text-gray-600" style={{ fontFamily: 'Raleway, sans-serif' }}>Loading completed work...</p>
                  </div>
                ) : completedWorkOrders.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Raleway, sans-serif' }}>No completed work yet</h3>
                    <p className="text-gray-600 mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>Completed work orders with ratings will appear here.</p>
                  </div>
                ) : (
                  completedWorkOrders.map((wo: any) => (
                    <div key={wo.id} className="p-8 hover:bg-gray-50 transition-all duration-200 border-b border-gray-100 last:border-b-0">
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-3">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div>
                              <div className="font-bold text-lg text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>
                                {wo.quoteRequest ? wo.quoteRequest.fullName : wo.serviceBid?.eventService?.event?.title || 'Service Request'}
                              </div>
                              <div className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {wo.quoteRequest 
                                  ? `${wo.quoteRequest.eventType} • ${new Date(wo.quoteRequest.eventDate).toLocaleDateString()}`
                                  : wo.serviceBid?.eventService?.title || 'Event Service'
                                }
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                            {wo.review && (
                              <div className="border-l-4 border-green-500 pl-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>Rating:</span>
                                  <div className="flex items-center">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <svg
                                        key={star}
                                        className={`w-5 h-5 ${star <= wo.review.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                      >
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                    ))}
                                    <span className="ml-2 text-sm font-bold text-gray-900">{wo.review.rating}/5</span>
                                  </div>
                                </div>
                                {wo.review.comment && (
                                  <p className="text-sm text-gray-700 italic" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    "{wo.review.comment}"
                                  </p>
                                )}
                                <div className="text-xs text-gray-500 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                                  Completed: {wo.completedAt ? new Date(wo.completedAt).toLocaleDateString() : 'N/A'}
                                </div>
                              </div>
                            )}
                            {!wo.review && (
                              <div className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Work completed • Awaiting rating
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-3">
                          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                            <div className="text-xs text-green-600 mb-1 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>STATUS</div>
                            <div className="text-sm font-bold text-green-800" style={{ fontFamily: 'Raleway, sans-serif' }}>COMPLETED</div>
                          </div>
                          {wo.paymentStatus && (
                            <div className={`rounded-lg p-4 border ${
                              (wo.status === 'COMPLETED' && wo.paymentStatus === 'COMPLETED')
                                ? 'bg-green-50 border-green-200' 
                                : wo.paymentStatus === 'PENDING' || (wo.paymentStatus === 'COMPLETED' && wo.status !== 'COMPLETED')
                                ? 'bg-yellow-50 border-yellow-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}>
                              <div className="text-xs mb-1 font-medium" style={{ 
                                fontFamily: 'Inter, sans-serif',
                                color: (wo.status === 'COMPLETED' && wo.paymentStatus === 'COMPLETED') ? '#166534' : (wo.paymentStatus === 'PENDING' || (wo.paymentStatus === 'COMPLETED' && wo.status !== 'COMPLETED')) ? '#92400e' : '#6b7280'
                              }}>
                                PAYMENT STATUS
                              </div>
                              <div className={`text-sm font-bold ${
                                (wo.status === 'COMPLETED' && wo.paymentStatus === 'COMPLETED') ? 'text-green-800' : 
                                (wo.paymentStatus === 'PENDING' || (wo.paymentStatus === 'COMPLETED' && wo.status !== 'COMPLETED')) ? 'text-yellow-800' : 
                                'text-gray-800'
                              }`} style={{ fontFamily: 'Raleway, sans-serif' }}>
                                {(wo.status === 'COMPLETED' && wo.paymentStatus === 'COMPLETED') ? '💰 PAID' : 
                                 (wo.paymentStatus === 'PENDING' || (wo.paymentStatus === 'COMPLETED' && wo.status !== 'COMPLETED')) ? '⏳ PENDING' : 
                                 wo.paymentStatus}
                              </div>
                              {(wo.status === 'COMPLETED' && wo.paymentStatus === 'COMPLETED') && wo.paymentIntentId && (
                                <div className="text-xs text-gray-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                                  Payment ID: {wo.paymentIntentId.substring(0, 20)}...
                                </div>
                              )}
                            </div>
                          )}
                          {wo.organizer && (
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                              <div className="text-xs text-gray-500 mb-1 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>ORGANIZER</div>
                              <div className="text-sm font-semibold text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>
                                {wo.organizer.firstName} {wo.organizer.lastName}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Vendor Message Icon */
      }
      <div 
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          cursor: 'pointer',
          display: 'none'
        }}
        onClick={async () => {
          // Toggle immediately for responsiveness, then fetch in background
          setShowVendorNotifications(prev => !prev);
          if (!showVendorNotifications) {
            setVendorNotificationsLoading(true);
            const notes = await fetchVendorNotifications();
            setNotifications(Array.isArray(notes) ? notes : []);
          }
        }}
      >
        <div style={{
          width: '60px',
          height: '60px',
          backgroundColor: '#0B1A33',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.3s ease',
          border: '2px solid white',
          position: 'relative'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.backgroundColor = '#1a2a4a';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.backgroundColor = '#0B1A33';
        }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"/>
            <path d="M8 9H16M8 13H16M8 17H12"/>
          </svg>
          
          {/* Notification Badge */}
          {(notifications.filter(req => req.status === 'QUOTED' || req.status === 'ACCEPTED' || (req as any).status === 'NEGOTIATING').length > 0 || unreadCount > 0) && (
            <div style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              backgroundColor: '#EF4444',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              border: '2px solid white'
            }}>
              {notifications.filter(req => req.status === 'QUOTED' || req.status === 'ACCEPTED' || (req as any).status === 'NEGOTIATING').length + unreadCount}
            </div>
          )}
        </div>
      </div>

      {/* Vendor Notifications Modal */}
      {showVendorNotifications && (
        <div style={{
          position: 'fixed',
          bottom: '90px',
          right: '20px',
          width: '350px',
          maxHeight: '400px',
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          zIndex: 1001,
          border: '1px solid #E5E7EB',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#F9FAFB'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{
                fontFamily: 'Inter',
                fontWeight: '600',
                fontSize: '16px',
                color: '#0B1A33',
                margin: '0'
              }}>
                Active Conversations
              </h3>
              <button
                onClick={() => setShowVendorNotifications(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  color: '#6B7280'
                }}
              >
                ✕
              </button>
            </div>
          </div>
          
          <div style={{
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '8px'
          }}>
            {vendorNotificationsLoading ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#6B7280',
                fontSize: '14px'
              }}>
                Loading conversations...
              </div>
            ) : notifications.filter(req => req.status === 'QUOTED' || req.status === 'ACCEPTED' || (req as any).status === 'NEGOTIATING').length === 0 ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#6B7280',
                fontSize: '14px'
              }}>
                No active conversations
              </div>
            ) : (
              notifications
                .filter(req => req.status === 'QUOTED' || req.status === 'ACCEPTED' || (req as any).status === 'NEGOTIATING')
                .map((request) => (
                  <div
                    key={request.id}
                    style={{
                      padding: '12px',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                      marginBottom: '8px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      position: 'relative'
                    }}
                    onClick={() => openChat(request)}
                  >
                    {/* Delete (X) button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteQuote(request.id); }}
                      title="Delete conversation"
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        background: 'transparent',
                        border: 'none',
                        color: '#9CA3AF',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px'
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F3F4F6'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                    >
                      ✕
                    </button>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '8px'
                    }}>
                      <div>
                        <div style={{
                          fontFamily: 'Inter',
                          fontWeight: '600',
                          fontSize: '14px',
                          color: '#0B1A33',
                          marginBottom: '2px'
                        }}>
                          {request.fullName}
                        </div>
                        <div style={{
                          fontFamily: 'Inter',
                          fontSize: '12px',
                          color: '#6B7280'
                        }}>
                          {request.eventType}
                        </div>
                      </div>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: '500',
                        backgroundColor: request.status === 'QUOTED' ? '#DBEAFE' :
                                       request.status === 'ACCEPTED' ? '#D1FAE5' :
                                       '#FEF3C7',
                        color: request.status === 'QUOTED' ? '#1E40AF' :
                              request.status === 'ACCEPTED' ? '#065F46' :
                              '#92400E'
                      }}>
                        {request.status}
                      </span>
                    </div>
                    
                    <div style={{
                      fontFamily: 'Inter',
                      fontSize: '10px',
                      color: '#9CA3AF',
                      marginTop: '8px'
                    }}>
                      Click to chat
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* Chat Modal */}
      {selectedChatQuote && (
        <div style={{
          position: 'fixed',
          inset: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1002,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)',
            border: '1px solid #e5e7eb'
          }}>
            {/* Chat Header */}
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '12px 12px 0 0'
            }}>
              <div>
                <h3 style={{
                  margin: '0 0 5px 0',
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#1f2937'
                }}>
                  {selectedChatQuote.fullName}
                </h3>
                <p style={{
                  margin: '0',
                  fontSize: '13px',
                  color: '#6b7280'
                }}>
                  {selectedChatQuote.eventType} • {selectedChatQuote.status}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedChatQuote(null);
                  setChatMessages([]);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '20px',
                  color: '#6b7280',
                  padding: '8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                ×
              </button>
            </div>

            {/* Chat Messages */}
            <div style={{
              flex: '1',
              padding: '20px',
              overflowY: 'auto',
              maxHeight: '300px',
              backgroundColor: '#fafbfc'
            }}>
              {chatMessages.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: '14px',
                  padding: '40px 20px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>💬</div>
                  <div style={{ fontWeight: '500', marginBottom: '4px' }}>No messages yet</div>
                  <div style={{ fontSize: '12px', opacity: '0.8' }}>Start the conversation</div>
                </div>
              ) : (
                chatMessages.map((message, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      justifyContent: message.senderType === 'VENDOR' ? 'flex-end' : 'flex-start',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{
                      maxWidth: '80%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      backgroundColor: message.messageType === 'WORK_SUBMISSION' 
                        ? (message.senderType === 'VENDOR' ? '#d1fae5' : '#fef3c7')
                        : (message.senderType === 'VENDOR' ? '#0B1A33' : 'white'),
                      color: message.messageType === 'WORK_SUBMISSION'
                        ? (message.senderType === 'VENDOR' ? '#065f46' : '#92400e')
                        : (message.senderType === 'VENDOR' ? 'white' : '#374151'),
                      fontSize: '14px',
                      marginBottom: '12px',
                      border: message.messageType === 'WORK_SUBMISSION'
                        ? '2px solid #10b981'
                        : (message.senderType === 'VENDOR' ? 'none' : '1px solid #e5e7eb'),
                      boxShadow: message.senderType === 'VENDOR' ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.1)'
                    }}>
                      {message.messageType === 'WORK_SUBMISSION' && (
                        <div style={{ 
                          marginBottom: '8px', 
                          fontSize: '12px', 
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          📦 {message.senderType === 'VENDOR' ? 'Work Submitted' : 'Submitted Work'}
                        </div>
                      )}
                      <div style={{ marginBottom: '4px', fontSize: '12px', opacity: '0.7' }}>
                        {message.senderType === 'VENDOR' ? 'You' : 'Customer'}
                      </div>
                      <div>{message.message}</div>
                      {message.attachments && message.attachments.length > 0 && (
                        <div style={{ marginTop: '6px' }}>
                          {message.attachments.map((attachment: string, i: number) => (
                            <a
                              key={i}
                              href={attachment}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: message.senderType === 'VENDOR' ? '#93C5FD' : '#0066cc',
                                textDecoration: 'underline',
                                fontSize: '12px'
                              }}
                            >
                              📎 {attachment.split('/').pop()}
                            </a>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: '10px', opacity: '0.6', marginTop: '4px' }}>
                        {new Date(message.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chat Input */}
            <div style={{
              padding: '20px',
              borderTop: '1px solid #e5e7eb',
              backgroundColor: 'white',
              borderRadius: '0 0 12px 12px'
            }}>
              {/* Work Order Status and Rating Display */}
              {workOrder && (
                <div style={{ 
                  marginBottom: '8px', 
                  padding: '6px 10px', 
                  backgroundColor: workOrder.status === 'COMPLETED' ? '#d1fae5' : '#fef3c7', 
                  borderRadius: '6px', 
                  border: `1px solid ${workOrder.status === 'COMPLETED' ? '#10b981' : '#f59e0b'}`,
                  fontSize: '11px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '600', color: '#374151' }}>
                          Status: <span style={{ color: workOrder.status === 'COMPLETED' ? '#059669' : '#d97706' }}>{workOrder.status}</span>
                        </span>
                        {workOrder.paymentStatus && (
                          <>
                            <span style={{ color: '#6b7280' }}>•</span>
                            <span style={{ fontWeight: '600', color: (workOrder.status === 'COMPLETED' && workOrder.paymentStatus === 'COMPLETED') ? '#059669' : (workOrder.paymentStatus === 'PENDING' || (workOrder.paymentStatus === 'COMPLETED' && workOrder.status !== 'COMPLETED')) ? '#d97706' : '#6b7280' }}>
                              Payment: {(workOrder.status === 'COMPLETED' && workOrder.paymentStatus === 'COMPLETED') ? '💰 Paid' : (workOrder.paymentStatus === 'PENDING' || (workOrder.paymentStatus === 'COMPLETED' && workOrder.status !== 'COMPLETED')) ? '⏳ Pending' : workOrder.paymentStatus}
                            </span>
                          </>
                        )}
                        {workOrder.status === 'COMPLETED' && workOrder.review && (
                          <>
                            <span style={{ color: '#6b7280' }}>•</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <span key={star} style={{ fontSize: '10px', color: star <= workOrder.review.rating ? '#fbbf24' : '#d1d5db' }}>★</span>
                              ))}
                              <span style={{ marginLeft: '2px', fontWeight: '600', color: '#374151' }}>{workOrder.review.rating}/5</span>
                            </div>
                            {workOrder.review.comment && (
                              <>
                                <span style={{ color: '#6b7280' }}>•</span>
                                <span style={{ color: '#4b5563', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                                  "{workOrder.review.comment}"
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {workOrder.status === 'COMPLETED' && (
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>🎉</span>
                    )}
                  </div>
                </div>
              )}
              {/* Submit Work Button - Show ONLY when quote is ACCEPTED and escrow is locked */}
              {selectedChatQuote?.status === 'ACCEPTED' && (
                <div style={{ marginBottom: '12px' }}>
                  {!selectedChatQuote.escrowLockedAt ? (
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#92400e',
                      textAlign: 'center'
                    }}>
                      ⏳ Waiting for buyer to approve and lock escrow before you can submit work.
                    </div>
                  ) : (
                    <>
                  {/* Don't show Submit Work button if refund is approved or work order is cancelled */}
                  {workOrder && (
                    workOrder.status === 'COMPLETED' || 
                    workOrder.status === 'CANCELLED' ||
                    workOrder.refundStatus === 'REFUNDED' ||
                    workOrder.paymentStatus === 'REFUNDED'
                  ) ? null : (
                    <>
                  {workOrder?.status === 'SUBMITTED' ? (
                    <button
                      disabled
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: '#9ca3af',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'not-allowed',
                        fontSize: '14px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      ✓ Work Submitted
                    </button>
                  ) : (
                    <button
                      onClick={() => openSubmitWorkModal('quote')}
                      disabled={submittingWork}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: submittingWork ? '#9ca3af' : workOrder?.status === 'REVISION_REQUESTED' ? '#f59e0b' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: submittingWork ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        if (!submittingWork) {
                          e.currentTarget.style.backgroundColor = workOrder?.status === 'REVISION_REQUESTED' ? '#d97706' : '#059669';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!submittingWork) {
                          e.currentTarget.style.backgroundColor = workOrder?.status === 'REVISION_REQUESTED' ? '#f59e0b' : '#10b981';
                        }
                      }}
                    >
                      {workOrder?.status === 'REVISION_REQUESTED' ? '🔄 Submit Work Again' : '📦 Submit Work'}
                    </button>
                  )}
                    </>
                  )}
                  {workOrder && workOrder.status === 'REVISION_REQUESTED' && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '8px', 
                      backgroundColor: '#fef3c7', 
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#92400e'
                    }}>
                      ⚠️ Revision requested. Please review and resubmit your work.
                    </div>
                      )}
                    </>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const url = await handleChatFileUpload(file);
                        setNewMessage(prev => prev + `\n📎 ${file.name}: ${url}`);
                      } catch (error) {
                        console.error('Upload failed:', error);
                      }
                    }
                  }}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                  style={{ display: 'none' }}
                  id="vendor-file-upload"
                  disabled={uploadingChatFile}
                />
                <label
                  htmlFor="vendor-file-upload"
                  style={{
                    padding: '10px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                    e.currentTarget.style.borderColor = '#d1d5db';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  📎
                </label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  style={{
                    flex: '1',
                    padding: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'none',
                    outline: 'none',
                    transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0B1A33';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!newMessage.trim() || uploadingChatFile}
                  style={{
                    padding: '12px 20px',
                    backgroundColor: uploadingChatFile ? '#9ca3af' : '#0B1A33',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: uploadingChatFile ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!uploadingChatFile) {
                      e.currentTarget.style.backgroundColor = '#1e3a8a';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!uploadingChatFile) {
                      e.currentTarget.style.backgroundColor = '#0B1A33';
                    }
                  }}
                >
                  {uploadingChatFile ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Chat Modal */}
      {selectedServiceChat && (
        <div style={{
          position: 'fixed', inset: '0', backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002, padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '500px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)', border: '1px solid #e5e7eb'
          }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: '12px 12px 0 0' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', fontWeight: '600', color: '#1f2937' }}>
                  {selectedServiceChat.organizerName || 'Organizer'}
                </h3>
                <p style={{ margin: '0', fontSize: '13px', color: '#6b7280' }}>
                  {selectedServiceChat.eventTitle || 'Event'} • Accepted Bid Chat
                </p>
              </div>
              <button
                onClick={() => { setSelectedServiceChat(null); setServiceChatMessages([]); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6b7280', padding: '8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: '1', padding: '20px', overflowY: 'auto', maxHeight: '300px', backgroundColor: '#fafbfc' }}>
              {serviceChatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '14px', padding: '40px 20px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>💬</div>
                  <div style={{ fontWeight: '500', marginBottom: '4px' }}>No messages yet</div>
                  <div style={{ fontSize: '12px', opacity: '0.8' }}>Start the conversation</div>
                </div>
              ) : (
                serviceChatMessages.map((message, index) => (
                  <div key={index} style={{ display: 'flex', justifyContent: message.senderType === 'VENDOR' ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
                    <div style={{ 
                      maxWidth: '80%', 
                      padding: '12px 16px', 
                      borderRadius: '12px', 
                      backgroundColor: message.messageType === 'WORK_SUBMISSION' 
                        ? (message.senderType === 'VENDOR' ? '#d1fae5' : '#fef3c7')
                        : (message.senderType === 'VENDOR' ? '#0B1A33' : 'white'), 
                      color: message.messageType === 'WORK_SUBMISSION'
                        ? (message.senderType === 'VENDOR' ? '#065f46' : '#92400e')
                        : (message.senderType === 'VENDOR' ? 'white' : '#374151'), 
                      fontSize: '14px', 
                      marginBottom: '12px', 
                      border: message.messageType === 'WORK_SUBMISSION'
                        ? '2px solid #10b981'
                        : (message.senderType === 'VENDOR' ? 'none' : '1px solid #e5e7eb'), 
                      boxShadow: message.senderType === 'VENDOR' ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.1)' 
                    }}>
                      {message.messageType === 'WORK_SUBMISSION' && (
                        <div style={{ 
                          marginBottom: '8px', 
                          fontSize: '12px', 
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          📦 {message.senderType === 'VENDOR' ? 'Work Submitted' : 'Submitted Work'}
                        </div>
                      )}
                      <div style={{ marginBottom: '4px', fontSize: '12px', opacity: '0.7' }}>
                        {message.senderType === 'VENDOR' ? 'You' : 'Customer'}
                      </div>
                      <div>{message.message}</div>
                      {message.attachments && message.attachments.length > 0 && (
                        <div style={{ marginTop: '6px' }}>
                          {message.attachments.map((attachment: string, i: number) => (
                            <a key={i} href={attachment} target="_blank" rel="noopener noreferrer" style={{ color: message.senderType === 'VENDOR' ? '#93C5FD' : '#0066cc', textDecoration: 'underline', fontSize: '12px' }}>
                              📎 {attachment.split('/').pop()}
                            </a>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: '10px', opacity: '0.6', marginTop: '4px' }}>
                        {new Date(message.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid #e5e7eb', backgroundColor: 'white', borderRadius: '0 0 12px 12px' }}>
              {/* Work Order Status and Rating Display */}
              {serviceWorkOrder && (
                <div style={{ 
                  marginBottom: '8px', 
                  padding: '6px 10px', 
                  backgroundColor: serviceWorkOrder.status === 'COMPLETED' ? '#d1fae5' : '#fef3c7', 
                  borderRadius: '6px', 
                  border: `1px solid ${serviceWorkOrder.status === 'COMPLETED' ? '#10b981' : '#f59e0b'}`,
                  fontSize: '11px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '600', color: '#374151' }}>
                          Status: <span style={{ color: serviceWorkOrder.status === 'COMPLETED' ? '#059669' : '#d97706' }}>{serviceWorkOrder.status}</span>
                        </span>
                        {serviceWorkOrder.paymentStatus && (
                          <>
                            <span style={{ color: '#6b7280' }}>•</span>
                            <span style={{ fontWeight: '600', color: (serviceWorkOrder.status === 'COMPLETED' && serviceWorkOrder.paymentStatus === 'COMPLETED') ? '#059669' : (serviceWorkOrder.paymentStatus === 'PENDING' || (serviceWorkOrder.paymentStatus === 'COMPLETED' && serviceWorkOrder.status !== 'COMPLETED')) ? '#d97706' : '#6b7280' }}>
                              Payment: {(serviceWorkOrder.status === 'COMPLETED' && serviceWorkOrder.paymentStatus === 'COMPLETED') ? '💰 Paid' : (serviceWorkOrder.paymentStatus === 'PENDING' || (serviceWorkOrder.paymentStatus === 'COMPLETED' && serviceWorkOrder.status !== 'COMPLETED')) ? '⏳ Pending' : serviceWorkOrder.paymentStatus}
                            </span>
                          </>
                        )}
                        {serviceWorkOrder.status === 'COMPLETED' && serviceWorkOrder.review && (
                          <>
                            <span style={{ color: '#6b7280' }}>•</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <span key={star} style={{ fontSize: '10px', color: star <= serviceWorkOrder.review.rating ? '#fbbf24' : '#d1d5db' }}>★</span>
                              ))}
                              <span style={{ marginLeft: '2px', fontWeight: '600', color: '#374151' }}>{serviceWorkOrder.review.rating}/5</span>
                            </div>
                            {serviceWorkOrder.review.comment && (
                              <>
                                <span style={{ color: '#6b7280' }}>•</span>
                                <span style={{ color: '#4b5563', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                                  "{serviceWorkOrder.review.comment}"
                                </span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {serviceWorkOrder.status === 'COMPLETED' && (
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>🎉</span>
                    )}
                  </div>
                </div>
              )}
              {/* Submit Work Button for Service Chat - ALWAYS show when service chat is open (means bid is accepted) */}
              {selectedServiceChat && (
                <div style={{ marginBottom: '12px' }}>
                  {serviceWorkOrder?.status === 'SUBMITTED' ? (
                    <button
                      disabled
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: '#9ca3af',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'not-allowed',
                        fontSize: '14px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      ✓ Work Submitted
                    </button>
                  ) : (
                    <button
                      onClick={() => openSubmitWorkModal('service')}
                      disabled={submittingServiceWork}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: submittingServiceWork ? '#9ca3af' : serviceWorkOrder?.status === 'REVISION_REQUESTED' ? '#f59e0b' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: submittingServiceWork ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        if (!submittingServiceWork) {
                          e.currentTarget.style.backgroundColor = serviceWorkOrder?.status === 'REVISION_REQUESTED' ? '#d97706' : '#059669';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!submittingServiceWork) {
                          e.currentTarget.style.backgroundColor = serviceWorkOrder?.status === 'REVISION_REQUESTED' ? '#f59e0b' : '#10b981';
                        }
                      }}
                    >
                      {serviceWorkOrder?.status === 'REVISION_REQUESTED' ? '🔄 Submit Work Again' : '📦 Submit Work'}
                    </button>
                  )}
                  {serviceWorkOrder && serviceWorkOrder.status === 'REVISION_REQUESTED' && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '8px', 
                      backgroundColor: '#fef3c7', 
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#92400e'
                    }}>
                      ⚠️ Revision requested. Please review and resubmit your work.
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const url = await handleServiceFileUpload(file);
                        setServiceNewMessage(prev => prev + `\n📎 ${file.name}: ${url}`);
                      } catch (error) {
                        console.error('Upload failed:', error);
                      }
                    }
                  }}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                  style={{ display: 'none' }}
                  id="vendor-service-file-upload"
                  disabled={uploadingServiceFile}
                />
                <label htmlFor="vendor-service-file-upload" style={{ padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', transition: 'all 0.2s ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.borderColor = '#d1d5db'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                >
                  📎
                </label>
                <textarea
                  value={serviceNewMessage}
                  onChange={(e) => setServiceNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  style={{ flex: '1', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', resize: 'none', outline: 'none', transition: 'border-color 0.2s ease' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#0B1A33'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendServiceChatMessage(); } }}
                />
                <button onClick={sendServiceChatMessage} disabled={!serviceNewMessage.trim() || uploadingServiceFile} style={{ padding: '12px 20px', backgroundColor: uploadingServiceFile ? '#9ca3af' : '#0B1A33', color: 'white', border: 'none', borderRadius: '8px', cursor: uploadingServiceFile ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '500', transition: 'all 0.2s ease' }}
                  onMouseEnter={(e) => { if (!uploadingServiceFile) { e.currentTarget.style.backgroundColor = '#1e3a8a'; } }}
                  onMouseLeave={(e) => { if (!uploadingServiceFile) { e.currentTarget.style.backgroundColor = '#0B1A33'; } }}
                >
                  {uploadingServiceFile ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Bid Notifications Modal */}
      <BidNotification 
        isOpen={showBidNotifications} 
        onClose={() => setShowBidNotifications(false)} 
      />

      {/* Place Bid Modal */}
      {selectedServiceForBid && (
        <BidSubmissionModal
          isOpen={showBidModal}
          onClose={() => {
            setShowBidModal(false);
            setSelectedServiceForBid(null);
          }}
          onSubmit={async (bidData) => {
            const response = await fetch(
              `${API_BASE}/events/${selectedServiceForBid.event?.id}/services/${selectedServiceForBid.id}/bids`,
              {
                method: 'POST',
                headers: getAuthHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                  vendorId: user?.id || '',
                  bidAmount: bidData.bidAmount,
                  currency: selectedServiceForBid.currency || 'USD',
                  message: bidData.message,
                  attachments: bidData.attachments || [],
                }),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              let errorMessage = errorText || `Failed to submit bid: ${response.statusText}`;
              // Try to parse JSON error if available
              try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.message) {
                  errorMessage = errorJson.message;
                }
              } catch {
                // Use text as-is if not JSON
              }
              throw new Error(errorMessage);
            }

            // Refresh services to show the new bid
            await loadEventServices();
          }}
          service={{
            id: selectedServiceForBid.id,
            title: selectedServiceForBid.title,
            description: selectedServiceForBid.description,
            budget: selectedServiceForBid.budget ? parseFloat(selectedServiceForBid.budget.toString()) : undefined,
            currency: selectedServiceForBid.currency || 'USD',
          }}
          vendorId={user?.id || ''}
          eventId={selectedServiceForBid.event?.id || ''}
          onBidSubmitted={() => {
            loadEventServices();
          }}
        />
      )}

      {/* View Bid Modal */}
      {selectedBidForView && (
        <ViewBidModal
          isOpen={showViewBidModal}
          onClose={() => {
            setShowViewBidModal(false);
            setSelectedBidForView(null);
          }}
          bid={selectedBidForView.bid}
          service={selectedBidForView.service}
          eventId={selectedBidForView.eventId}
          eventIsFlagged={selectedBidForView.eventIsFlagged || false}
          flagReason={selectedBidForView.flagReason || null}
          onBidUpdated={() => {
            loadEventServices();
          }}
          onBidDeleted={() => {
            loadEventServices();
          }}
        />
      )}

      {/* View All Bids Modal */}
      {selectedServiceForAllBids && (
        <ViewAllBidsModal
          isOpen={showViewAllBidsModal}
          onClose={() => {
            setShowViewAllBidsModal(false);
            setSelectedServiceForAllBids(null);
          }}
          service={selectedServiceForAllBids.service}
          eventId={selectedServiceForAllBids.eventId}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2">
          <div className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] ${
            toast.type === 'success' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {toast.type === 'success' ? (
              <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <p className={`text-sm font-medium flex-1 ${
              toast.type === 'success' ? 'text-green-800' : 'text-red-800'
            }`} style={{ fontFamily: 'Inter, sans-serif' }}>
              {toast.message}
            </p>
            <button
              onClick={() => setToast(null)}
              className={`text-gray-400 hover:${
                toast.type === 'success' ? 'text-green-600' : 'text-red-600'
              } transition-colors`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Submit Work Modal */}
      {showSubmitWorkModal && (
        <div style={{
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
        }} onClick={() => !uploadingFiles && setShowSubmitWorkModal(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>📦 Submit Work</h2>
              <button
                onClick={() => setShowSubmitWorkModal(false)}
                disabled={uploadingFiles}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: uploadingFiles ? 'not-allowed' : 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            {/* Message */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Message (Optional)
              </label>
              <textarea
                value={submitWorkMessage}
                onChange={(e) => setSubmitWorkMessage(e.target.value)}
                placeholder="Add a message describing your work..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
                disabled={uploadingFiles}
              />
            </div>

            {/* Files and Photos */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Files & Photos (Optional)
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setSubmitWorkFiles(prev => [...prev, ...files]);
                }}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.bmp,.zip,.rar,.txt,.xls,.xlsx,.ppt,.pptx"
                disabled={uploadingFiles}
                style={{ marginBottom: '12px', width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '8px' }}
              />
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', marginBottom: '8px' }}>
                You can upload multiple files and photos (PDF, DOC, images, ZIP, etc.)
              </p>
              {submitWorkFiles.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  {submitWorkFiles.map((file, idx) => {
                    const isImage = file.type.startsWith('image/');
                    const fileSize = (file.size / 1024 / 1024).toFixed(2); // Size in MB
                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '6px',
                        marginBottom: '4px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                          <span style={{ fontSize: '18px' }}>{isImage ? '🖼️' : '📎'}</span>
                          <div>
                            <span style={{ fontSize: '14px', fontWeight: '500' }}>{file.name}</span>
                            <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>
                              ({fileSize} MB)
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSubmitWorkFiles(prev => prev.filter((_, i) => i !== idx))}
                          disabled={uploadingFiles}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: uploadingFiles ? 'not-allowed' : 'pointer',
                            fontSize: '18px',
                            padding: '4px 8px'
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Links */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Links (Optional)
              </label>
              {submitWorkLinks.map((link, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => {
                      const newLinks = [...submitWorkLinks];
                      newLinks[idx] = e.target.value;
                      setSubmitWorkLinks(newLinks);
                    }}
                    placeholder="https://example.com/work"
                    disabled={uploadingFiles}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                  {idx === submitWorkLinks.length - 1 && (
                    <button
                      onClick={() => setSubmitWorkLinks(prev => [...prev, ''])}
                      disabled={uploadingFiles}
                      style={{
                        padding: '10px 16px',
                        backgroundColor: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        cursor: uploadingFiles ? 'not-allowed' : 'pointer'
                      }}
                    >
                      +
                    </button>
                  )}
                  {submitWorkLinks.length > 1 && (
                    <button
                      onClick={() => setSubmitWorkLinks(prev => prev.filter((_, i) => i !== idx))}
                      disabled={uploadingFiles}
                      style={{
                        padding: '10px 16px',
                        backgroundColor: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        cursor: uploadingFiles ? 'not-allowed' : 'pointer',
                        color: '#dc2626'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Submit Button */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSubmitWorkModal(false)}
                disabled={uploadingFiles}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: uploadingFiles ? 'not-allowed' : 'pointer',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitWorkFromModal}
                disabled={uploadingFiles || submittingWork || submittingServiceWork}
                style={{
                  padding: '12px 24px',
                  backgroundColor: uploadingFiles || submittingWork || submittingServiceWork ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: uploadingFiles || submittingWork || submittingServiceWork ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                {uploadingFiles ? 'Uploading...' : submittingWork || submittingServiceWork ? 'Submitting...' : 'Submit Work'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close main content area */}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}


