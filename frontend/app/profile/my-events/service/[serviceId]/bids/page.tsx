"use client";

import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRoleContext } from '../../../../../../components/RoleContext';
import { Footer } from '../../../../../../components/TrustFooter';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import WorkOrderPaymentCheckout from '../../../../../../components/WorkOrderPaymentCheckout';
import ServiceBidPaymentCheckout from '../../../../../../components/ServiceBidPaymentCheckout';
import { getAuthHeaders, getAuthorizationHeader } from '@/lib/auth-utils';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

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

interface Bid {
  id: string;
  bidAmount: number;
  currency: string;
  message: string;
  status: string;
  createdAt: string;
  vendor: {
    id: string;
    businessName: string;
    category: string;
    averageRating: number;
    totalReviews: number;
    profilePicture: string | null;
  };
}

export default function ServiceBidsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAuthenticated } = useRoleContext();
  const serviceId = params?.serviceId as string;
  const eventId = searchParams?.get('eventId');
  
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceTitle, setServiceTitle] = useState('');
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
  const [rejectingBidId, setRejectingBidId] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<Record<string, any>>({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBidForPayment, setSelectedBidForPayment] = useState<{ bidId: string; workOrderId: string; amount: number; vendorName: string } | null>(null);
  const [loadingWorkOrders, setLoadingWorkOrders] = useState(false);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any | null>(null);
  const [workSubmission, setWorkSubmission] = useState<any | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [showBidPaymentModal, setShowBidPaymentModal] = useState(false);
  const [selectedBidForAcceptance, setSelectedBidForAcceptance] = useState<Bid | null>(null);
  const [refundRequested, setRefundRequested] = useState<Record<string, boolean>>({});
  // Local flag so UI can treat a work order as "has had a revision" even if backend revisionCount
  // hasn't propagated yet. This ensures we can flip to "Request Refund" after the first revision cycle.
  // Persisted in sessionStorage so it survives page reloads within the same tab.
  const [localRevisionRequested, setLocalRevisionRequested] = useState<Record<string, boolean>>({});
  const [showRefundProofModal, setShowRefundProofModal] = useState(false);
  const [refundProofText, setRefundProofText] = useState('');
  const [refundProofFiles, setRefundProofFiles] = useState<FileList | null>(null);
  const [submittingRefundProof, setSubmittingRefundProof] = useState(false);

  // Load any persisted revision flags from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.sessionStorage.getItem('evenzs_workorder_revisions');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setLocalRevisionRequested(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load local revision flags from storage', e);
    }
  }, []);

  // Persist localRevisionRequested to sessionStorage whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        'evenzs_workorder_revisions',
        JSON.stringify(localRevisionRequested || {}),
      );
    } catch (e) {
      console.error('Failed to save local revision flags to storage', e);
    }
  }, [localRevisionRequested]);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [selectedWorkOrderForRevision, setSelectedWorkOrderForRevision] = useState<string | null>(null);

  useEffect(() => {
    if (serviceId && eventId) {
      fetchBids();
    }
  }, [serviceId, eventId]);

  // Fetch work orders for accepted bids
  useEffect(() => {
    if (bids.length > 0 && user?.id) {
      fetchWorkOrders();
      
      // Set up periodic refresh to check for work submissions
      const interval = setInterval(() => {
        fetchWorkOrders();
      }, 10000); // Refresh every 10 seconds
      
      return () => clearInterval(interval);
    }
  }, [bids, user?.id]);

  // Fetch work submission when modal opens (always try to get actual submission)
  useEffect(() => {
    if (showWorkModal && selectedWorkOrder && eventId) {
      const fetchSubmission = async () => {
        try {
          // Get vendor ID from work order - endpoint expects vendor table ID, not userId
          let vendorId = selectedWorkOrder.vendorId; // This is the vendor table ID
          
          // If not available, try to get from vendor object
          if (!vendorId && selectedWorkOrder.vendor?.id) {
            vendorId = selectedWorkOrder.vendor.id;
          }
          
          // Also try to get vendor from bid if available
          if (!vendorId && bids.length > 0) {
            const bid = bids.find((b: any) => {
              const wo = workOrders[b.id];
              return wo && wo.id === selectedWorkOrder.id;
            });
            if (bid && bid.vendor && bid.vendor.id) {
              vendorId = bid.vendor.id;
            }
          }

          console.log('🔍 Fetching work submission:', {
            workOrderId: selectedWorkOrder.id,
            vendorId,
            eventId,
            hasVendor: !!selectedWorkOrder.vendor,
            vendorData: selectedWorkOrder.vendor
          });

          // Try to fetch from event messages using vendorId (vendor table ID)
          // Endpoint: GET /events/:eventId/messages?vendorId=...
          if (vendorId) {
            const messagesResponse = await fetch(`${API_BASE}/events/${eventId}/messages?vendorId=${vendorId}`, {
              headers: getAuthHeaders(),
              credentials: 'include'
            });
            
            if (messagesResponse.ok) {
              const messages = await messagesResponse.json();
              console.log('📨 Fetched messages:', messages.length);

              // Use the most recent WORK_SUBMISSION message for this event/vendor
              const workSubmissionMessages = messages.filter(
                (m: any) => m.messageType === 'WORK_SUBMISSION'
              );

              if (workSubmissionMessages.length > 0) {
                const latestSubmission = workSubmissionMessages.sort(
                  (a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )[0];

                console.log('✅ Found latest work submission message:', latestSubmission);
                setWorkSubmission(latestSubmission);
                return;
              } else {
                console.log(
                  '⚠️ No WORK_SUBMISSION message found in',
                  messages.length,
                  'messages'
                );
              }
            } else {
              console.error('❌ Failed to fetch messages:', messagesResponse.status);
            }
          }
          
          // If not found in messages, try to get from work order details
          if (selectedWorkOrder.id) {
            const woResponse = await fetch(`${API_BASE}/work-orders/${selectedWorkOrder.id}`, {
              headers: getAuthHeaders(),
              credentials: 'include'
            });
            if (woResponse.ok) {
              const woData = await woResponse.json();
              console.log('📦 Work order data:', {
                id: woData.id,
                status: woData.status,
                submittedAt: woData.submittedAt
              });
              if (woData.submittedAt) {
                // Work is submitted but no message found - keep existing submission or create placeholder
                if (!workSubmission || !workSubmission.attachments || workSubmission.attachments.length === 0) {
                  setWorkSubmission({
                    message: 'Work has been submitted. Please review.',
                    attachments: []
                  });
                }
                return;
              }
            }
          }
          
          // If we still don't have a submission, set a default
          if (!workSubmission) {
            setWorkSubmission({
              message: 'Work has been submitted. Please review.',
              attachments: []
            });
          }
        } catch (error) {
          console.error('Error fetching work submission in useEffect:', error);
          // Only set if we don't have one already
          if (!workSubmission) {
            setWorkSubmission({
              message: 'Work has been submitted. Please review.',
              attachments: []
            });
          }
        }
      };
      
      fetchSubmission();
    }
  }, [showWorkModal, selectedWorkOrder?.id, eventId]); // Removed workSubmission from dependencies to always fetch

  const fetchWorkOrders = async () => {
    setLoadingWorkOrders(true);
    try {
      const response = await fetch(`${API_BASE}/work-orders/organizer/my-orders`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      
      if (response.ok) {
        const workOrdersData = await response.json();
        // Map work orders by serviceBidId
        const workOrdersMap: Record<string, any> = {};
        workOrdersData.forEach((wo: any) => {
          if (wo.serviceBidId) {
            workOrdersMap[wo.serviceBidId] = wo;
            console.log('📦 Mapped work order:', {
              serviceBidId: wo.serviceBidId,
              workOrderId: wo.id,
              status: wo.status,
              paymentStatus: wo.paymentStatus,
              submittedAt: wo.submittedAt
            });
          }
        });
        console.log('📋 Fetched work orders:', {
          total: workOrdersData.length,
          mapped: Object.keys(workOrdersMap).length,
          workOrdersMap
        });
        setWorkOrders(workOrdersMap);
      }
    } catch (error) {
      console.error('Error fetching work orders:', error);
    } finally {
      setLoadingWorkOrders(false);
    }
  };

  const fetchBids = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/events/${eventId}/services/${serviceId}/bids`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      
      if (response.ok) {
        const bidsData = await response.json();
        setBids(bidsData);
        
        // Fetch service title
        const serviceResponse = await fetch(`${API_BASE}/events/${eventId}/services`, {
          headers: getAuthHeaders(),
          credentials: 'include'
        });
        if (serviceResponse.ok) {
          const services = await serviceResponse.json();
          const service = services.find((s: any) => s.id === serviceId);
          if (service) {
            setServiceTitle(service.title);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching bids:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptBid = async (bidId: string) => {
    const bid = bids.find(b => b.id === bidId);
    if (!bid) return;
    
    // Show payment modal first
    setSelectedBidForAcceptance(bid);
    setShowBidPaymentModal(true);
  };

  const handleBidPaymentSuccess = async (paymentIntentId: string) => {
    if (!selectedBidForAcceptance || !eventId || !serviceId) return;
    
    setShowBidPaymentModal(false);
    setAcceptingBidId(selectedBidForAcceptance.id);
    
    try {
      const acceptPayload = { 
        status: 'ACCEPTED',
        paymentIntentId: paymentIntentId
      };
      console.log('📤 BID ACCEPTANCE FLOW - Sending accept request with payment:', {
        endpoint: `${API_BASE}/events/${eventId}/services/${serviceId}/bids/${selectedBidForAcceptance.id}`,
        paymentIntentId
      });
      
      const response = await fetch(`${API_BASE}/events/${eventId}/services/${serviceId}/bids/${selectedBidForAcceptance.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify(acceptPayload)
      });

      console.log('📥 BID ACCEPTANCE FLOW - Response status:', response.status);

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        console.log('✅ BID ACCEPTANCE FLOW - Bid accepted successfully with payment:', {
          bidId: selectedBidForAcceptance.id,
          result,
          workOrderShouldBeCreated: true
        });
        
        // Refresh bids to get updated statuses (including auto-rejected ones)
        console.log('🔄 BID ACCEPTANCE FLOW - Refreshing bids...');
        await fetchBids();
        
        // Fetch work orders after accepting bid
        console.log('🔄 BID ACCEPTANCE FLOW - Scheduling work order fetch (1s delay)...');
        setTimeout(() => {
          console.log('🔄 BID ACCEPTANCE FLOW - Fetching work orders (1s delay)...');
          fetchWorkOrders();
        }, 1000);
        
        // Also refresh work orders after a delay to ensure work order is created
        console.log('🔄 BID ACCEPTANCE FLOW - Scheduling work order fetch (3s delay)...');
        setTimeout(() => {
          console.log('🔄 BID ACCEPTANCE FLOW - Fetching work orders (3s delay)...');
          fetchWorkOrders();
        }, 3000);
        
        console.log('✅ BID ACCEPTANCE FLOW - Bid acceptance flow completed');
        setNotification({ 
          message: 'Bid accepted successfully! Payment authorized. The vendor has been notified and can start work.', 
          type: 'success' 
        });
        setTimeout(() => setNotification(null), 4000);
      } else {
        const errorText = await response.text();
        console.error('❌ BID ACCEPTANCE FLOW - Failed to accept bid:', {
          status: response.status,
          error: errorText
        });
        setNotification({ 
          message: `Failed to accept bid: ${errorText || 'Please try again.'}`, 
          type: 'error' 
        });
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (error) {
      console.error('❌ BID ACCEPTANCE FLOW - Error accepting bid:', error);
      setNotification({ 
        message: 'Error accepting bid. Please try again.', 
        type: 'error' 
      });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setAcceptingBidId(null);
      setSelectedBidForAcceptance(null);
      console.log('✅ BID ACCEPTANCE FLOW - Cleanup completed');
    }
  };

  // Handle revision request submission
  const handleSubmitRevision = async () => {
    if (!selectedWorkOrderForRevision) return;
    
    try {
      const response = await fetch(`${API_BASE}/work-orders/${selectedWorkOrderForRevision}/request-revision`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ revisionNotes: revisionNotes.trim() || undefined })
      });
      
      if (response.ok) {
        setNotification({ 
          message: 'Revision requested successfully!', 
          type: 'success' 
        });
        // Mark this work order as having at least one revision requested in this session
        setLocalRevisionRequested(prev => ({
          ...prev,
          [selectedWorkOrderForRevision]: true,
        }));
        setTimeout(() => setNotification(null), 4000);
        setShowRevisionModal(false);
        setRevisionNotes('');
        setSelectedWorkOrderForRevision(null);
        setShowWorkModal(false);
        await fetchWorkOrders();
      } else {
        const errorText = await response.text();
        setNotification({ 
          message: `Failed to request revision: ${errorText || 'Please try again.'}`, 
          type: 'error' 
        });
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (error) {
      console.error('Error requesting revision:', error);
      setNotification({ 
        message: 'Error requesting revision. Please try again.', 
        type: 'error' 
      });
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Submit additional refund proofs (service-bid flow)
  const handleSubmitRefundProof = async (workOrderId: string) => {
    if (!refundProofText.trim() && (!refundProofFiles || refundProofFiles.length === 0)) {
      alert('Please add some details or at least one file as proof.');
      return;
    }
    try {
      setSubmittingRefundProof(true);

      const attachmentUrls: string[] = [];
      if (refundProofFiles && refundProofFiles.length > 0) {
        for (let i = 0; i < refundProofFiles.length; i++) {
          const file = refundProofFiles[i];
          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await fetch(`${API_BASE}/uploads`, {
            method: 'POST',
            headers: getAuthorizationHeader(),
            credentials: 'include',
            body: formData,
          });
          if (!uploadRes.ok) {
            const data = await uploadRes.json().catch(() => ({}));
            alert(data.message || 'Failed to upload proof file');
            return;
          }
          const uploadJson = await uploadRes.json();
          if (uploadJson?.url) {
            attachmentUrls.push(uploadJson.url);
          }
        }
      }

      const res = await fetch(`${API_BASE}/work-orders/${workOrderId}/refund-proof`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ message: refundProofText.trim(), attachments: attachmentUrls }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to submit proofs');
        return;
      }
      alert('Proofs submitted successfully.');
      setShowRefundProofModal(false);
      setRefundProofText('');
      setRefundProofFiles(null);
    } catch (error) {
      console.error('Error submitting refund proofs:', error);
      alert('Error submitting proofs. Please try again.');
    } finally {
      setSubmittingRefundProof(false);
    }
  };

  const handleRejectBid = async (bidId: string) => {
    if (!confirm('Are you sure you want to reject this bid? The vendor will be notified.')) {
      return;
    }

    setRejectingBidId(bidId);
    try {
      const response = await fetch(`${API_BASE}/events/${eventId}/services/${serviceId}/bids/${bidId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          status: 'REJECTED'
        })
      });

      if (response.ok) {
        // Refresh bids to get updated status
        await fetchBids();
        alert('Bid rejected. The vendor has been notified.');
      } else {
        const errorText = await response.text();
        alert(`Failed to reject bid: ${errorText || 'Please try again.'}`);
      }
    } catch (error) {
      console.error('Error rejecting bid:', error);
      alert('Error rejecting bid. Please try again.');
    } finally {
      setRejectingBidId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading bids...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
        `
      }} />
      {/* Professional Notification Toast */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            animation: 'slideInRight 0.3s ease-out',
          }}
        >
          <div
            style={{
              backgroundColor: notification.type === 'success' ? '#10b981' : '#ef4444',
              color: 'white',
              padding: '16px 24px',
              borderRadius: '12px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              minWidth: '320px',
              maxWidth: '450px',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {notification.type === 'success' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '15px' }}>
                {notification.type === 'success' ? 'Success!' : 'Error!'}
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', opacity: 0.95, lineHeight: '1.4' }}>
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.8,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.push('/profile/my-events?tab=services')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19L5 12L12 5" />
            </svg>
            Back to My Services
          </button>
          <h1 
            className="text-3xl font-bold text-gray-900"
            style={{ fontFamily: 'Raleway, sans-serif' }}
          >
            Bids for {serviceTitle || 'Service'}
          </h1>
          <p 
            className="text-gray-600 mt-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Review, accept, or reject bids from vendors
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {bids.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 
              className="text-xl font-semibold text-gray-900 mb-2"
              style={{ fontFamily: 'Raleway, sans-serif' }}
            >
              No bids yet
            </h3>
            <p 
              className="text-gray-600"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Vendors haven't submitted any bids for this service yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bids.map((bid) => (
              <div
                key={bid.id}
                className="bg-white rounded border border-gray-200 p-5"
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 
                        className="text-base font-medium text-gray-900"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {bid.vendor.businessName}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        bid.status === 'ACCEPTED' 
                          ? 'bg-gray-100 text-gray-700' 
                          : bid.status === 'REJECTED'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {bid.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mb-2 text-sm text-gray-600">
                      <span>{bid.vendor.category}</span>
                      {bid.vendor.averageRating && parseFloat(String(bid.vendor.averageRating)) > 0 && (
                        <span>
                          {parseFloat(String(bid.vendor.averageRating)).toFixed(1)} ({bid.vendor.totalReviews || 0})
                        </span>
                      )}
                    </div>
                    {bid.message && (
                      <p 
                        className="text-sm text-gray-700 mb-2"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {bid.message}
                      </p>
                    )}
                    <div className="text-xs text-gray-500">
                      Submitted: {new Date(bid.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="text-right min-w-[120px]">
                    <div 
                      className="text-xl font-semibold text-gray-900 mb-1"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {bid.currency || 'USD'} {parseFloat(bid.bidAmount.toString()).toFixed(2)}
                    </div>
                    {(bid.status === 'PENDING' || bid.status === 'UNDER_REVIEW') && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleAcceptBid(bid.id)}
                          disabled={acceptingBidId === bid.id || rejectingBidId === bid.id}
                          className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {acceptingBidId === bid.id ? 'Accepting...' : 'Accept'}
                        </button>
                        <button
                          onClick={() => handleRejectBid(bid.id)}
                          disabled={rejectingBidId === bid.id || acceptingBidId === bid.id}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {rejectingBidId === bid.id ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    )}
                    {bid.status === 'ACCEPTED' && (() => {
                      const workOrder = workOrders[bid.id];
                      const paymentStatus = workOrder?.paymentStatus;
                      const workStatus = workOrder?.status;
                      const hasSubmittedWork = workStatus === 'SUBMITTED' || workStatus === 'REVISION_REQUESTED' || (workOrder && workOrder.submittedAt);
                      
                      // Debug logging
                      console.log('🔍 BID STATUS CHECK - Checking bid status:', {
                        bidId: bid.id,
                        bidStatus: bid.status,
                        hasWorkOrder: !!workOrder,
                        workOrderId: workOrder?.id,
                        workOrderStatus: workOrder?.status,
                        paymentStatus,
                        paymentIntentId: workOrder?.paymentIntentId,
                        workStatus,
                        submittedAt: workOrder?.submittedAt,
                        completedAt: workOrder?.completedAt,
                        hasSubmittedWork,
                        allWorkOrderKeys: Object.keys(workOrders),
                        workOrderFull: workOrder
                      });
                      
                      return (
                        <div className="mt-3 space-y-2">
                          {/* If work is submitted, show View Work button regardless of payment status check */}
                          {hasSubmittedWork ? (
                            <button
                              onClick={async () => {
                                // If work order not in map, try to fetch it
                                let currentWorkOrder = workOrder;
                                if (!currentWorkOrder) {
                                  try {
                                    const response = await fetch(`${API_BASE}/work-orders/organizer/my-orders`, {
                                      headers: getAuthHeaders(),
                                      credentials: 'include'
                                    });
                                    if (response.ok) {
                                      const workOrdersData = await response.json();
                                      currentWorkOrder = workOrdersData.find((wo: any) => wo.serviceBidId === bid.id);
                                      if (currentWorkOrder) {
                                        // Update the map with the latest work order snapshot
                                        setWorkOrders((prev: any) => ({ ...prev, [bid.id]: currentWorkOrder }));
                                      }
                                    }
                                  } catch (error) {
                                    console.error('Error fetching work order:', error);
                                  }
                                }
                                
                                if (!currentWorkOrder) {
                                  alert('Work order not found. Please refresh the page.');
                                  return;
                                }
                                
                                // Always try to refresh the work order from backend to get latest status / revisionCount
                                try {
                                  if (currentWorkOrder.id) {
                                    const woResponse = await fetch(`${API_BASE}/work-orders/${currentWorkOrder.id}`, {
                                      headers: getAuthHeaders(),
                                      credentials: 'include'
                                    });
                                    if (woResponse.ok) {
                                      const woData = await woResponse.json();
                                      // Use the freshest work order data everywhere
                                      currentWorkOrder = woData;
                                      setWorkOrders((prev: any) => ({ ...prev, [bid.id]: woData }));
                                      setSelectedWorkOrder(woData);
                                      
                                      // Work order might have submission info
                                      if (woData.submittedAt) {
                                        // Try to fetch messages
                                        const messagesResponse = await fetch(`${API_BASE}/events/${eventId}/messages/${bid.vendor.id}`, {
                                          headers: getAuthHeaders(),
                                          credentials: 'include'
                                        });
                                        if (messagesResponse.ok) {
                                          const messages = await messagesResponse.json();
                                          const workSubmissionMessages = messages.filter(
                                            (m: any) => m.messageType === 'WORK_SUBMISSION'
                                          );
                                          const latestSubmission =
                                            workSubmissionMessages.length > 0
                                              ? workSubmissionMessages.sort(
                                                  (a: any, b: any) =>
                                                    new Date(b.createdAt).getTime() -
                                                    new Date(a.createdAt).getTime()
                                                )[0]
                                              : null;

                                          if (latestSubmission) {
                                            setWorkSubmission(latestSubmission);
                                          } else {
                                            // If no message found, create a placeholder from work order
                                            setWorkSubmission({
                                              message:
                                                'Work has been submitted. Please review the attachments.',
                                              attachments: []
                                            });
                                          }
                                        }
                                      }
                                    } else {
                                      // If detail fetch fails, still use the existing snapshot
                                      setSelectedWorkOrder(currentWorkOrder);
                                    }
                                  } else {
                                    setSelectedWorkOrder(currentWorkOrder);
                                  }
                                  
                                  // Also try fetching from chat messages as fallback (endpoint expects vendorId as query param)
                                  const messagesResponse = await fetch(
                                    `${API_BASE}/events/${eventId}/messages?vendorId=${bid.vendor.id}`,
                                    {
                                      headers: getAuthHeaders(),
                                      credentials: 'include'
                                    }
                                  );
                                  if (messagesResponse.ok) {
                                    const messages = await messagesResponse.json();
                                    const workSubmissionMessages = messages.filter(
                                      (m: any) => m.messageType === 'WORK_SUBMISSION'
                                    );
                                    const latestSubmission =
                                      workSubmissionMessages.length > 0
                                        ? workSubmissionMessages.sort(
                                            (a: any, b: any) =>
                                              new Date(b.createdAt).getTime() -
                                              new Date(a.createdAt).getTime()
                                          )[0]
                                        : null;

                                    if (latestSubmission) {
                                      setWorkSubmission(latestSubmission);
                                    }
                                  }
                                } catch (error) {
                                  console.error('Error fetching work submission:', error);
                                }
                                
                                // Always set a default work submission so modal can show immediately
                                // The useEffect will fetch the actual submission when modal opens
                                setWorkSubmission({
                                  message: 'Work has been submitted. Please review.',
                                  attachments: []
                                });
                                
                                setShowWorkModal(true);
                              }}
                              className="w-full px-4 py-2 text-white rounded text-sm font-medium transition-colors"
                              style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#0B1A33' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0d1f3d'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0B1A33'}
                            >
                              👁️ View Work
                            </button>
                          ) : workOrder?.paymentIntentId && paymentStatus === 'PENDING' ? (
                            // Payment has been authorized (held in escrow) - show "Paid" status
                            <div className="space-y-2">
                              <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded text-xs font-medium text-center border border-green-200">
                                💰 Paid (Held in Escrow)
                              </div>
                              {workOrder.paymentIntentId && (
                                <div className="text-xs text-gray-500 text-center">
                                  ID: {workOrder.paymentIntentId.substring(0, 20)}...
                                </div>
                              )}
                            </div>
                          ) : !workOrder?.paymentIntentId || !paymentStatus ? (
                            // Payment not authorized yet - show Pay Vendor button
                            <button
                              onClick={() => {
                                console.log('💰 PAYMENT FLOW - Opening payment modal:', {
                                  bidId: bid.id,
                                  workOrderId: workOrder?.id,
                                  workOrderStatus: workOrder?.status,
                                  paymentStatus: workOrder?.paymentStatus,
                                  amount: parseFloat(bid.bidAmount.toString()),
                                  vendorName: bid.vendor.businessName,
                                  hasWorkOrder: !!workOrder
                                });
                                
                                if (workOrder) {
                                  const paymentData = {
                                    bidId: bid.id,
                                    workOrderId: workOrder.id,
                                    amount: parseFloat(bid.bidAmount.toString()),
                                    vendorName: bid.vendor.businessName
                                  };
                                  console.log('💰 PAYMENT FLOW - Setting payment data:', paymentData);
                                  setSelectedBidForPayment(paymentData);
                                  setShowPaymentModal(true);
                                  console.log('✅ PAYMENT FLOW - Payment modal opened');
                                } else {
                                  console.error('❌ PAYMENT FLOW - Work order not found:', {
                                    bidId: bid.id,
                                    workOrderExists: !!workOrder,
                                    allWorkOrderKeys: Object.keys(workOrders)
                                  });
                                  alert('Work order not found. Please refresh the page.');
                                }
                              }}
                              className="w-full px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
                              style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                              💳 Pay Vendor
                            </button>
                          ) : paymentStatus === 'COMPLETED' && workOrder?.status === 'COMPLETED' ? (
                            <div className="space-y-2">
                              <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded text-xs font-medium text-center border border-green-200">
                                💰 Payment Completed
                              </div>
                              {workOrder?.paymentIntentId && (
                                <div className="text-xs text-gray-500 text-center">
                                  ID: {workOrder.paymentIntentId.substring(0, 20)}...
                      </div>
                    )}
                              {/* Show View Work button if work is submitted OR if work order exists and has submittedAt */}
                              {/* Also try to fetch work order directly if not found in map */}
                              {(workStatus === 'SUBMITTED' || workStatus === 'REVISION_REQUESTED' || (workOrder && workOrder.submittedAt)) ? (
                                <button
                                  onClick={async () => {
                                    setSelectedWorkOrder(workOrder);
                                    // Fetch work submission message from work order or chat messages
                                    try {
                                      // First try to get from work order directly
                                      if (workOrder.id) {
                                      const woResponse = await fetch(`${API_BASE}/work-orders/${workOrder.id}`, {
                                        headers: getAuthHeaders(),
                                        credentials: 'include'
                                      });
                                        if (woResponse.ok) {
                                          const woData = await woResponse.json();
                                          // Work order might have submission info
                                          if (woData.submittedAt) {
                                            // Try to fetch messages
                                            const messagesResponse = await fetch(`${API_BASE}/events/${eventId}/messages/${bid.vendor.id}`, {
                                              headers: getAuthHeaders(),
                                              credentials: 'include'
                                            });
                                            if (messagesResponse.ok) {
                                              const messages = await messagesResponse.json();
                                              const workSubmissionMsg = messages.find((m: any) => m.messageType === 'WORK_SUBMISSION');
                                              if (workSubmissionMsg) {
                                                setWorkSubmission(workSubmissionMsg);
                                              } else {
                                                // If no message found, create a placeholder from work order
                                                setWorkSubmission({
                                                  message: 'Work has been submitted. Please review the attachments.',
                                                  attachments: []
                                                });
                                              }
                                            }
                                          }
                                        }
                                      }
                                      
                                      // Also try fetching from chat messages as fallback (endpoint expects vendorId as query param)
                                      const messagesResponse = await fetch(`${API_BASE}/events/${eventId}/messages?vendorId=${bid.vendor.id}`, {
                                        headers: getAuthHeaders(),
                                        credentials: 'include'
                                      });
                                      if (messagesResponse.ok) {
                                        const messages = await messagesResponse.json();
                                        const workSubmissionMsg = messages.find((m: any) => m.messageType === 'WORK_SUBMISSION');
                                        if (workSubmissionMsg) {
                                          setWorkSubmission(workSubmissionMsg);
                                        }
                                      }
                                    } catch (error) {
                                      console.error('Error fetching work submission:', error);
                                    }
                                    
                                    // Always set a default work submission so modal can show immediately
                                    // The useEffect will fetch the actual submission when modal opens
                                    setWorkSubmission({
                                      message: 'Work has been submitted. Please review.',
                                      attachments: []
                                    });
                                    
                                    setShowWorkModal(true);
                                  }}
                                  className="w-full px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                                  style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                  👁️ View Work
                                </button>
                              ) : workStatus === 'IN_PROGRESS' || !workStatus ? (
                                <div className="text-xs text-gray-500 text-center">
                                  Waiting for vendor to submit work...
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                    {bid.status === 'REJECTED' && (
                      <div className="mt-3 px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm font-medium text-center">
                        Rejected
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* View Work Modal */}
      {showWorkModal && selectedWorkOrder && (
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
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => {
            setShowWorkModal(false);
            setSelectedWorkOrder(null);
            setWorkSubmission(null);
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                <h2 style={{ fontSize: '24px', fontWeight: '600', margin: 0, fontFamily: 'Raleway, sans-serif' }}>
                  📦 Submitted Work
                </h2>
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: '#6b7280',
                    fontFamily: 'Inter, sans-serif',
                    maxWidth: '460px',
                  }}
                >
                  If you don&apos;t accept this work, request a revision, or request a refund
                  within 7 days, the work will be automatically accepted and the vendor will
                  be paid.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowWorkModal(false);
                  setSelectedWorkOrder(null);
                  setWorkSubmission(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                ×
              </button>
            </div>

            {workSubmission ? (
              <div>
                <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #10b981' }}>
                  <p style={{ margin: '0 0 12px 0', fontFamily: 'Inter, sans-serif' }}>{workSubmission.message || 'Work has been submitted. Please review.'}</p>
                  {workSubmission.attachments && workSubmission.attachments.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        marginBottom: '12px',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="17 8 12 3 7 8"></polyline>
                          <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        <strong style={{ fontSize: '15px', fontWeight: '600', color: '#374151' }}>
                          Attachments ({workSubmission.attachments.length})
                        </strong>
                      </div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                        gap: '16px' 
                      }}>
                        {workSubmission.attachments.map((attachment: string, i: number) => {
                          const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(attachment);
                          const isPdf = /\.pdf$/i.test(attachment);
                          const fileName = attachment.split('/').pop() || attachment;
                          return (
                            <div 
                              key={i} 
                              style={{
                              border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                              overflow: 'hidden',
                                backgroundColor: '#ffffff',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                                transition: 'all 0.2s ease',
                                cursor: isImage ? 'pointer' : 'default'
                              }}
                              onMouseEnter={(e) => {
                                if (isImage) {
                                  e.currentTarget.style.boxShadow = '0 4px 12px 0 rgba(0, 0, 0, 0.15)';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (isImage) {
                                  e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }
                              }}
                            >
                              {isImage ? (
                                <div style={{ position: 'relative' }}>
                                  <img
                                    src={attachment}
                                    alt={fileName}
                                    style={{
                                      width: '100%',
                                      height: '200px',
                                      objectFit: 'cover',
                                      display: 'block'
                                    }}
                                    onClick={() => window.open(attachment, '_blank')}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                      (e.target as HTMLImageElement).parentElement!.innerHTML = `
                                        <div style="padding: 24px; text-align: center; color: #6b7280;">
                                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin: 0 auto 8px;">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                            <polyline points="21 15 16 10 5 21"></polyline>
                                          </svg>
                                          <p style="margin: 0; font-size: 12px;">Image failed to load</p>
                                        </div>
                                      `;
                                    }}
                                  />
                                  <div style={{ 
                                    position: 'absolute', 
                                    top: '8px', 
                                    right: '8px', 
                                    backgroundColor: 'rgba(0, 0, 0, 0.6)', 
                                    color: 'white', 
                                    padding: '4px 8px', 
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontFamily: 'Inter, sans-serif',
                                    fontWeight: '500'
                                  }}>
                                    📷 Image
                                  </div>
                                  <div style={{ 
                                    padding: '12px', 
                                    fontSize: '13px', 
                                    color: '#374151', 
                                    textAlign: 'center',
                                    fontFamily: 'Inter, sans-serif',
                                    fontWeight: '500',
                                    borderTop: '1px solid #f3f4f6',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {fileName}
                                  </div>
                                </div>
                              ) : isPdf ? (
                                <div style={{ display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
                                  <div style={{ 
                                    padding: '12px 16px', 
                                    backgroundColor: '#f9fafb',
                                    borderBottom: '1px solid #e5e7eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px'
                                  }}>
                                    <div style={{
                                      width: '40px',
                                      height: '40px',
                                      backgroundColor: '#fee2e2',
                                      borderRadius: '8px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center'
                                    }}>
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#dc2626">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                        <line x1="16" y1="13" x2="8" y2="13"></line>
                                        <line x1="16" y1="17" x2="8" y2="17"></line>
                                        <polyline points="10 9 9 9 8 9"></polyline>
                                      </svg>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ 
                                        fontSize: '13px', 
                                        fontWeight: '600',
                                        color: '#111827',
                                        fontFamily: 'Inter, sans-serif',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {fileName}
                                      </div>
                                      <div style={{ 
                                        fontSize: '11px', 
                                        color: '#6b7280',
                                        fontFamily: 'Inter, sans-serif',
                                        marginTop: '2px'
                                      }}>
                                        PDF Document
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ 
                                    flex: 1, 
                                    backgroundColor: '#f9fafb',
                                    position: 'relative',
                                    minHeight: '400px'
                                  }}>
                                    <iframe
                                      src={attachment}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        minHeight: '400px',
                                        border: 'none',
                                        display: 'block'
                                      }}
                                      title={fileName}
                                    />
                                  </div>
                                  <div style={{ 
                                    padding: '10px 16px', 
                                    textAlign: 'center', 
                                    borderTop: '1px solid #e5e7eb',
                                    backgroundColor: '#ffffff'
                                  }}>
                                    <a
                                      href={attachment}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: '#2563eb',
                                        textDecoration: 'none',
                                        fontSize: '13px',
                                        fontFamily: 'Inter, sans-serif',
                                        fontWeight: '500',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        transition: 'background-color 0.2s'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#eff6ff';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                      }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                        <polyline points="15 3 21 3 21 9"></polyline>
                                        <line x1="10" y1="14" x2="21" y2="3"></line>
                                      </svg>
                                      Open in new tab
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <a
                                  href={attachment}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '16px',
                                    color: '#374151',
                                    textDecoration: 'none',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '14px',
                                    transition: 'background-color 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f9fafb';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#ffffff';
                                  }}
                                >
                                  <div style={{
                                    width: '40px',
                                    height: '40px',
                                    backgroundColor: '#f3f4f6',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                      <polyline points="17 8 12 3 7 8"></polyline>
                                      <line x1="12" y1="3" x2="12" y2="15"></line>
                                    </svg>
                                  </div>
                                  <span style={{ 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis', 
                                    whiteSpace: 'nowrap',
                                    fontWeight: '500'
                                  }}>
                                    {fileName}
                                  </span>
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Refund Status Messages */}
                {selectedWorkOrder.refundStatus === 'REFUNDED' && (
                  <div style={{ 
                    marginBottom: '16px', 
                    padding: '16px', 
                    backgroundColor: '#f0fdf4', 
                    borderRadius: '8px', 
                    border: '2px solid #10b981' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '20px' }}>✅</span>
                      <strong style={{ fontSize: '16px', color: '#065f46' }}>Refund Approved</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#047857' }}>
                      Your refund request has been approved. Payment has been refunded to your account.
                    </p>
                    {selectedWorkOrder.refundResolvedAt && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                        Resolved on: {new Date(selectedWorkOrder.refundResolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                {selectedWorkOrder.refundStatus === 'REJECTED' && (
                  <div style={{ 
                    marginBottom: '16px', 
                    padding: '16px', 
                    backgroundColor: '#fef2f2', 
                    borderRadius: '8px', 
                    border: '2px solid #ef4444' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '20px' }}>❌</span>
                      <strong style={{ fontSize: '16px', color: '#991b1b' }}>Refund Rejected</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#dc2626' }}>
                      Your refund request has been rejected. The payment will remain with the vendor.
                    </p>
                    {selectedWorkOrder.refundResolvedAt && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                        Resolved on: {new Date(selectedWorkOrder.refundResolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                {selectedWorkOrder.refundStatus === 'REQUESTED' && (
                  <div style={{ 
                    marginBottom: '16px', 
                    padding: '12px', 
                    backgroundColor: '#fffbeb', 
                    borderRadius: '8px', 
                    border: '1px solid #f59e0b' 
                  }}>
                    <p style={{ margin: 0, fontSize: '14px', color: '#92400e' }}>
                      ⏳ Your refund request is under review by admin.
                    </p>
                  </div>
                )}

                {selectedWorkOrder.status === 'SUBMITTED' && selectedWorkOrder.refundStatus !== 'REFUNDED' && selectedWorkOrder.refundStatus !== 'REJECTED' && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                    {(!selectedWorkOrder.refundStatus || selectedWorkOrder.refundStatus === 'NONE') && (
                      <button
                        onClick={() => {
                          setShowRatingModal(true);
                        }}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        ✅ Accept Work
                      </button>
                    )}
                    {selectedWorkOrder.refundStatus === 'NEED_MORE_INFO' ? (
                      <button
                        onClick={() => setShowRefundProofModal(true)}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        Add Proofs
                      </button>
                    ) : (selectedWorkOrder.revisionCount > 0 || localRevisionRequested[selectedWorkOrder.id]) && 
                        selectedWorkOrder.refundStatus !== 'REFUNDED' && 
                        selectedWorkOrder.refundStatus !== 'REJECTED' && 
                        selectedWorkOrder.refundStatus !== 'APPROVED' ? (
                      <button
                        onClick={async () => {
                          try {
                            const backendUrl =
                              process.env.NEXT_PUBLIC_BACKEND_URL ||
                              (typeof window !== 'undefined' && window.location.hostname === 'localhost'
                                ? 'http://localhost:3002'
                                : `${window.location.origin}/api`);
                            const res = await fetch(
                              `${backendUrl}/work-orders/${selectedWorkOrder.id}/request-refund`,
                              {
                                method: 'POST',
                                headers: getAuthHeaders(),
                                credentials: 'include',
                              },
                            );
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              alert(data.message || 'Failed to request refund');
                              return;
                            }
                            alert('Your request for refund has been sent to the admin panel.');
                            setRefundRequested(prev => ({ ...prev, [selectedWorkOrder.id]: true }));
                          } catch (err) {
                            console.error('Error requesting refund:', err);
                            alert('Error requesting refund. Please try again.');
                          }
                        }}
                        disabled={refundRequested[selectedWorkOrder.id] || selectedWorkOrder.refundStatus === 'REQUESTED'}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: (refundRequested[selectedWorkOrder.id] || selectedWorkOrder.refundStatus === 'REQUESTED') ? '#9ca3af' : '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: (refundRequested[selectedWorkOrder.id] || selectedWorkOrder.refundStatus === 'REQUESTED') ? 'not-allowed' : 'pointer',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        {(refundRequested[selectedWorkOrder.id] || selectedWorkOrder.refundStatus === 'REQUESTED') ? '✓ Requested' : '💰 Request Refund'}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedWorkOrderForRevision(selectedWorkOrder.id);
                          setRevisionNotes('');
                          setShowRevisionModal(true);
                        }}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        🔁 Request Revision
                      </button>
                    )}
                  </div>
                )}
                {(selectedWorkOrder.status === 'COMPLETED' || selectedWorkOrder.status === 'CANCELLED') && (
                  <div style={{ marginTop: '20px' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>
                      {selectedWorkOrder.status === 'CANCELLED' 
                        ? 'This work order has been cancelled due to refund.'
                        : 'This work has already been accepted. You can view the final submission here for your records.'}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #10b981' }}>
                  <p style={{ margin: '0 0 12px 0', fontFamily: 'Inter, sans-serif' }}>
                    Work has been submitted. Fetching details...
                  </p>
                  {selectedWorkOrder?.submittedAt && (
                    <p style={{ margin: '8px 0', fontSize: '12px', color: '#6b7280', fontFamily: 'Inter, sans-serif' }}>
                      Submitted on: {new Date(selectedWorkOrder.submittedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                {/* Refund Status Messages (for loading state) */}
                {selectedWorkOrder && selectedWorkOrder.refundStatus === 'REFUNDED' && (
                  <div style={{ 
                    marginBottom: '16px', 
                    padding: '16px', 
                    backgroundColor: '#f0fdf4', 
                    borderRadius: '8px', 
                    border: '2px solid #10b981' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '20px' }}>✅</span>
                      <strong style={{ fontSize: '16px', color: '#065f46' }}>Refund Approved</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#047857' }}>
                      Your refund request has been approved. Payment has been refunded to your account.
                    </p>
                    {selectedWorkOrder.refundResolvedAt && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                        Resolved on: {new Date(selectedWorkOrder.refundResolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                {selectedWorkOrder && selectedWorkOrder.refundStatus === 'REJECTED' && (
                  <div style={{ 
                    marginBottom: '16px', 
                    padding: '16px', 
                    backgroundColor: '#fef2f2', 
                    borderRadius: '8px', 
                    border: '2px solid #ef4444' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '20px' }}>❌</span>
                      <strong style={{ fontSize: '16px', color: '#991b1b' }}>Refund Rejected</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#dc2626' }}>
                      Your refund request has been rejected. The payment will remain with the vendor.
                    </p>
                    {selectedWorkOrder.refundResolvedAt && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                        Resolved on: {new Date(selectedWorkOrder.refundResolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                {selectedWorkOrder && selectedWorkOrder.refundStatus === 'REQUESTED' && (
                  <div style={{ 
                    marginBottom: '16px', 
                    padding: '12px', 
                    backgroundColor: '#fffbeb', 
                    borderRadius: '8px', 
                    border: '1px solid #f59e0b' 
                  }}>
                    <p style={{ margin: 0, fontSize: '14px', color: '#92400e' }}>
                      ⏳ Your refund request is under review by admin.
                    </p>
                  </div>
                )}

                {selectedWorkOrder && selectedWorkOrder.status === 'SUBMITTED' && selectedWorkOrder.refundStatus !== 'REFUNDED' && selectedWorkOrder.refundStatus !== 'REJECTED' && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                    {(!selectedWorkOrder.refundStatus || selectedWorkOrder.refundStatus === 'NONE') && (
                      <button
                        onClick={() => {
                          setShowRatingModal(true);
                        }}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif'
                        }}
                      >
                        ✅ Accept Work
                      </button>
                    )}
                    {(selectedWorkOrder.revisionCount > 0 || localRevisionRequested[selectedWorkOrder.id]) && 
                     selectedWorkOrder.refundStatus !== 'REFUNDED' && 
                     selectedWorkOrder.refundStatus !== 'REJECTED' && 
                     selectedWorkOrder.refundStatus !== 'APPROVED' ? (
                      <button
                        onClick={async () => {
                          try {
                            const backendUrl =
                              process.env.NEXT_PUBLIC_BACKEND_URL ||
                              (typeof window !== 'undefined' && window.location.hostname === 'localhost'
                                ? 'http://localhost:3002'
                                : `${window.location.origin}/api`);
                            const res = await fetch(
                              `${backendUrl}/work-orders/${selectedWorkOrder.id}/request-refund`,
                              {
                                method: 'POST',
                                credentials: 'include',
                              },
                            );
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              alert(data.message || 'Failed to request refund');
                              return;
                            }
                            alert('Your request for refund has been sent to the admin panel.');
                            setRefundRequested(prev => ({ ...prev, [selectedWorkOrder.id]: true }));
                          } catch (err) {
                            console.error('Error requesting refund:', err);
                            alert('Error requesting refund. Please try again.');
                          }
                        }}
                        disabled={refundRequested[selectedWorkOrder.id] || selectedWorkOrder.refundStatus === 'REQUESTED'}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: (refundRequested[selectedWorkOrder.id] || selectedWorkOrder.refundStatus === 'REQUESTED') ? '#9ca3af' : '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: (refundRequested[selectedWorkOrder.id] || selectedWorkOrder.refundStatus === 'REQUESTED') ? 'not-allowed' : 'pointer',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        {(refundRequested[selectedWorkOrder.id] || selectedWorkOrder.refundStatus === 'REQUESTED') ? '✓ Requested' : '💰 Request Refund'}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedWorkOrderForRevision(selectedWorkOrder.id);
                          setRevisionNotes('');
                          setShowRevisionModal(true);
                        }}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        🔁 Request Revision
                      </button>
                    )}
                  </div>
                )}
                {selectedWorkOrder && selectedWorkOrder.status === 'COMPLETED' && (
                  <div style={{ marginTop: '20px' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>
                      This work has already been accepted. You can view the final submission here for your records.
                    </div>
                    <button
                      onClick={() => {
                        alert('Your request for refund is sent to admin panel');
                        setRefundRequested(prev => ({ ...prev, [selectedWorkOrder.id]: true }));
                      }}
                      disabled={refundRequested[selectedWorkOrder.id]}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: refundRequested[selectedWorkOrder.id] ? '#9ca3af' : '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: refundRequested[selectedWorkOrder.id] ? 'not-allowed' : 'pointer',
                        fontFamily: 'Inter, sans-serif'
                      }}
                    >
                      {refundRequested[selectedWorkOrder.id] ? '✓ Requested' : '💰 Request Refund'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && selectedWorkOrder && (
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
            zIndex: 1001,
            padding: '20px'
          }}
          onClick={() => {
            setShowRatingModal(false);
            setRating(0);
            setReviewText('');
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', fontFamily: 'Raleway, sans-serif' }}>
              Rate & Review Work
            </h3>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontFamily: 'Inter, sans-serif', fontWeight: '500' }}>
                Rating (1-5 stars) *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    style={{
                      fontSize: '32px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: star <= rating ? '#fbbf24' : '#d1d5db'
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontFamily: 'Inter, sans-serif', fontWeight: '500' }}>
                Review (Optional)
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontFamily: 'Inter, sans-serif',
                  minHeight: '100px'
                }}
                placeholder="Share your experience..."
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowRatingModal(false);
                  setRating(0);
                  setReviewText('');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (rating < 1 || rating > 5) {
                    alert('Please select a rating (1-5 stars)');
                    return;
                  }
                  console.log('✅ WORK ACCEPTANCE FLOW - Starting work acceptance:', {
                    workOrderId: selectedWorkOrder.id,
                    workOrderStatus: selectedWorkOrder.status,
                    paymentStatus: selectedWorkOrder.paymentStatus,
                    paymentIntentId: selectedWorkOrder.paymentIntentId,
                    rating,
                    hasReview: !!reviewText.trim()
                  });
                  
                  setSubmittingRating(true);
                  try {
                    const acceptPayload = {
                      rating,
                      review: reviewText.trim() || undefined
                    };
                    console.log('📤 WORK ACCEPTANCE FLOW - Sending accept request:', {
                      endpoint: `${API_BASE}/work-orders/${selectedWorkOrder.id}/accept`,
                      payload: acceptPayload
                    });
                    
                    const response = await fetch(`${API_BASE}/work-orders/${selectedWorkOrder.id}/accept`, {
                      method: 'POST',
                      headers: getAuthHeaders(),
                      credentials: 'include',
                      body: JSON.stringify(acceptPayload)
                    });
                    
                    console.log('📥 WORK ACCEPTANCE FLOW - Response status:', response.status);
                    
                    if (response.ok) {
                      const result = await response.json().catch(() => ({}));
                      console.log('✅ WORK ACCEPTANCE FLOW - Work accepted successfully:', {
                        workOrderId: selectedWorkOrder.id,
                        result,
                        paymentCaptured: true
                      });
                      
                      alert('Work accepted! Payment captured. Rating submitted.');
                      setShowRatingModal(false);
                      setShowWorkModal(false);
                      setRating(0);
                      setReviewText('');
                      setSelectedWorkOrder(null);
                      setWorkSubmission(null);
                      
                      console.log('🔄 WORK ACCEPTANCE FLOW - Refreshing work orders after acceptance...');
                      await fetchWorkOrders();
                      console.log('✅ WORK ACCEPTANCE FLOW - Work acceptance flow completed');
                    } else {
                      const errorData = await response.json().catch(() => ({ message: 'Failed to accept work' }));
                      console.error('❌ WORK ACCEPTANCE FLOW - Failed to accept work:', {
                        status: response.status,
                        error: errorData
                      });
                      alert(errorData.message || 'Failed to accept work');
                    }
                  } catch (error) {
                    console.error('❌ WORK ACCEPTANCE FLOW - Error accepting work:', error);
                    alert('Error accepting work. Please try again.');
                  } finally {
                    setSubmittingRating(false);
                  }
                }}
                disabled={submittingRating || rating < 1}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: submittingRating || rating < 1 ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: submittingRating || rating < 1 ? 'not-allowed' : 'pointer',
                  fontFamily: 'Inter, sans-serif'
                }}
              >
                {submittingRating ? 'Submitting...' : 'Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Proof Modal */}
      {showRefundProofModal && selectedWorkOrder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowRefundProofModal(false);
              setRefundProofText('');
            }
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                margin: '0 0 8px 0',
                fontSize: '20px',
                fontWeight: 600,
                color: '#111827',
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              Add Refund Proofs
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: '#6b7280',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Please explain why you are requesting a refund and add any links or reference
              numbers that help the admin review this case.
            </p>

            <div style={{ marginTop: '16px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#374151',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Details
              </label>
              <textarea
                value={refundProofText}
                onChange={(e) => setRefundProofText(e.target.value)}
                placeholder="Describe what went wrong, include screenshot links (e.g. Google Drive, Imgur) or any other proof."
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '13px',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginTop: '12px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#374151',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Attach files (optional)
              </label>
              <input
                type="file"
                multiple
                onChange={(e) => setRefundProofFiles(e.target.files)}
                style={{ fontSize: '12px' }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '18px',
              }}
            >
              <button
                onClick={() => {
                  setShowRefundProofModal(false);
                  setRefundProofText('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '13px',
                  color: '#4b5563',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmitRefundProof(selectedWorkOrder.id)}
                disabled={submittingRefundProof}
                style={{
                  padding: '8px 18px',
                  backgroundColor: submittingRefundProof ? '#9ca3af' : '#3b82f6',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'white',
                  cursor: submittingRefundProof ? 'not-allowed' : 'pointer',
                }}
              >
                {submittingRefundProof ? 'Submitting...' : 'Submit Proofs'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedBidForPayment && user?.email && (
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
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowPaymentModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Elements stripe={stripePromise}>
              <WorkOrderPaymentCheckout
                workOrderId={selectedBidForPayment.workOrderId}
                amount={selectedBidForPayment.amount}
                vendorName={selectedBidForPayment.vendorName}
                customerEmail={user.email}
                onSuccess={async () => {
                  console.log('✅ PAYMENT FLOW - Payment success callback triggered:', {
                    workOrderId: selectedBidForPayment?.workOrderId,
                    bidId: selectedBidForPayment?.bidId,
                    amount: selectedBidForPayment?.amount
                  });
                  
                  setShowPaymentModal(false);
                  setSelectedBidForPayment(null);
                  
                  console.log('🔄 PAYMENT FLOW - Refreshing work orders after payment...');
                  await fetchWorkOrders();
                  
                  console.log('🔄 PAYMENT FLOW - Refreshing bids after payment...');
                  await fetchBids();
                  
                  // Refresh again after a delay to catch any async updates
                  setTimeout(() => {
                    console.log('🔄 PAYMENT FLOW - Delayed refresh (2s after payment)...');
                    fetchWorkOrders();
                    fetchBids();
                  }, 2000);
                  
                  console.log('✅ PAYMENT FLOW - Payment flow completed successfully');
                  alert('Payment completed successfully! Vendor can now submit work.');
                }}
                onCancel={() => {
                  setShowPaymentModal(false);
                  setSelectedBidForPayment(null);
                }}
              />
            </Elements>
          </div>
        </div>
      )}

      {/* Bid Acceptance Payment Modal */}
      {showBidPaymentModal && selectedBidForAcceptance && eventId && serviceId && user?.email && (
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
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => {
            setShowBidPaymentModal(false);
            setSelectedBidForAcceptance(null);
          }}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              marginBottom: '8px',
              color: '#1f2937',
              fontFamily: 'Inter, sans-serif'
            }}>
              Accept Bid & Authorize Payment
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px',
              fontFamily: 'Inter, sans-serif'
            }}>
              Your payment will be held in escrow until you accept the completed work.
            </p>
            <ServiceBidPaymentCheckout
              bidId={selectedBidForAcceptance.id}
              bidAmount={Number(selectedBidForAcceptance.bidAmount)}
              vendorName={selectedBidForAcceptance.vendor.businessName}
              customerEmail={user.email}
              eventId={eventId}
              serviceId={serviceId}
              onSuccess={handleBidPaymentSuccess}
              onCancel={() => {
                setShowBidPaymentModal(false);
                setSelectedBidForAcceptance(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Revision Request Modal */}
      {showRevisionModal && (
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
            zIndex: 10001,
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowRevisionModal(false);
              setRevisionNotes('');
            }
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '500px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: '24px' }}>
              <h2
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '24px',
                  fontWeight: 600,
                  color: '#1f2937',
                  fontFamily: 'Raleway, sans-serif',
                }}
              >
                Request Revision
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#6b7280',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Please provide details about what needs to be revised. This will be sent to the vendor.
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                Revision Notes <span style={{ color: '#9ca3af', fontWeight: 'normal' }}>(Optional)</span>
              </label>
              <textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Describe what changes or improvements you'd like the vendor to make..."
                style={{
                  width: '100%',
                  minHeight: '120px',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'Inter, sans-serif',
                  resize: 'vertical',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#f59e0b';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRevisionModal(false);
                  setRevisionNotes('');
                  setSelectedWorkOrderForRevision(null);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRevision}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#d97706';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f59e0b';
                }}
              >
                Submit Revision Request
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
    </>
  );
}


