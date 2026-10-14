"use client";

import { useRoleContext } from '../../../components/RoleContext';
import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ProfileCoverHeader from '@/components/profile/ProfileCoverHeader';
import { resolveApiBaseUrl } from '@/lib/api-base';
import { useProfileAvatar } from '@/lib/hooks/useProfileAvatar';
import { Footer } from '../../../components/TrustFooter';
import { fetchEventsByOrganizer, deleteBackendEvent, updateBackendEvent, BackendEvent } from '../../../lib/services/events';
import { useSearchParams } from 'next/navigation';
import AddServiceModal from '../../../components/AddServiceModal';
import QuoteAcceptanceCheckout from '../../../components/QuoteAcceptanceCheckout';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { getAuthHeaders, getAuthorizationHeader } from '@/lib/auth-utils';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

function MyEventsPageContent() {
  const { isAuthenticated, user, authChecked } = useRoleContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editEventId = searchParams.get('edit');
  const tabParam = searchParams.get('tab');
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(
    tabParam === 'notifications' ? 'notifications' : tabParam === 'services' ? 'services' : 'events'
  );
  const [selectedAddress, setSelectedAddress] = useState('home');
  const [addressData, setAddressData] = useState({
    home: { address: '', address2: '', city: '', country: '', state: '', zip: '' },
    billing: { address: '', address2: '', city: '', country: '', state: '', zip: '' },
    shipping: { address: '', address2: '', city: '', country: '', state: '', zip: '' },
    work: { address: '', address2: '', city: '', country: '', state: '', zip: '' }
  });
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    homePhone: '',
    cellPhone: '',
    jobTitle: '',
    company: '',
    suffix: '',
    websiteUrl: ''
  });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const { profileImageUrl, applyAvatarUrl } = useProfileAvatar();
  const [selectedEventStatus, setSelectedEventStatus] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [userEvents, setUserEvents] = useState<BackendEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<BackendEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [selectedFlaggedEvent, setSelectedFlaggedEvent] = useState<any | null>(null);
  const [flagData, setFlagData] = useState<any | null>(null);
  const [unflagRequestReason, setUnflagRequestReason] = useState('');
  const [requestingUnflag, setRequestingUnflag] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const filtersRowRef = useRef<HTMLDivElement | null>(null);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [selectedEventForService, setSelectedEventForService] = useState<string | null>(null);
  const [userServices, setUserServices] = useState<any[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [editingService, setEditingService] = useState<any | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [showDeleteServiceModal, setShowDeleteServiceModal] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<{ id: string; eventId: string; name: string } | null>(null);
  const [quoteRequests, setQuoteRequests] = useState<any[]>([]);
  const [quoteRequestsLoading, setQuoteRequestsLoading] = useState(false);
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);
  const [showDeleteQuoteModal, setShowDeleteQuoteModal] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<{ id: string; eventType: string } | null>(null);
  const [selectedQuoteRequest, setSelectedQuoteRequest] = useState<any | null>(null);
  const [showQuoteDetailsModal, setShowQuoteDetailsModal] = useState(false);
  const [quoteWorkOrder, setQuoteWorkOrder] = useState<any | null>(null);
  const [showQuotePaymentModal, setShowQuotePaymentModal] = useState(false);
  const [acceptingQuote, setAcceptingQuote] = useState(false);
  const [rejectingQuote, setRejectingQuote] = useState(false);
  const [quoteWorkSubmission, setQuoteWorkSubmission] = useState<any | null>(null);
  const [showQuoteWorkModal, setShowQuoteWorkModal] = useState(false);
  const [showQuoteRatingModal, setShowQuoteRatingModal] = useState(false);
  const [quoteRating, setQuoteRating] = useState(0);
  const [quoteReviewText, setQuoteReviewText] = useState('');
  const [submittingQuoteRating, setSubmittingQuoteRating] = useState(false);
  const [refundRequested, setRefundRequested] = useState<Record<string, boolean>>({});
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [selectedWorkOrderForRevision, setSelectedWorkOrderForRevision] = useState<string | null>(null);
  // Local flag for quote work orders so UI can flip to "Request Refund" after a revision cycle
  // even if revisionCount from backend is delayed or not yet updated.
  // Persisted in sessionStorage so it survives reloads within the same tab.
  const [localQuoteRevisionRequested, setLocalQuoteRevisionRequested] = useState<Record<string, boolean>>({});
  const [showRefundProofModal, setShowRefundProofModal] = useState(false);
  const [refundProofText, setRefundProofText] = useState('');
  const [refundProofFiles, setRefundProofFiles] = useState<FileList | null>(null);
  const [submittingRefundProof, setSubmittingRefundProof] = useState(false);

  // Load persisted quote revision flags from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.sessionStorage.getItem('evenzs_quote_workorder_revisions');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setLocalQuoteRevisionRequested(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load quote revision flags from storage', e);
    }
  }, []);

  // Persist quote revision flags whenever they change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        'evenzs_quote_workorder_revisions',
        JSON.stringify(localQuoteRevisionRequested || {}),
      );
    } catch (e) {
      console.error('Failed to save quote revision flags to storage', e);
    }
  }, [localQuoteRevisionRequested]);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showDeleteEventModal, setShowDeleteEventModal] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string } | null>(null);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [notificationsList, setNotificationsList] = useState<Array<{ id: string; title: string; message: string; read: boolean; createdAt: string; type?: string; metadata?: any }>>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsUnreadCount, setNotificationsUnreadCount] = useState(0);
  const [notificationViewUrls, setNotificationViewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authChecked) return; // wait until auth is checked to avoid false redirect
    if (!isAuthenticated || user?.role === 'VENDOR') {
      router.push(`/auth/login?redirect=${encodeURIComponent('/profile/my-events')}`);
    } else {
      setLoading(false);
    }
  }, [authChecked, isAuthenticated, user, router]);

  useEffect(() => {
    if (selectedItem === 'notifications' && isAuthenticated) {
      fetchNotifications();
    }
  }, [selectedItem, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && user?.role !== 'VENDOR') {
      fetchNotificationsUnreadCount();
    }
  }, [isAuthenticated, user?.role]);

  // Load existing profile form data (avatar is handled by useProfileAvatar)
  useEffect(() => {
    const loadProfileData = async () => {
      if (!user?.id || !authChecked) return;

      try {
        const backendUrl = resolveApiBaseUrl();
        const profileResponse = await fetch(`${backendUrl}/auth/profile/${user.id}`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });

        if (profileResponse.ok) {
          const profileResult = await profileResponse.json();

          if (profileResult.success) {
            setProfileData(profileResult.profileData);
            setAddressData(profileResult.addressData);
          }
        }
      } catch (error) {
        console.error('❌ Error loading profile data:', error);
      }
    };

    loadProfileData();
  }, [user?.id, authChecked]);

  // Load user events
  useEffect(() => {
    const loadUserEvents = async () => {
      if (user?.email) {
        console.log('Loading events for user:', user.email);
        setEventsLoading(true);
        try {
          const events = await fetchEventsByOrganizer(user.email);
          console.log('Loaded events:', events);
          setUserEvents(events);
          setFilteredEvents(events);
        } catch (error) {
          console.error('Failed to load events:', error);
          // Fallback to some test events for demo
          const testEvents = [
            {
              id: '1',
              title: 'Tech Conference 2024',
              description: 'Annual technology conference',
              startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              price: 0,
              city: 'San Francisco',
              coverImage: '/Events/2.jpg',
              status: 'active'
            },
            {
              id: '2', 
              title: 'Design Workshop',
              description: 'Learn modern design principles',
              startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
              price: 75,
              city: 'New York',
              coverImage: '/Events/3.jpg',
              status: 'active'
            }
          ];
          setUserEvents(testEvents);
          setFilteredEvents(testEvents);
        } finally {
          setEventsLoading(false);
        }
      } else {
        console.log('No user email found');
      }
    };

    // Initial load
    loadUserEvents();

    // Refresh when returning to this tab/page
    const onFocus = () => {
      loadUserEvents();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
    };
  }, [user?.email]);

  // Filter events based on search query, status, category, date and sort order
  useEffect(() => {
    console.log('Filtering events - searchQuery:', searchQuery, 'userEvents:', userEvents.length, 'status:', selectedEventStatus);
    let filtered = [...userEvents];

    // Filter by status first
    if (selectedEventStatus === 'active') {
      filtered = filtered.filter(event => new Date(event.startDate || '') > new Date());
    } else if (selectedEventStatus === 'past') {
      filtered = filtered.filter(event => new Date(event.startDate || '') < new Date());
    } else if (selectedEventStatus === 'draft') {
      filtered = filtered.filter(event => (event as any).status === 'draft');
    }

    // Category filter (if available on event)
    if (selectedCategory) {
      filtered = filtered.filter(ev => {
        const cat = (ev as any).category;
        if (!cat) return true; // keep items with no category
        return String(cat).toLowerCase() === selectedCategory.toLowerCase();
      });
    }

    // Date filter (yyyy-mm-dd)
    if (selectedDate) {
      filtered = filtered.filter(ev => {
        const d = ev.startDate ? new Date(ev.startDate) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        return d.toISOString().slice(0, 10) === selectedDate;
      });
    }

    // Then filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(event => 
        String((event as any).title || '').toLowerCase().includes(q) ||
        String((event as any).description || '').toLowerCase().includes(q) ||
        String((event as any).city || (event as any).address || '').toLowerCase().includes(q)
      );
    }

    // Sorting by date
    filtered.sort((a, b) => {
      const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
      const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });

    console.log('Filtered events:', filtered.length);
    setFilteredEvents(filtered);
  }, [searchQuery, userEvents, selectedEventStatus, selectedCategory, selectedDate, sortOrder]);

  // Handle file upload
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPG, PNG, WEBP)');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('File size must be less than 5MB');
      return;
    }

    setUploadedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // Save image to database
  const handleSaveImage = async () => {
    if (!uploadedImage) return;

    setUploadLoading(true);
    try {
      const formData = new FormData();
      // Backend expects a single file field named `file`
      formData.append('file', uploadedImage);
      formData.append('userId', user?.id || '');

      // Upload directly to backend
      const backendBase = resolveApiBaseUrl();
      const response = await fetch(`${backendBase}/uploads`, {
        method: 'POST',
        headers: getAuthorizationHeader(),
        credentials: 'include',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        const imageUrl = result.url || result.imageUrl;
        if (imageUrl) {
          applyAvatarUrl(imageUrl);
        }
        
        setUploadSuccess(true);
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadedImage(null);
          setImagePreview(null);
          setUploadSuccess(false);
        }, 2000);
      } else {
        const errorText = await response.text();
        console.error('❌ Upload failed:', errorText);
        alert(errorText.includes('localhost') ? 'Failed to upload image. Please try again.' : errorText);
      }
    } catch (error) {
      console.error('❌ Upload error:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploadLoading(false);
    }
  };

  // Cancel upload
  const handleCancelUpload = () => {
    setShowUploadModal(false);
    setUploadedImage(null);
    setImagePreview(null);
    setUploadSuccess(false);
  };

  // Save profile changes
  const handleSaveChanges = async () => {
    try {
      const response = await fetch('/api/save-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          profileData,
          addressData
        }),
      });

      if (response.ok) {
        alert('Profile saved successfully!');
      } else {
        throw new Error('Failed to save profile');
      }
    } catch (error) {
      alert('Failed to save profile. Please try again.');
    }
  };

  // Handle delete event - opens modal
  const handleDeleteEvent = (eventId: string, eventTitle: string) => {
    setEventToDelete({ id: eventId, title: eventTitle });
    setShowDeleteEventModal(true);
  };

  // Confirm delete event
  const confirmDeleteEvent = async () => {
    if (!eventToDelete) return;
    
    setDeletingEvent(true);
    try {
      await deleteBackendEvent(eventToDelete.id);
      
      // Wait a moment for backend to process
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh events list from server to get updated list
      if (user?.email) {
        try {
          const events = await fetchEventsByOrganizer(user.email);
          console.log('✅ Events after delete:', events.length, 'Deleted event ID:', eventToDelete.id);
          setUserEvents(events);
          setFilteredEvents(events);
        } catch (refreshError) {
          console.error('Failed to refresh events list:', refreshError);
          // Remove from local state as fallback
          setUserEvents(prev => prev.filter(e => e.id !== eventToDelete.id));
          setFilteredEvents(prev => prev.filter(e => e.id !== eventToDelete.id));
        }
      }
      
      setNotification({ message: 'Event deleted successfully!', type: 'success' });
      setTimeout(() => setNotification(null), 3000);
      setShowDeleteEventModal(false);
      setEventToDelete(null);
    } catch (error: any) {
      console.error('Delete error:', error);
      setNotification({ 
        message: `Failed to delete event: ${error?.message || 'Unknown error'}. Please try again.`, 
        type: 'error' 
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setDeletingEvent(false);
    }
  };
  // Handle edit event
  const handleEditEvent = (eventId: string) => {
    router.push(`/events?edit=${eventId}`);
  };

  // Handle add service
  const handleAddService = (eventId: string) => {
    setSelectedEventForService(eventId);
    setShowAddServiceModal(true);
  };

  // Handle view flag reason
  const handleViewFlagReason = async (event: any) => {
    setSelectedFlaggedEvent(event);
    setUnflagRequestReason('');
    
    // Fetch flag status from backend
    try {
      function resolveApiBaseUrl(): string {
        const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
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
      
      const res = await fetch(`${backendUrl}/events/${event.id}/flag-status`, {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        setFlagData(data);
      } else {
        setFlagData({ isFlagged: true, flagReason: event.flagReason || 'Unable to load flag details' });
      }
    } catch (error) {
      console.error('Failed to fetch flag status:', error);
      setFlagData({ isFlagged: true, flagReason: event.flagReason || 'Unable to load flag details' });
    }
    
    setShowFlagModal(true);
  };

  // Handle request unflag
  const handleRequestUnflag = async () => {
    if (!selectedFlaggedEvent || !unflagRequestReason.trim()) {
      alert('Please provide a reason for requesting unflag');
      return;
    }

    setRequestingUnflag(true);
    try {
      function resolveApiBaseUrl(): string {
        const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
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
      
      const res = await fetch(`${backendUrl}/events/${selectedFlaggedEvent.id}/request-unflag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: unflagRequestReason.trim() }),
      });

      if (res.ok) {
        setNotification({ message: 'Unflag request submitted successfully. Admin will review your request.', type: 'success' });
        setTimeout(() => setNotification(null), 5000);
        setShowFlagModal(false);
        setSelectedFlaggedEvent(null);
        setUnflagRequestReason('');
        // Refresh events to update flag status
        if (user?.email) {
          const events = await fetchEventsByOrganizer(user.email);
          setUserEvents(events);
          setFilteredEvents(events);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || 'Failed to submit unflag request');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to submit unflag request');
    } finally {
      setRequestingUnflag(false);
    }
  };

  // Handle service added/updated
  const handleServiceAdded = () => {
    const wasEditing = !!editingService;
    const editedServiceId = editingService?.id;
    setShowAddServiceModal(false);
    setSelectedEventForService(null);
    
    if (wasEditing && editingService) {
      // For edit: refresh silently in the background without showing loading
      fetchUserServices(); // Silent refresh - no loading state
    } else {
      // For new service: refresh services list if on services tab
      if (selectedItem === 'services') {
        fetchUserServices(); // Silent refresh for new service too
      }
    }
    
    setEditingService(null);
  };

  // Handle edit service
  const handleEditService = (service: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingService(service);
    setShowAddServiceModal(true);
  };

  // Handle delete service click
  const handleDeleteService = (serviceId: string, eventId: string, serviceName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setServiceToDelete({ id: serviceId, eventId, name: serviceName });
    setShowDeleteServiceModal(true);
  };

  // Confirm delete service
  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;

    setDeletingServiceId(serviceToDelete.id);
    try {
      // Use dynamic URL resolution
      function resolveApiBaseUrl(): string {
        const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
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
      const response = await fetch(`${backendUrl}/events/${serviceToDelete.eventId}/services/${serviceToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        // Update local state immediately without showing loading
        setUserServices(prev => prev.filter(service => service.id !== serviceToDelete.id));
        setNotification({ message: 'Service deleted successfully!', type: 'success' });
        setTimeout(() => setNotification(null), 3000);
        setShowDeleteServiceModal(false);
        setServiceToDelete(null);
      } else {
        const errorText = await response.text();
        setNotification({ 
          message: `Failed to delete service: ${errorText || 'Please try again.'}`, 
          type: 'error' 
        });
        setTimeout(() => setNotification(null), 5000);
      }
    } catch (error) {
      console.error('Error deleting service:', error);
      setNotification({ 
        message: 'Error deleting service. Please try again.', 
        type: 'error' 
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setDeletingServiceId(null);
    }
  };

  // Fetch all services for the user
  const fetchUserServices = async () => {
    setServicesLoading(true);
    try {
      // Use dynamic URL resolution
      function resolveApiBaseUrl(): string {
        const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
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
      // Fetch all events first, then fetch services for each event
      const events = await fetchEventsByOrganizer(user?.email || '');
      const allServices: any[] = [];
      
      for (const event of events) {
        try {
          const response = await fetch(`${backendUrl}/events/${event.id}/services`, {
            credentials: 'include'
          });
          if (response.ok) {
            const services = await response.json();
            const servicesWithEvent = services.map((service: any) => ({
              ...service,
              eventTitle: event.title,
              eventId: event.id,
              eventIsFlagged: event.isFlagged || false
            }));
            allServices.push(...servicesWithEvent);
          }
        } catch (error) {
          console.error(`Error fetching services for event ${event.id}:`, error);
        }
      }
      
      setUserServices(allServices);
    } catch (error) {
      console.error('Error fetching user services:', error);
    } finally {
      setServicesLoading(false);
    }
  };

  // Fetch quote requests
  const fetchQuoteRequests = async () => {
    setQuoteRequestsLoading(true);
    try {
      function resolveApiBaseUrl(): string {
        const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
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
      const response = await fetch(`${backendUrl}/quote-requests/my-requests`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setQuoteRequests(data);
      }
    } catch (error) {
      console.error('Error fetching quote requests:', error);
    } finally {
      setQuoteRequestsLoading(false);
    }
  };

  function resolveApiBaseUrlForNotifications(): string {
    const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
    if (env) return env;
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3002';
      const base = window.location.origin.replace(/\/$/, '');
      return `${base}/api`;
    }
    return 'http://localhost:3002';
  }

  const fetchNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const backendUrl = resolveApiBaseUrlForNotifications();
      const response = await fetch(`${backendUrl}/events/notifications`, { headers: getAuthHeaders(), credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : [];
        setNotificationsList(list);
        // Resolve view URLs for Work Submitted notifications that don't have one (e.g. old or enrichment missed)
        const workSubmittedIds = list
          .filter((n: any) => n.title?.toLowerCase?.().includes('work submitted') && !getNotificationViewUrlFromMeta(n.metadata))
          .map((n: any) => n.id);
        if (workSubmittedIds.length > 0) {
          try {
            const urlRes = await fetch(`${backendUrl}/events/notifications/resolve-view-urls`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ notificationIds: workSubmittedIds }),
            });
            if (urlRes.ok) {
              const urlMap = await urlRes.json();
              const resolved = Object.fromEntries(
                Object.entries(urlMap || {}).filter(([, v]) => v != null && v !== '')
              ) as Record<string, string>;
              setNotificationViewUrls((prev) => ({ ...prev, ...resolved }));
            }
          } catch (_) {}
        }
        // User opened and saw notifications — mark all as read so badge goes away
        await fetch(`${backendUrl}/events/notifications/read-all`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        setNotificationsUnreadCount(0);
      } else {
        setNotificationsList([]);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setNotificationsList([]);
    } finally {
      setNotificationsLoading(false);
    }
  };

  const fetchNotificationsUnreadCount = async () => {
    try {
      const backendUrl = resolveApiBaseUrlForNotifications();
      const response = await fetch(`${backendUrl}/events/notifications/unread-count`, { headers: getAuthHeaders(), credentials: 'include' });
      if (response.ok) {
        const count = await response.json();
        setNotificationsUnreadCount(typeof count === 'number' ? count : 0);
      } else {
        setNotificationsUnreadCount(0);
      }
    } catch (error) {
      console.error('Error fetching notifications unread count:', error);
      setNotificationsUnreadCount(0);
    }
  };

  const deleteNotification = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const backendUrl = resolveApiBaseUrlForNotifications();
      const response = await fetch(`${backendUrl}/events/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (response.ok) {
        setNotificationsList((prev) => prev.filter((n) => n.id !== notificationId));
        fetchNotificationsUnreadCount();
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  /** Build redirect URL from metadata only (no resolved Work Submitted URLs). */
  function getNotificationViewUrlFromMeta(meta: any): string | null {
    if (!meta) return null;
    if (meta.eventId && meta.eventServiceId) {
      return `/profile/my-events/service/${meta.eventServiceId}/bids?eventId=${meta.eventId}`;
    }
    if (meta.quoteRequestId) {
      return `/profile/my-events?tab=services&openQuoteRequestId=${meta.quoteRequestId}`;
    }
    if (meta.eventId) {
      return `/event/${meta.eventId}`;
    }
    return null;
  }

  /** Build redirect URL for "View" from notification metadata and resolved URLs. */
  const getNotificationViewUrl = (n: { id?: string; metadata?: any }): string | null => {
    if (n.id && notificationViewUrls[n.id]) return notificationViewUrls[n.id];
    return getNotificationViewUrlFromMeta(n.metadata);
  };

  // Handle delete quote request click
  const handleDeleteQuoteRequest = (quoteId: string, eventType: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    setQuoteToDelete({ id: quoteId, eventType });
    setShowDeleteQuoteModal(true);
  };

  // Confirm delete quote request
  const confirmDeleteQuoteRequest = async () => {
    if (!quoteToDelete) return;
    
    setDeletingQuoteId(quoteToDelete.id);
    try {
      function resolveApiBaseUrl(): string {
        const env = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
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
      const response = await fetch(`${backendUrl}/quote-requests/${quoteToDelete.id}/delete`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        // Remove from state immediately
        setQuoteRequests(prev => prev.filter(q => q.id !== quoteToDelete.id));
        // Refresh to ensure sync
        await fetchQuoteRequests();
        setNotification({ message: 'Quote request deleted successfully!', type: 'success' });
        setTimeout(() => setNotification(null), 3000);
        setShowDeleteQuoteModal(false);
        setQuoteToDelete(null);
      } else {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete quote request');
      }
    } catch (error) {
      console.error('Error deleting quote request:', error);
      setNotification({ 
        message: 'Failed to delete quote request. Please try again.', 
        type: 'error' 
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setDeletingQuoteId(null);
    }
  };

  // Fetch work order for quote request
  const fetchQuoteWorkOrder = async (quoteRequestId: string) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3002' : `${window.location.origin}/api`);
      const response = await fetch(`${backendUrl}/work-orders/organizer/my-orders`, {
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      if (response.ok) {
        const workOrders = await response.json();
        const workOrder = workOrders.find((wo: any) => wo.quoteRequestId === quoteRequestId);
        setQuoteWorkOrder(workOrder || null);
        
        // If work is submitted, fetch the submission message
        if (workOrder && workOrder.status === 'SUBMITTED') {
          try {
            const messagesResponse = await fetch(`${backendUrl}/quote-requests/${quoteRequestId}/messages`, {
              headers: getAuthHeaders(),
              credentials: 'include'
            });
            if (messagesResponse.ok) {
              const messages = await messagesResponse.json();
              // Always use the latest WORK_SUBMISSION message
              const submissionMessages = messages.filter((m: any) => m.messageType === 'WORK_SUBMISSION');
              const latestSubmission = submissionMessages.length > 0
                ? submissionMessages.sort(
                    (a: any, b: any) =>
                      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                  )[0]
                : null;
              setQuoteWorkSubmission(latestSubmission || null);
            }
          } catch (error) {
            console.error('Error fetching work submission:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching work order:', error);
    }
  };

  // Handle quote acceptance
  const handleAcceptQuote = async (quoteId: string) => {
    setShowQuotePaymentModal(true);
  };

  // Handle quote rejection
  const handleRejectQuote = async (quoteId: string) => {
    if (!confirm('Are you sure you want to reject this quote?')) return;
    
    setRejectingQuote(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3002' : `${window.location.origin}/api`);
      const response = await fetch(`${backendUrl}/quote-requests/${quoteId}/respond`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ userResponse: 'DECLINE' })
      });
      
      if (response.ok) {
        await fetchQuoteRequests();
        setShowQuoteDetailsModal(false);
        setSelectedQuoteRequest(null);
        alert('Quote rejected successfully');
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to reject quote' }));
        alert(errorData.message || 'Failed to reject quote');
      }
    } catch (error: any) {
      console.error('Error rejecting quote:', error);
      alert('Error rejecting quote. Please try again.');
    } finally {
      setRejectingQuote(false);
    }
  };

  // Handle work acceptance - opens rating modal
  const handleAcceptWorkClick = () => {
    if (!quoteWorkOrder) return;
    setShowQuoteRatingModal(true);
  };

  // Submit rating and accept work
  const handleAcceptWork = async () => {
    if (!quoteWorkOrder || quoteRating < 1 || quoteRating > 5) {
      alert('Please select a rating (1-5 stars)');
      return;
    }

    setSubmittingQuoteRating(true);
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3002' : `${window.location.origin}/api`);
      const response = await fetch(`${backendUrl}/work-orders/${quoteWorkOrder.id}/accept`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ 
          rating: quoteRating, 
          review: quoteReviewText.trim() || undefined 
        })
      });
      
      if (response.ok) {
        alert('Work accepted! Payment captured. Rating submitted.');
        setShowQuoteRatingModal(false);
        setShowQuoteWorkModal(false);
        setQuoteRating(0);
        setQuoteReviewText('');
        await fetchQuoteWorkOrder(selectedQuoteRequest?.id);
        await fetchQuoteRequests();
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to accept work' }));
        alert(errorData.message || 'Failed to accept work');
      }
    } catch (error: any) {
      console.error('Error accepting work:', error);
      alert('Error accepting work. Please try again.');
    } finally {
      setSubmittingQuoteRating(false);
    }
  };

  // Handle work revision request - opens modal
  const handleRequestRevision = (workOrderId: string) => {
    setSelectedWorkOrderForRevision(workOrderId);
    setRevisionNotes('');
    setShowRevisionModal(true);
  };

  // Submit revision request
  const handleSubmitRevision = async () => {
    if (!selectedWorkOrderForRevision) return;
    
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3002' : `${window.location.origin}/api`);
      const response = await fetch(`${backendUrl}/work-orders/${selectedWorkOrderForRevision}/request-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ revisionNotes: revisionNotes.trim() || undefined })
      });
      
      if (response.ok) {
        await fetchQuoteWorkOrder(selectedQuoteRequest?.id);
        if (selectedWorkOrderForRevision) {
          setLocalQuoteRevisionRequested(prev => ({
            ...prev,
            [selectedWorkOrderForRevision]: true,
          }));
        }
        alert('Revision requested successfully');
        setShowRevisionModal(false);
        setRevisionNotes('');
        setSelectedWorkOrderForRevision(null);
        setShowQuoteWorkModal(false);
        setQuoteWorkSubmission(null);
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to request revision' }));
        alert(errorData.message || 'Failed to request revision');
      }
    } catch (error: any) {
      console.error('Error requesting revision:', error);
      alert('Error requesting revision. Please try again.');
    }
  };

  // Handle refund request (after at least one revision)
  const handleRefundRequest = async (workOrder: any) => {
    if (!workOrder) return;
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        (typeof window !== 'undefined' && window.location.hostname === 'localhost'
          ? 'http://localhost:3002'
          : `${window.location.origin}/api`);

      const res = await fetch(`${backendUrl}/work-orders/${workOrder.id}/request-refund`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || 'Failed to request refund');
        return;
      }

      alert('Your request for refund has been sent to the admin panel.');
      setRefundRequested(prev => ({ ...prev, [workOrder.id]: true }));
    } catch (error) {
      console.error('Error requesting refund:', error);
      alert('Error requesting refund. Please try again.');
    }
  };

  // Submit additional refund proofs (text/links) when admin asked for proofs
  const handleSubmitRefundProof = async (workOrderId: string) => {
    if (!refundProofText.trim() && (!refundProofFiles || refundProofFiles.length === 0)) {
      alert('Please add some details or at least one file as proof.');
      return;
    }
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        (typeof window !== 'undefined' && window.location.hostname === 'localhost'
          ? 'http://localhost:3002'
          : `${window.location.origin}/api`);
      setSubmittingRefundProof(true);

      // Upload files (if any) to generic uploads endpoint, collect URLs
      const attachmentUrls: string[] = [];
      if (refundProofFiles && refundProofFiles.length > 0) {
        for (let i = 0; i < refundProofFiles.length; i++) {
          const file = refundProofFiles[i];
          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await fetch(`${backendUrl}/uploads`, {
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

      const res = await fetch(`${backendUrl}/work-orders/${workOrderId}/refund-proof`, {
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

  // Open quote details modal
  const openQuoteDetails = async (quote: any) => {
    setSelectedQuoteRequest(quote);
    setShowQuoteDetailsModal(true);
    await fetchQuoteWorkOrder(quote.id);
  };

  const openQuoteRequestIdParam = searchParams.get('openQuoteRequestId');

  // Sync sidebar tab when URL ?tab= changes (e.g. from Profile page links)
  useEffect(() => {
    if (tabParam === 'services') {
      setSelectedItem('services');
    } else if (tabParam === 'notifications') {
      setSelectedItem('notifications');
    } else if (!tabParam || tabParam === 'events') {
      setSelectedItem('events');
    }
  }, [tabParam]);

  // Deep link: open quote detail modal when URL has openQuoteRequestId
  useEffect(() => {
    if (!openQuoteRequestIdParam || !user?.id) return;
    setSelectedItem('services');
  }, [openQuoteRequestIdParam, user?.id]);

  // Fetch services when services tab is selected
  useEffect(() => {
    if (selectedItem === 'services' && user?.email) {
      fetchUserServices();
      fetchQuoteRequests();
    }
  }, [selectedItem, user?.email]);

  const openedQuoteRequestIdRef = useRef<string | null>(null);
  // When quote requests are loaded and URL has openQuoteRequestId, open that quote modal (once)
  useEffect(() => {
    if (!openQuoteRequestIdParam || quoteRequestsLoading) return;
    if (openedQuoteRequestIdRef.current === openQuoteRequestIdParam) return;
    const quote = quoteRequests.find((q: any) => q.id === openQuoteRequestIdParam);
    if (quote) {
      openedQuoteRequestIdRef.current = openQuoteRequestIdParam;
      openQuoteDetails(quote);
      router.replace('/profile/my-events?tab=services', { scroll: false });
    }
  }, [openQuoteRequestIdParam, quoteRequests, quoteRequestsLoading]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
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
    <div className="min-h-screen" style={{ backgroundColor: '#F7FBFF', position: 'relative', overflow: 'hidden' }}>
      {/* Menu Toggle Button - Only visible below 1240px */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="sidebar-toggle-btn"
        style={{
          position: 'fixed',
          top: '24px',
          left: '24px',
          zIndex: 2000,
          backgroundColor: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '48px',
          height: '48px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0B1A33" strokeWidth="2.5" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Overlay - Only visible when sidebar is open on mobile/tablet */}
      {showSidebar && (
        <div
          onClick={() => setShowSidebar(false)}
          className="sidebar-overlay"
        style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 1500,
            display: 'none'
          }}
        />
      )}

      {/* Profile Layout Container */}
      <div style={{ display: 'flex', minHeight: '100vh', gap: '20px', padding: '29px 32px' }}>
        
        {/* Sidebar - Hidden when Quote Request Details modal is open */}
        <aside
          className={showSidebar ? 'sidebar-open' : ''}
          style={{
            width: '300px',
            flexShrink: 0,
            borderRadius: '35px',
            backgroundColor: 'white',
            padding: '30px',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            display: showQuoteDetailsModal ? 'none' : 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            height: 'fit-content',
            position: 'sticky',
          top: '29px',
            zIndex: 1600
          }}
        >
          {/* Close button - Only visible on mobile/tablet */}
          <button
            onClick={() => setShowSidebar(false)}
            className="sidebar-close-btn"
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: '#F7F8FA',
              border: 'none',
              cursor: 'pointer',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#E5E7EB';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F7F8FA';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B1A33" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Logo */}
          <Image
            src="/Logo.svg"
            alt="Logo"
            width={270}
            height={60}
            style={{ objectFit: 'contain', cursor: 'pointer' }}
            onClick={() => router.push('/')}
          />

          {/* Sidebar Menu */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '5px', width: '100%' }}>
            {/* Profile Info */}
            <button
              onClick={() => router.push('/profile')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                width: '100%'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Profile Info
            </button>

            {/* My Events */}
            <button
              onClick={() => setSelectedItem('events')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: selectedItem === 'events' ? 'black' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: selectedItem === 'events' ? 'white' : '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                borderRadius: selectedItem === 'events' ? '35px' : '0px',
                width: '100%'
              }}
              onMouseEnter={(e) => {
                if (selectedItem !== 'events') e.currentTarget.style.backgroundColor = '#F3F4F6';
              }}
              onMouseLeave={(e) => {
                if (selectedItem !== 'events') e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke={selectedItem === 'events' ? 'white' : '#0B1A33'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 2V6M8 2V6M3 10H21" stroke={selectedItem === 'events' ? 'white' : '#0B1A33'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              My Events
            </button>

            {/* My Services */}
            <button
              onClick={() => setSelectedItem('services')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: selectedItem === 'services' ? 'black' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: selectedItem === 'services' ? 'white' : '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                borderRadius: selectedItem === 'services' ? '35px' : '0px',
                width: '100%'
              }}
              onMouseEnter={(e) => {
                if (selectedItem !== 'services') e.currentTarget.style.backgroundColor = '#F3F4F6';
              }}
              onMouseLeave={(e) => {
                if (selectedItem !== 'services') e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7V12C2 17.55 6.84 22.74 12 24C17.16 22.74 22 17.55 22 12V7L12 2Z" stroke={selectedItem === 'services' ? 'white' : '#0B1A33'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 12L11 14L15 10" stroke={selectedItem === 'services' ? 'white' : '#0B1A33'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              My Requests
            </button>

            {/* My Tickets */}
            <button
              onClick={() => router.push('/profile/my-tickets')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                width: '100%',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 10C3 8.89543 3.89543 8 5 8H19C20.1046 8 21 8.89543 21 10V14C21 15.1046 20.1046 16 19 16H5C3.89543 16 3 15.1046 3 14V10Z" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 8V6C8 4.89543 8.89543 4 10 4H14C15.1046 4 16 4.89543 16 6V8" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              My Tickets
            </button>

            {/* Email */}
            <button
              onClick={() => setSelectedItem('email')}
              style={{
                display: 'none',
                alignItems: 'center',
                gap: '12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                width: '100%'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 6L12 13L2 6" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Email
            </button>

            {/* Password */}
            <button
              onClick={() => setSelectedItem('password')}
              style={{
                display: 'none',
                alignItems: 'center',
                gap: '12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                width: '100%'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M19 11H5C3.89543 11 3 11.8954 3 13V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V13C21 11.8954 20.1046 11 19 11Z" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 11V7C7 5.67392 7.52678 4.40215 8.46447 3.46447C9.40215 2.52678 10.6739 2 12 2C13.3261 2 14.5979 2.52678 15.5355 3.46447C16.4732 4.40215 17 5.67392 17 7V11" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Password
            </button>

            {/* Notifications */}
            <button
              onClick={() => setSelectedItem('notifications')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: selectedItem === 'notifications' ? 'black' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: selectedItem === 'notifications' ? 'white' : '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                borderRadius: selectedItem === 'notifications' ? '35px' : '0px',
                width: '100%',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (selectedItem !== 'notifications') e.currentTarget.style.backgroundColor = '#F3F4F6';
              }}
              onMouseLeave={(e) => {
                if (selectedItem !== 'notifications') e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke={selectedItem === 'notifications' ? 'white' : '#0B1A33'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke={selectedItem === 'notifications' ? 'white' : '#0B1A33'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {notificationsUnreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-8px',
                      minWidth: '18px',
                      height: '18px',
                      borderRadius: '9px',
                      backgroundColor: '#EF4444',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      boxSizing: 'border-box'
                    }}
                  >
                    {notificationsUnreadCount > 99 ? '99+' : notificationsUnreadCount}
                  </span>
                )}
              </span>
              Notifications
            </button>

            {/* Delete Account */}
            <button
              onClick={() => setSelectedItem('delete')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                width: '100%'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 6H5H21" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Delete Account
            </button>

            {/* My Billing */}
            <button
              onClick={() => setSelectedItem('billing')}
              style={{
                display: 'none',
                alignItems: 'center',
                gap: '12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                fontFamily: 'Inter',
                fontWeight: 400,
                fontSize: '22.32px',
                color: '#0B1A33',
                textAlign: 'left',
                transition: 'all 0.2s',
                width: '100%'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M21 4H3C1.89543 4 1 4.89543 1 6V18C1 19.1046 1.89543 20 3 20H21C22.1046 20 23 19.1046 23 18V6C23 4.89543 22.1046 4 21 4Z" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 10H23" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              My Billing
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
          
      <ProfileCoverHeader
        user={user}
        profileImageUrl={profileImageUrl}
        onEditClick={() => setShowUploadModal(true)}
      />


      {/* Conditional Content Based on Selected Item */}
      {selectedItem === 'events' && (
      <>
      {/* My Event Space Section */}
      <div
        style={{
          width: '100%',
          backgroundColor: 'white',
          borderRadius: '24px',
          padding: '30px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}
      >
        <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3
              style={{
                fontFamily: 'Raleway',
                fontWeight: 600,
                fontStyle: 'normal',
                fontSize: '32px',
                lineHeight: '100%',
                letterSpacing: '0px',
                color: '#0B1A33',
                margin: 0,
                textAlign: 'left'
              }}
            >
              My Event Space
            </h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
              {/* Search Field */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '337.7379150390625px',
                    height: '46px',
                    borderRadius: '49px',
                    border: '1px solid #6161612E',
                    padding: '0 20px 0 50px',
                    fontSize: '16px',
                    outline: 'none',
                    backgroundColor: '#F4F7FE'
                  }}
                />
                {/* Search Icon */}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    position: 'absolute',
                    left: '18px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#616161'
                  }}
                >
                  <path d="M21 21L16.514 16.506L21 21ZM19 10.5C19 15.194 15.194 19 10.5 19C5.806 19 2 15.194 2 10.5C2 5.806 5.806 2 10.5 2C15.194 2 19 5.806 19 10.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              
              {/* Filter Icon with Popover */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowFilters(v => !v)}
                  aria-label="Toggle filters"
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '49px',
                    backgroundColor: 'black',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ color: 'white' }}
                  >
                    <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {showFilters && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '64px',
                      right: 0,
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
                      padding: '12px',
                      display: 'flex',
                      gap: '8px',
                      zIndex: 50
                    }}
                  >
                    {/* Category Dropdown */}
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      style={{
                        width: '190px',
                        height: '44px',
                        borderRadius: '50px',
                        border: '1px solid #e5e7eb',
                        backgroundColor: '#F4F7FE',
                        padding: '0 14px',
                        fontSize: '14px'
                      }}
                    >
                      <option value="">All Categories</option>
                      <option value="CONFERENCE">Conference</option>
                      <option value="WORKSHOP">Workshop</option>
                      <option value="SEMINAR">Seminar</option>
                      <option value="MEETING">Meeting</option>
                      <option value="NETWORKING">Networking</option>
                      <option value="TRAINING">Training</option>
                      <option value="EXHIBITION">Exhibition</option>
                      <option value="GALA">Gala</option>
                      <option value="FUNDRAISER">Fundraiser</option>
                      <option value="CONCERT">Concert</option>
                      <option value="FESTIVAL">Festival</option>
                      <option value="SPORTS">Sports</option>
                      <option value="WEDDING">Wedding</option>
                      <option value="BIRTHDAY">Birthday</option>
                      <option value="CORPORATE">Corporate</option>
                      <option value="SOCIAL">Social</option>
                      <option value="EDUCATIONAL">Educational</option>
                      <option value="CULTURAL">Cultural</option>
                      <option value="RELIGIOUS">Religious</option>
                      <option value="CHARITY">Charity</option>
                    </select>

                    {/* Date Picker */}
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      style={{
                        width: '170px',
                        height: '44px',
                        borderRadius: '50px',
                        border: '1px solid #e5e7eb',
                        backgroundColor: '#F4F7FE',
                        padding: '0 14px',
                        fontSize: '14px'
                      }}
                    />

                    {/* Menu dropdown reuse (sort/clear) */}
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setShowMenu(v => !v)}
                        aria-haspopup="menu"
                        aria-expanded={showMenu}
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50px',
                          backgroundColor: '#7090B01F',
                          border: '1px solid #7090B01F',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ color: 'black' }}
                        >
                          <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {showMenu && (
                        <div
                          role="menu"
                          style={{
                            position: 'absolute',
                            top: '52px',
                            right: 0,
                            background: 'white',
                            border: '1px solid #E5E7EB',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
                            minWidth: '200px',
                            zIndex: 60,
                            overflow: 'hidden'
                          }}
                        >
                          <button onClick={() => { setSortOrder('newest'); setShowMenu(false); }} role="menuitem" style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'white', border: 'none', cursor: 'pointer' }}>Sort by Date (Newest)</button>
                          <button onClick={() => { setSortOrder('oldest'); setShowMenu(false); }} role="menuitem" style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'white', border: 'none', cursor: 'pointer' }}>Sort by Date (Oldest)</button>
                          <div style={{ height: '1px', background: '#F3F4F6' }} />
                          <button onClick={() => { setSelectedCategory(''); setSelectedDate(''); setShowMenu(false); }} role="menuitem" style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'white', border: 'none', cursor: 'pointer' }}>Clear Filters</button>
                          <button onClick={() => { setSearchQuery(''); setShowMenu(false); }} role="menuitem" style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'white', border: 'none', cursor: 'pointer' }}>Reset Search</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <p
            style={{
              fontFamily: 'Raleway',
              fontWeight: 500,
              fontStyle: 'normal',
              fontSize: '16px',
              lineHeight: '150%',
              letterSpacing: '0%',
              color: '#616161',
              margin: 0,
              marginBottom: '20px'
            }}
          >
            Review and update the events you've organized or contributed to.
          </p>
          
          {/* Event Status Buttons and Filters Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop:"100px" }}>
            {/* Event Status Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setSelectedEventStatus('active')}
                style={{
                  width: '118px',
                  height: '45px',
                  borderRadius: '50px',
                  opacity: 1,
                  paddingTop: '11px',
                  paddingRight: '25px',
                  paddingBottom: '11px',
                  paddingLeft: '25px',
                  gap: '10px',
                  backgroundColor: selectedEventStatus === 'active' ? '#0B1A33' : '#7090B01F',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Raleway',
                  fontWeight: 600,
                  fontStyle: 'normal',
                  fontSize: '15px',
                  lineHeight: '100%',
                  letterSpacing: '0%',
                  color: selectedEventStatus === 'active' ? 'white' : '#616161',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                  
                }}
              >
                Active ({userEvents.filter(e => new Date(e.startDate || '') > new Date()).length})
              </button>
              
              <button
                onClick={() => setSelectedEventStatus('draft')}
                style={{
                  width: '118px',
                  height: '45px',
                  borderRadius: '50px',
                  opacity: 1,
                  paddingTop: '11px',
                  paddingRight: '25px',
                  paddingBottom: '11px',
                  paddingLeft: '25px',
                  gap: '10px',
                  backgroundColor: selectedEventStatus === 'draft' ? '#0B1A33' : '#7090B01F',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Raleway',
                  fontWeight: 600,
                  fontStyle: 'normal',
                  fontSize: '15px',
                  lineHeight: '100%',
                  letterSpacing: '0%',
                  color: selectedEventStatus === 'draft' ? 'white' : '#616161',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                Draft ({userEvents.filter(e => e.status === 'draft').length})
              </button>
              
              <button
                onClick={() => setSelectedEventStatus('past')}
                style={{
                  width: '118px',
                  height: '45px',
                  borderRadius: '50px',
                  opacity: 1,
                  paddingTop: '11px',
                  paddingRight: '25px',
                  paddingBottom: '11px',
                  paddingLeft: '25px',
                  gap: '10px',
                  backgroundColor: selectedEventStatus === 'past' ? '#0B1A33' : '#7090B01F',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Raleway',
                  fontWeight: 600,
                  fontStyle: 'normal',
                  fontSize: '15px',
                  lineHeight: '100%',
                  letterSpacing: '0%',
                  color: selectedEventStatus === 'past' ? 'white' : '#616161',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                Past ({userEvents.filter(e => new Date(e.startDate || '') < new Date()).length})
              </button>
            </div>

            {/* Filters now appear in popover above; no second-row filters */}
          </div>
        </div>

        {/* Events Horizontal Carousel + Create button */}
        <div
          style={{
            marginTop: '20px'
          }}
        >
            {/* Loading State */}
            {eventsLoading && (
              <div style={{ width: '100%', textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '18px', color: '#616161' }}>Loading your events...</div>
              </div>
            )}

            {/* No Events State */}
            {!eventsLoading && filteredEvents.length === 0 && (
              <div style={{ width: '100%', textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '18px', color: '#616161' }}>
                  {searchQuery ? 'No events found matching your search.' : 'You haven\'t created any events yet.'}
                </div>
              </div>
            )}

          {/* Horizontal Scrollable Event Cards */}
          <style jsx>{`
            .events-carousel::-webkit-scrollbar {
              height: 8px;
            }
            .events-carousel::-webkit-scrollbar-track {
              background: #f1f1f1;
              border-radius: 10px;
            }
            .events-carousel::-webkit-scrollbar-thumb {
              background: #D4AF37;
              border-radius: 10px;
            }
            .events-carousel::-webkit-scrollbar-thumb:hover {
              background: #b8941f;
            }
          `}</style>
            <div
              style={{
                display: 'flex',
              gap: '20px',
              overflowX: 'auto',
              overflowY: 'hidden',
              paddingBottom: '20px',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch',
              msOverflowStyle: '-ms-autohiding-scrollbar'
            }}
            className="events-carousel"
            >
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  style={{
                    minWidth: '340px',
                    width: '340px',
                    height: '400px',
                    flexShrink: 0,
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: 'pointer',
                    opacity: event.isFlagged ? 0.8 : 1
                  }}
                  onClick={(e) => {
                    if (event.isFlagged) {
                      e.stopPropagation();
                      handleViewFlagReason(event);
                    } else {
                      router.push(`/event/${event.id}`);
                    }
                  }}
                >
                  {/* Event Image */}
                  <div
                    style={{
                      width: '100%',
                      height: '200px',
                      backgroundColor: '#E8F4FF',
                      position: 'relative'
                    }}
                  >
                    <Image
                      src={event.coverImage || '/Events/2.jpg'}
                      alt={event.title}
                      fill
                      style={{ objectFit: 'cover' }}
                    />
                    {/* Flag Badge */}
                    {event.isFlagged && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          backgroundColor: '#DC2626',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          fontFamily: 'Raleway',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          zIndex: 10,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewFlagReason(event);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 15C4 15 5 14 8 14C11 14 13 16 16 16C19 16 20 15 20 15V3C20 3 19 4 16 4C13 4 11 2 8 2C5 2 4 3 4 3V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M4 22V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Flagged
                      </div>
                    )}
                  </div>
                  
                  {/* Event Content */}
                  <div style={{ padding: '20px' }}>
                    {/* Title and Price */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <h3
                        style={{
                          fontFamily: 'Raleway',
                          fontWeight: 600,
                          fontSize: '18px',
                          color: '#0B1A33',
                          margin: 0,
                          flex: 1,
                          lineHeight: '1.2'
                        }}
                      >
                        {event.title}
                      </h3>
                      
                      {/* Price Tag */}
                      <div
                        style={{
                          backgroundColor: '#D4AF37',
                          color: '#0B1A33',
                          padding: '6px 12px',
                          borderRadius: '12px',
                          fontSize: '14px',
                          fontWeight: 600,
                          fontFamily: 'Raleway',
                          marginLeft: '8px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        ${event.basePrice || '0'}
                      </div>
                    </div>
                    
                    {/* Date */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      marginBottom: '12px'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 2V5M16 2V5M3.5 9.09H20.5M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z" stroke="#616161" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span
                        style={{
                          fontFamily: 'Raleway',
                          fontWeight: 400,
                          fontSize: '14px',
                          color: '#616161'
                        }}
                      >
                        {event.startDate ? new Date(event.startDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        }) : 'Date TBD'}
                        {event.endDate && (
                          <span> - {new Date(event.endDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}</span>
                        )}
                      </span>
                    </div>
                    
                    {/* Action Buttons */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      {/* Primary Action Row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/event/${event.id}`);
                          }}
                          style={{
                            flex: 1,
                            height: '40px',
                            backgroundColor: '#0B1A33',
                            border: 'none',
                            borderRadius: '12px',
                            color: 'white',
                            fontFamily: 'Raleway',
                            fontWeight: 600,
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          View Event
                        </button>
                        
                        {/* Edit Icon */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (event.isFlagged) {
                              alert('This event has been flagged. Editing is disabled.');
                              return;
                            }
                            handleEditEvent(event.id);
                          }}
                          disabled={event.isFlagged}
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: event.isFlagged ? '#D1D5DB' : '#E8F4FF',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: event.isFlagged ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: event.isFlagged ? 0.5 : 1
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.50023C18.8978 2.1024 19.4374 1.87891 20 1.87891C20.5626 1.87891 21.1022 2.1024 21.5 2.50023C21.8978 2.89805 22.1213 3.43762 22.1213 4.00023C22.1213 4.56284 21.8978 5.1024 21.5 5.50023L12 15.0002L8 16.0002L9 12.0002L18.5 2.50023Z" stroke="#0B1A33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        
                        {/* Delete Icon */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvent(event.id, event.title);
                          }}
                          style={{
                            width: '28px',
                            height: '28px',
                            backgroundColor: '#FFE8E8',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 6H5H21" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>

                      {/* Add Services Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (event.isFlagged) {
                            alert('This event has been flagged. Post requests are disabled.');
                            return;
                          }
                          handleAddService(event.id);
                        }}
                        disabled={event.isFlagged}
                        style={{
                          width: '100%',
                          height: '36px',
                          backgroundColor: event.isFlagged ? '#9CA3AF' : '#D4AF37',
                          border: 'none',
                          borderRadius: '8px',
                          color: '#0B1A33',
                          fontFamily: 'Raleway',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: event.isFlagged ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          opacity: event.isFlagged ? 0.6 : 1
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {event.isFlagged ? 'Post Requests (Disabled)' : 'Post Requests'}
                      </button>
                    </div>
                  </div>

                  {/* Location intentionally not shown on card per requirements */}
                </div>
              ))}

              {/* Create Event Card at the end of carousel */}
            <div
              onClick={() => router.push('/events')}
              style={{
                  minWidth: '340px',
                width: '340px',
                height: '400px',
                  flexShrink: 0,
                backgroundColor: 'transparent',
                border: '2px dashed #7090B01F',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F4F7FE';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  backgroundColor: '#7090B01F',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px'
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19M5 12H19" stroke="#616161" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              
              <h3
                style={{
                  fontFamily: 'Raleway',
                  fontWeight: 600,
                  fontSize: '20px',
                  color: '#0B1A33',
                  margin: '0 0 8px 0',
                  textAlign: 'center'
                }}
              >
                Create Event
              </h3>
              
              <p
                style={{
                  fontFamily: 'Raleway',
                  fontWeight: 400,
                  fontSize: '14px',
                  color: '#616161',
                  margin: 0,
                  textAlign: 'center',
                  lineHeight: '1.4'
                }}
              >
                Start organizing your next amazing event
              </p>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {selectedItem === 'services' && (
      <div
        style={{
          width: '100%',
          backgroundColor: 'white',
          borderRadius: '24px',
          padding: '30px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}
      >
        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3
              style={{
                fontFamily: 'Raleway',
                fontWeight: 600,
                fontStyle: 'normal',
                fontSize: '32px',
                lineHeight: '100%',
                letterSpacing: '0px',
                color: '#0B1A33',
                margin: 0,
                textAlign: 'left'
              }}
            >
              My Requests
            </h3>
          </div>
          
          <p
            style={{
              fontFamily: 'Raleway',
              fontWeight: 500,
              fontStyle: 'normal',
              fontSize: '16px',
              lineHeight: '150%',
              letterSpacing: '0%',
              color: '#616161',
              margin: 0,
              marginBottom: '20px'
            }}
          >
            View and manage all service requests you've added to your events and quote requests you've submitted.
          </p>
        </div>

        {/* Services and Quote Requests List */}
        {(servicesLoading || quoteRequestsLoading) ? (
          <div style={{ width: '100%', textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '18px', color: '#616161' }}>Loading your requests...</div>
          </div>
        ) : userServices.length === 0 && quoteRequests.length === 0 ? (
          <div style={{ width: '100%', textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '18px', color: '#616161' }}>
              You haven't added any service requests or quote requests yet.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {/* Service Requests */}
            {userServices.map((service) => (
              <div
                key={service.id}
                onClick={() => {
                  if (service.eventIsFlagged) {
                    const flaggedEvent = userEvents.find(e => e.id === service.eventId);
                    if (flaggedEvent) {
                      handleViewFlagReason(flaggedEvent);
                    } else {
                      alert('This request is from a flagged event. Access is disabled.');
                    }
                  } else {
                    router.push(`/profile/my-events/service/${service.id}/bids?eventId=${service.eventId}`);
                  }
                }}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  border: '1px solid #E5E7EB',
                  padding: '20px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.2s',
                  cursor: service.eventIsFlagged ? 'not-allowed' : 'pointer',
                  opacity: service.eventIsFlagged ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = '#0B1A33';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = '#E5E7EB';
                }}
              >
                <h4
                  style={{
                    fontFamily: 'Raleway',
                    fontWeight: 600,
                    fontSize: '20px',
                    color: '#0B1A33',
                    margin: '0 0 10px 0'
                  }}
                >
                  {service.title}
                </h4>
                <p
                  style={{
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#616161',
                    margin: '0 0 10px 0'
                  }}
                >
                  {service.description || 'No description'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <span
                    style={{
                      backgroundColor: '#E0E7FF',
                      color: '#3730A3',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontFamily: 'Inter',
                      fontWeight: 500
                    }}
                  >
                    {service.category}
                  </span>
                  {service.postalCode && (
                    <span
                      style={{
                        backgroundColor: '#F3F4F6',
                        color: '#616161',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontFamily: 'Inter',
                        fontWeight: 500
                      }}
                    >
                      {service.postalCode}
                    </span>
                  )}
                  {service.eventIsFlagged && (
                    <span
                      style={{
                        backgroundColor: '#FEE2E2',
                        color: '#DC2626',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontFamily: 'Inter',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 15C4 15 5 14 8 14C11 14 13 16 16 16C19 16 20 15 20 15V3C20 3 19 4 16 4C13 4 11 2 8 2C5 2 4 3 4 3V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M4 22V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Event Flagged
                    </span>
                  )}
                </div>
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #E5E7EB' }}>
                  <p
                    style={{
                      fontFamily: 'Inter',
                      fontSize: '12px',
                      color: '#616161',
                      margin: '4px 0'
                    }}
                  >
                    Event: <strong>{service.eventTitle}</strong>
                  </p>
                  {service.budget && (
                    <p
                      style={{
                        fontFamily: 'Inter',
                        fontSize: '14px',
                        color: '#0B1A33',
                        margin: '4px 0',
                        fontWeight: 600
                      }}
                    >
                      Budget: {service.currency || 'USD'} {parseFloat(service.budget.toString()).toFixed(2)}
                    </p>
                  )}
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span 
                      style={{
                        fontFamily: 'Inter',
                        fontSize: '14px',
                        color: '#0B1A33',
                        fontWeight: 500
                      }}
                    >
                      View Bids →
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={(e) => handleEditService(service, e)}
                        disabled={deletingServiceId === service.id}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#3B82F6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontFamily: 'Inter',
                          fontWeight: 500,
                          cursor: deletingServiceId === service.id ? 'not-allowed' : 'pointer',
                          opacity: deletingServiceId === service.id ? 0.5 : 1,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (deletingServiceId !== service.id) {
                            e.currentTarget.style.backgroundColor = '#2563EB';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (deletingServiceId !== service.id) {
                            e.currentTarget.style.backgroundColor = '#3B82F6';
                          }
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => handleDeleteService(service.id, service.eventId, service.title || service.name || 'this service', e)}
                        disabled={deletingServiceId === service.id}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#EF4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontFamily: 'Inter',
                          fontWeight: 500,
                          cursor: deletingServiceId === service.id ? 'not-allowed' : 'pointer',
                          opacity: deletingServiceId === service.id ? 0.5 : 1,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (deletingServiceId !== service.id) {
                            e.currentTarget.style.backgroundColor = '#DC2626';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (deletingServiceId !== service.id) {
                            e.currentTarget.style.backgroundColor = '#EF4444';
                          }
                        }}
                      >
                        {deletingServiceId === service.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {/* Quote Requests */}
            {quoteRequests.map((quote) => (
              <div
                key={quote.id}
                onClick={() => {
                  if (quote.isExternal && !quote.vendorId) {
                    // External request before vendor has joined – show info only
                    alert('This request was sent to a vendor who is not yet on Evenzs. You will be able to chat and see their quote here once they join.');
                  } else if (quote.eventIsFlagged) {
                    // Find the event to show flag reason
                    const flaggedEvent = userEvents.find(e => e.id === quote.eventId);
                    if (flaggedEvent) {
                      handleViewFlagReason(flaggedEvent);
                    } else {
                      alert('This request is from a flagged event. Access is disabled.');
                    }
                  } else {
                    router.push(`/quote-request/${quote.vendorId}`);
                  }
                }}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  border: '1px solid #E5E7EB',
                  padding: '20px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.2s',
                  cursor: quote.eventIsFlagged ? 'not-allowed' : 'pointer',
                  opacity: quote.eventIsFlagged ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!quote.eventIsFlagged) {
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = '#0B1A33';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = '#E5E7EB';
                }}
              >
                <h4
                  style={{
                    fontFamily: 'Raleway',
                    fontWeight: 600,
                    fontSize: '20px',
                    color: '#0B1A33',
                    margin: '0 0 10px 0'
                  }}
                >
                  Quote Request
                </h4>
                <p
                  style={{
                    fontFamily: 'Inter',
                    fontSize: '14px',
                    color: '#616161',
                    margin: '0 0 10px 0'
                  }}
                >
                  {quote.eventType} • {new Date(quote.eventDate).toLocaleDateString()}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                  <span
                    style={{
                      backgroundColor: '#DBEAFE',
                      color: '#1E40AF',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontFamily: 'Inter',
                      fontWeight: 500
                    }}
                  >
                    {quote.isExternal && !quote.vendorId ? 'Quote Request (vendor not yet on Evenzs)' : 'Quote Request'}
                  </span>
                  <span
                    style={{
                      backgroundColor: quote.status === 'PENDING' ? '#FEF3C7' : 
                                      quote.status === 'QUOTED' ? '#E0E7FF' :
                                      quote.status === 'ACCEPTED' ? '#D1FAE5' :
                                      '#FEE2E2',
                      color: quote.status === 'PENDING' ? '#92400E' : 
                            quote.status === 'QUOTED' ? '#3730A3' :
                            quote.status === 'ACCEPTED' ? '#065F46' :
                            '#991B1B',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontFamily: 'Inter',
                      fontWeight: 500
                    }}
                  >
                    {quote.status}
                  </span>
                  {quote.eventIsFlagged && (
                    <span
                      style={{
                        backgroundColor: '#FEE2E2',
                        color: '#DC2626',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontFamily: 'Inter',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 15C4 15 5 14 8 14C11 14 13 16 16 16C19 16 20 15 20 15V3C20 3 19 4 16 4C13 4 11 2 8 2C5 2 4 3 4 3V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M4 22V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Event Flagged
                    </span>
                  )}
                </div>
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #E5E7EB' }}>
                  <p
                    style={{
                      fontFamily: 'Inter',
                      fontSize: '12px',
                      color: '#616161',
                      margin: '4px 0'
                    }}
                  >
                    Location: <strong>{quote.eventLocation}</strong>
                  </p>
                  <p
                    style={{
                      fontFamily: 'Inter',
                      fontSize: '12px',
                      color: '#616161',
                      margin: '4px 0'
                    }}
                  >
                    Guests: <strong>{quote.numberOfGuests}</strong>
                  </p>
                  {quote.budgetRange && (
                    <p
                      style={{
                        fontFamily: 'Inter',
                        fontSize: '14px',
                        color: '#0B1A33',
                        margin: '4px 0',
                        fontWeight: 600
                      }}
                    >
                      Budget: {quote.budgetRange}
                    </p>
                  )}
                  {quote.finalPrice && (
                    <p
                      style={{
                        fontFamily: 'Inter',
                        fontSize: '14px',
                        color: '#059669',
                        margin: '4px 0',
                        fontWeight: 600
                      }}
                    >
                      Final Price: ${parseFloat(quote.finalPrice.toString()).toFixed(2)}
                    </p>
                  )}
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span 
                      onClick={(e) => {
                        e.stopPropagation();
                        openQuoteDetails(quote);
                      }}
                      style={{
                        fontFamily: 'Inter',
                        fontSize: '14px',
                        color: '#0B1A33',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      View Details →
                    </span>
                    <button
                      onClick={(e) => handleDeleteQuoteRequest(quote.id, quote.eventType || 'this quote request', e)}
                      disabled={deletingQuoteId === quote.id}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#EF4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'Inter',
                        fontWeight: 500,
                        cursor: deletingQuoteId === quote.id ? 'not-allowed' : 'pointer',
                        opacity: deletingQuoteId === quote.id ? 0.5 : 1,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (deletingQuoteId !== quote.id) {
                          e.currentTarget.style.backgroundColor = '#DC2626';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (deletingQuoteId !== quote.id) {
                          e.currentTarget.style.backgroundColor = '#EF4444';
                        }
                      }}
                    >
                      {deletingQuoteId === quote.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {selectedItem === 'notifications' && (
      <div
        style={{
          width: '100%',
          backgroundColor: 'white',
          borderRadius: '24px',
          padding: '30px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}
      >
        <div style={{ marginBottom: '24px' }}>
          <h3
            style={{
              fontFamily: 'Raleway',
              fontWeight: 600,
              fontSize: '32px',
              lineHeight: '100%',
              color: '#0B1A33',
              margin: 0,
              marginBottom: '8px'
            }}
          >
            Notifications
          </h3>
          <p
            style={{
              fontFamily: 'Raleway',
              fontWeight: 500,
              fontSize: '16px',
              lineHeight: '150%',
              color: '#616161',
              margin: 0
            }}
          >
            Bids, quotes, and work updates from vendors.
          </p>
        </div>
        {notificationsLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#616161' }}>Loading notifications...</div>
        ) : notificationsList.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: '#616161',
              fontFamily: 'Inter',
              fontSize: '16px'
            }}
          >
            No notifications yet. When a vendor bids, sends a quote, or submits work, you&apos;ll see it here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {notificationsList.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: n.read ? '#FAFAFA' : '#F0F9FF',
                  fontFamily: 'Inter',
                  position: 'relative'
                }}
              >
                <button
                  type="button"
                  onClick={(e) => deleteNotification(n.id, e)}
                  aria-label="Remove notification"
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'transparent',
                    color: '#9CA3AF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#EF4444';
                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#9CA3AF';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <div style={{ fontWeight: 600, fontSize: '16px', color: '#0B1A33', marginBottom: '4px', paddingRight: '28px' }}>
                  {n.title}
                </div>
                <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.5 }}>
                  {n.message}
                </div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <span>{new Date(n.createdAt).toLocaleString()}</span>
                  {(getNotificationViewUrl(n) || (n.title && String(n.title).toLowerCase().includes('work submitted'))) && (
                    <button
                      type="button"
                      onClick={async () => {
                        let url = getNotificationViewUrl(n);
                        if (url) {
                          window.location.href = url;
                          return;
                        }
                        if (n.title && String(n.title).toLowerCase().includes('work submitted')) {
                          try {
                            const backendUrl = resolveApiBaseUrlForNotifications();
                            const res = await fetch(`${backendUrl}/events/notifications/resolve-view-urls`, {
                              method: 'POST',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ notificationIds: [n.id] }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              url = data && data[n.id] ? data[n.id] : null;
                              if (url) {
                                setNotificationViewUrls((prev) => ({ ...prev, [n.id]: url }));
                                window.location.href = url;
                                return;
                              }
                            }
                            window.location.href = '/profile/my-events?tab=services';
                          } catch (_) {
                            window.location.href = '/profile/my-events?tab=services';
                          }
                        }
                      }}
                      style={{
                        fontFamily: 'Inter',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#2563EB',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 0'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.textDecoration = 'underline';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.textDecoration = 'none';
                      }}
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

        </div>
        {/* End Main Content Area */}

      </div>
      {/* End Profile Layout Container */}

      {/* Quote Request Details Modal - Same design as Service Bids */}
      {showQuoteDetailsModal && selectedQuoteRequest && (
        <div 
          className="fixed inset-0 bg-gray-50 z-50 overflow-auto"
          onClick={() => {
            setShowQuoteDetailsModal(false);
            setSelectedQuoteRequest(null);
            setQuoteWorkOrder(null);
          }}
        >
          <div className="min-h-screen" onClick={(e) => e.stopPropagation()}>
            {/* Header - Same as Service Bids */}
            <div className="bg-white border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                <button
                  onClick={() => {
                    setShowQuoteDetailsModal(false);
                    setSelectedQuoteRequest(null);
                    setQuoteWorkOrder(null);
                  }}
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
                  Quote Request Details
                </h1>
                <p 
                  className="text-gray-600 mt-2"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                >
                  Review and manage your quote request
                </p>
              </div>
            </div>

            {/* Content - Same card design as Service Bids */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="bg-white rounded border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 
                        className="text-base font-medium text-gray-900"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {selectedQuoteRequest.vendor?.businessName || 'Vendor'}
                      </h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        (selectedQuoteRequest.status === 'ACCEPTED' || selectedQuoteRequest.escrowLockedAt)
                          ? 'bg-green-100 text-green-700' 
                          : selectedQuoteRequest.status === 'REJECTED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {selectedQuoteRequest.escrowLockedAt ? 'PAID' : selectedQuoteRequest.status}
                      </span>
                      {selectedQuoteRequest.escrowLockedAt && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                          💰 Payment Authorized
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mb-2 text-sm text-gray-600">
                      <span>{selectedQuoteRequest.vendor?.category || 'N/A'}</span>
                      {selectedQuoteRequest.vendor?.averageRating && parseFloat(String(selectedQuoteRequest.vendor.averageRating)) > 0 && (
                        <span>
                          {parseFloat(String(selectedQuoteRequest.vendor.averageRating)).toFixed(1)} ({selectedQuoteRequest.vendor.totalReviews || 0})
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                      <div><strong>Event Type:</strong> {selectedQuoteRequest.eventType}</div>
                      <div><strong>Event Date:</strong> {new Date(selectedQuoteRequest.eventDate).toLocaleDateString()}</div>
                      <div><strong>Location:</strong> {selectedQuoteRequest.eventLocation}</div>
                      <div><strong>Guests:</strong> {selectedQuoteRequest.numberOfGuests}</div>
                      {selectedQuoteRequest.finalPriceDescription && (
                        <div className="mt-2">
                          <strong>Description:</strong> {selectedQuoteRequest.finalPriceDescription}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Created: {new Date(selectedQuoteRequest.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="text-right min-w-[120px]">
                    {selectedQuoteRequest.finalPrice && (
                      <div 
                        className="text-xl font-semibold text-gray-900 mb-1"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        ${parseFloat(selectedQuoteRequest.finalPrice.toString()).toFixed(2)}
                      </div>
                    )}
                    {selectedQuoteRequest.escrowLockedAt && (
                      <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded text-xs font-medium text-center border border-green-200 mb-2">
                        💰 Payment Authorized
                      </div>
                    )}
                    {selectedQuoteRequest.deliveryTime && (
                      <div className="text-xs text-gray-500 mb-3">
                        Delivery: {selectedQuoteRequest.deliveryTime}
                      </div>
                    )}
                    
                    {/* Actions - Same as Service Bids */}
                    {selectedQuoteRequest.status === 'QUOTED' && selectedQuoteRequest.finalPriceConfirmed && !selectedQuoteRequest.escrowLockedAt && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleAcceptQuote(selectedQuoteRequest.id)}
                          disabled={acceptingQuote || rejectingQuote}
                          className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {acceptingQuote ? 'Accepting...' : 'Accept'}
                        </button>
                        <button
                          onClick={() => handleRejectQuote(selectedQuoteRequest.id)}
                          disabled={rejectingQuote || acceptingQuote}
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          {rejectingQuote ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    )}
                    
                    {/* Show payment authorized status when escrow is locked */}
                    {selectedQuoteRequest.escrowLockedAt && !quoteWorkOrder && (
                      <div className="mt-3 space-y-2">
                        <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded text-xs font-medium text-center border border-green-200">
                          💰 Payment Authorized
                        </div>
                        <div className="text-xs text-gray-500 text-center">
                          Waiting for vendor to submit work...
                        </div>
                      </div>
                    )}
                    
                    {(selectedQuoteRequest.status === 'ACCEPTED' || selectedQuoteRequest.escrowLockedAt) && (() => {
                      const workOrder = quoteWorkOrder;
                      const paymentStatus = workOrder?.paymentStatus;
                      const workStatus = workOrder?.status;
                      const hasSubmittedWork = workStatus === 'SUBMITTED' || workStatus === 'REVISION_REQUESTED' || (workOrder && workOrder.submittedAt);
                      
                      return (
                        <div className="mt-3 space-y-2">
                          {hasSubmittedWork ? (
                            <button
                              onClick={async () => {
                                if (!workOrder) {
                                  await fetchQuoteWorkOrder(selectedQuoteRequest.id);
                                }
                                // Fetch work submission message
                                try {
                                  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3002' : `${window.location.origin}/api`);
                                  const messagesResponse = await fetch(`${backendUrl}/quote-requests/${selectedQuoteRequest.id}/messages`, {
                                    credentials: 'include'
                                  });
                                  if (messagesResponse.ok) {
                                    const messages = await messagesResponse.json();
                                    const submissionMessages = messages.filter((m: any) => m.messageType === 'WORK_SUBMISSION');
                                    const latestSubmission = submissionMessages.length > 0
                                      ? submissionMessages.sort(
                                          (a: any, b: any) =>
                                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                                        )[0]
                                      : null;
                                    setQuoteWorkSubmission(latestSubmission || null);
                                    setShowQuoteWorkModal(!!latestSubmission);
                                  }
                                } catch (error) {
                                  console.error('Error fetching work submission:', error);
                                }
                              }}
                              className="w-full px-4 py-2 text-white rounded text-sm font-medium transition-colors"
                              style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#0B1A33' }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0d1f3d'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0B1A33'}
                            >
                              👁️ View Work
                            </button>
                          ) : selectedQuoteRequest.escrowLockedAt ? (
                            /* Payment already authorized (escrow) – do not show Pay Vendor */
                            <div className="space-y-2">
                              <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded text-xs font-medium text-center border border-green-200">
                                💰 Paid (Held in Escrow)
                              </div>
                              <div className="text-xs text-gray-500 text-center">
                                Waiting for vendor to submit work...
                              </div>
                            </div>
                          ) : paymentStatus === 'PENDING' || !paymentStatus ? (
                            <button
                              onClick={() => handleAcceptQuote(selectedQuoteRequest.id)}
                              className="w-full px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 transition-colors"
                              style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                              💳 Pay Vendor
                            </button>
                          ) : paymentStatus === 'COMPLETED' ? (
                            <div className="space-y-2">
                              <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded text-xs font-medium text-center border border-green-200">
                                💰 Payment Completed
                              </div>
                              {hasSubmittedWork ? (
                                <button
                                  onClick={async () => {
                                    // Fetch work submission message
                                    try {
                                      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3002' : `${window.location.origin}/api`);
                                      const messagesResponse = await fetch(`${backendUrl}/quote-requests/${selectedQuoteRequest.id}/messages`, {
                                        credentials: 'include'
                                      });
                                      if (messagesResponse.ok) {
                                        const messages = await messagesResponse.json();
                                        const submissionMessages = messages.filter((m: any) => m.messageType === 'WORK_SUBMISSION');
                                        const latestSubmission = submissionMessages.length > 0
                                          ? submissionMessages.sort(
                                              (a: any, b: any) =>
                                                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                                            )[0]
                                          : null;
                                        setQuoteWorkSubmission(latestSubmission || null);
                                        setShowQuoteWorkModal(!!latestSubmission);
                                      }
                                    } catch (error) {
                                      console.error('Error fetching work submission:', error);
                                    }
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
                    
                    {selectedQuoteRequest.status === 'REJECTED' && (
                      <div className="mt-3 px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm font-medium text-center">
                        Rejected
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Modal */}
          {showQuotePaymentModal && selectedQuoteRequest && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1001,
                padding: '20px'
              }}
              onClick={() => setShowQuotePaymentModal(false)}
            >
              <div 
                style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '24px',
                  maxWidth: '500px',
                  width: '90%',
                  maxHeight: '90vh',
                  overflow: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', fontFamily: 'Raleway, sans-serif' }}>
                  Authorize Payment
                </h3>
                <Elements stripe={stripePromise}>
                  <QuoteAcceptanceCheckout
                    quoteId={selectedQuoteRequest.id}
                    quoteAmount={Number(selectedQuoteRequest.finalPrice || selectedQuoteRequest.quotePrice || 0)}
                    vendorName={selectedQuoteRequest.vendor?.businessName || 'Vendor'}
                    customerEmail={user?.email || ""}
                    onSuccess={async () => {
                      setShowQuotePaymentModal(false);
                      // Refresh quote requests to get updated status with escrowLockedAt
                      await fetchQuoteRequests();
                      // Update selected quote request with latest data
                      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3002' : `${window.location.origin}/api`);
                      try {
                        const response = await fetch(`${backendUrl}/quote-requests/my-requests`, {
                          credentials: 'include'
                        });
                        if (response.ok) {
                          const updatedRequests = await response.json();
                          const updatedRequest = updatedRequests.find((r: any) => r.id === selectedQuoteRequest.id);
                          if (updatedRequest) {
                            setSelectedQuoteRequest(updatedRequest);
                          }
                        }
                      } catch (error) {
                        console.error('Error fetching updated quote:', error);
                      }
                      await fetchQuoteWorkOrder(selectedQuoteRequest.id);
                      setNotification({ 
                        message: 'Payment authorized! Vendor can now start work.', 
                        type: 'success' 
                      });
                      setTimeout(() => setNotification(null), 4000);
                    }}
                    onCancel={() => setShowQuotePaymentModal(false)}
                  />
                </Elements>
              </div>
            </div>
          )}

          {/* Rating Modal - Same as Service Bids */}
          {showQuoteRatingModal && quoteWorkOrder && (
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
                zIndex: 1002,
                padding: '20px'
              }}
              onClick={() => {
                setShowQuoteRatingModal(false);
                setQuoteRating(0);
                setQuoteReviewText('');
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
                        onClick={() => setQuoteRating(star)}
                        style={{
                          fontSize: '32px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: star <= quoteRating ? '#fbbf24' : '#d1d5db'
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
                    value={quoteReviewText}
                    onChange={(e) => setQuoteReviewText(e.target.value)}
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
                      setShowQuoteRatingModal(false);
                      setQuoteRating(0);
                      setQuoteReviewText('');
                    }}
                    disabled={submittingQuoteRating}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: submittingQuoteRating ? 'not-allowed' : 'pointer',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAcceptWork}
                    disabled={submittingQuoteRating || quoteRating < 1}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: submittingQuoteRating || quoteRating < 1 ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: submittingQuoteRating || quoteRating < 1 ? 'not-allowed' : 'pointer',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  >
                    {submittingQuoteRating ? 'Submitting...' : 'Submit Rating'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View Work Modal - Same as Service Bids */}
          {/* Allow viewing work whenever we have a work order and a submission message,
              regardless of the current work order status (SUBMITTED, REVISION_REQUESTED, COMPLETED, etc.) */}
          {showQuoteWorkModal && quoteWorkOrder && quoteWorkSubmission && (
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
                setShowQuoteWorkModal(false);
                setQuoteWorkSubmission(null);
              }}
            >
              <div 
                style={{
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '24px',
                  maxWidth: '700px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflow: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937', fontFamily: 'Raleway, sans-serif', margin: 0 }}>
                      Submitted Work
                    </h2>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '12px',
                        color: '#6b7280',
                        fontFamily: 'Inter, sans-serif',
                        maxWidth: '480px',
                      }}
                    >
                      If you don&apos;t accept this work, request a revision, or request a refund
                      within 7 days, the work will be automatically accepted and the vendor will
                      be paid.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowQuoteWorkModal(false);
                      setQuoteWorkSubmission(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '24px',
                      color: '#6b7280',
                      padding: '8px'
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #10b981' }}>
                  <div style={{ fontWeight: '600', color: '#059669', marginBottom: '8px' }}>
                    📦 Work Submission
                  </div>
                  <div style={{ color: '#374151', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                    {quoteWorkSubmission.message}
                  </div>
                  {quoteWorkSubmission.attachments && quoteWorkSubmission.attachments.length > 0 && (
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
                          Attachments ({quoteWorkSubmission.attachments.length})
                        </strong>
                      </div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                        gap: '16px' 
                      }}>
                        {quoteWorkSubmission.attachments.map((attachment: string, i: number) => {
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
                {quoteWorkOrder.refundStatus === 'REFUNDED' && (
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
                    {quoteWorkOrder.refundResolvedAt && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                        Resolved on: {new Date(quoteWorkOrder.refundResolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                {quoteWorkOrder.refundStatus === 'REJECTED' && (
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
                    {quoteWorkOrder.refundResolvedAt && (
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
                        Resolved on: {new Date(quoteWorkOrder.refundResolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
                {quoteWorkOrder.refundStatus === 'REQUESTED' && (
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

                {/* For quotes: only show action buttons while work is submitted for review.
                    Once work is already accepted/completed (or a revision is pending), make this modal read-only.
                    After at least one revision cycle (revisionCount > 0), organizer should only see "Request Refund",
                    not another "Request Revision" option – same behavior as the service request flow. */}
                {quoteWorkOrder.status === 'SUBMITTED' && quoteWorkOrder.refundStatus !== 'REFUNDED' && quoteWorkOrder.refundStatus !== 'REJECTED' ? (
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {(!quoteWorkOrder.refundStatus || quoteWorkOrder.refundStatus === 'NONE') && (
                      <button
                        onClick={handleAcceptWorkClick}
                        style={{
                          flex: 1,
                          padding: '12px 24px',
                          backgroundColor: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '15px',
                          fontWeight: '600',
                        }}
                      >
                        Accept Work
                      </button>
                    )}
                    {/* If admin asked for proofs, organizer should add proofs instead of requesting again */}
                    {quoteWorkOrder.refundStatus === 'NEED_MORE_INFO' ? (
                      <button
                        onClick={() => {
                          setShowRefundProofModal(true);
                        }}
                        style={{
                          flex: 1,
                          padding: '12px 24px',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '15px',
                          fontWeight: '600',
                        }}
                      >
                        Add Proofs
                      </button>
                    ) : (quoteWorkOrder.revisionCount > 0 || localQuoteRevisionRequested[quoteWorkOrder.id]) && 
                        quoteWorkOrder.refundStatus !== 'REFUNDED' && 
                        quoteWorkOrder.refundStatus !== 'REJECTED' && 
                        quoteWorkOrder.refundStatus !== 'APPROVED' ? (
                      <button
                        onClick={async () => {
                          await handleRefundRequest(quoteWorkOrder);
                        }}
                        disabled={refundRequested[quoteWorkOrder.id] || quoteWorkOrder.refundStatus === 'REQUESTED'}
                        style={{
                          flex: 1,
                          padding: '12px 24px',
                          backgroundColor: (refundRequested[quoteWorkOrder.id] || quoteWorkOrder.refundStatus === 'REQUESTED') ? '#9ca3af' : '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: (refundRequested[quoteWorkOrder.id] || quoteWorkOrder.refundStatus === 'REQUESTED') ? 'not-allowed' : 'pointer',
                          fontSize: '15px',
                          fontWeight: '600',
                        }}
                      >
                        {(refundRequested[quoteWorkOrder.id] || quoteWorkOrder.refundStatus === 'REQUESTED') ? '✓ Requested' : '💰 Request Refund'}
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          handleRequestRevision(quoteWorkOrder.id);
                        }}
                        style={{
                          flex: 1,
                          padding: '12px 24px',
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '15px',
                          fontWeight: '600',
                        }}
                      >
                        Request Revision
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                      {quoteWorkOrder.status === 'CANCELLED' 
                        ? 'This work order has been cancelled due to refund.'
                        : 'This work has already been accepted. You can view the final submission here for your records.'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer - Full Width */}
      <div style={{ width: '100%' }}>
        <Footer />
      </div>

      {/* Refund proof modal */}
      {showRefundProofModal && quoteWorkOrder && (
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
                placeholder="Describe what went wrong, include screenshots links (e.g. Google Drive, Imgur) or any other proof."
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
                onClick={() => handleSubmitRefundProof(quoteWorkOrder.id)}
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

      {/* Delete Event Confirmation Modal */}
      {showDeleteEventModal && eventToDelete && (
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
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '400px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
          >
            <p
              style={{
                fontFamily: 'Inter',
                fontSize: '16px',
                color: '#1F2937',
                margin: '0 0 20px 0',
                textAlign: 'center'
              }}
            >
              Are you sure you want to delete "{eventToDelete.title}"? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteEventModal(false);
                  setEventToDelete(null);
                }}
                style={{
                  backgroundColor: 'transparent',
                  color: '#6B7280',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontFamily: 'Inter',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteEvent}
                disabled={deletingEvent}
                style={{
                  backgroundColor: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontFamily: 'Inter',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: deletingEvent ? 'not-allowed' : 'pointer',
                  opacity: deletingEvent ? 0.5 : 1
                }}
              >
                {deletingEvent ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Quote Request Confirmation Modal */}
      {showDeleteQuoteModal && quoteToDelete && (
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
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '400px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
          >
            <p
              style={{
                fontFamily: 'Inter',
                fontSize: '16px',
                color: '#1F2937',
                margin: '0 0 20px 0',
                textAlign: 'center'
              }}
            >
              Are you sure you want to delete this quote request? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteQuoteModal(false);
                  setQuoteToDelete(null);
                }}
                style={{
                  backgroundColor: 'transparent',
                  color: '#6B7280',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontFamily: 'Inter',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteQuoteRequest}
                disabled={deletingQuoteId === quoteToDelete.id}
                style={{
                  backgroundColor: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontFamily: 'Inter',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: deletingQuoteId === quoteToDelete.id ? 'not-allowed' : 'pointer',
                  opacity: deletingQuoteId === quoteToDelete.id ? 0.5 : 1
                }}
              >
                {deletingQuoteId === quoteToDelete.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Service Confirmation Modal */}
      {showDeleteServiceModal && serviceToDelete && (
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
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '400px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
            }}
          >
            <p
              style={{
                fontFamily: 'Inter',
                fontSize: '16px',
                color: '#1F2937',
                margin: '0 0 20px 0',
                textAlign: 'center'
              }}
            >
              Are you sure you want to delete "{serviceToDelete.name}"? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteServiceModal(false);
                  setServiceToDelete(null);
                }}
                style={{
                  backgroundColor: 'transparent',
                  color: '#6B7280',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontFamily: 'Inter',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteService}
                disabled={deletingServiceId === serviceToDelete.id}
                style={{
                  backgroundColor: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontFamily: 'Inter',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: deletingServiceId === serviceToDelete.id ? 'not-allowed' : 'pointer',
                  opacity: deletingServiceId === serviceToDelete.id ? 0.5 : 1
                }}
              >
                {deletingServiceId === serviceToDelete.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Service Modal */}
      {(selectedEventForService || editingService) && (
        <AddServiceModal
          isOpen={showAddServiceModal}
          onClose={() => {
            setShowAddServiceModal(false);
            setSelectedEventForService(null);
            setEditingService(null);
          }}
          onSave={handleServiceAdded}
          eventId={editingService ? editingService.eventId : (selectedEventForService || '')}
          serviceId={editingService?.id}
          initialData={editingService ? {
            title: editingService.title,
            description: editingService.description,
            category: editingService.category,
            budget: editingService.budget ? parseFloat(editingService.budget.toString()) : undefined,
            currency: editingService.currency || 'USD',
            postalCode: editingService.postalCode || ''
          } : undefined}
        />
      )}

      {/* Responsive CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        /* Desktop - Keep as is */
        @media (min-width: 1240px) {
          .sidebar-toggle-btn {
            display: none !important;
          }
          .sidebar-overlay {
            display: none !important;
          }
        }
        
        /* Tablet & Mobile - Slide-out sidebar */
        @media (max-width: 1239px) {
          /* Show menu button */
          .sidebar-toggle-btn {
            display: flex !important;
          }
          
          /* Show close button inside sidebar */
          .sidebar-close-btn {
            display: flex !important;
          }
          
          /* Sidebar slides in from left */
          aside {
            position: fixed !important;
            left: -320px !important;
            top: 0 !important;
            bottom: 0 !important;
            height: 100vh !important;
            border-radius: 0 !important;
            overflow-y: auto !important;
            transition: left 0.3s ease !important;
            box-shadow: 2px 0 12px rgba(0,0,0,0.1) !important;
          }
          
          /* When sidebar is open */
          aside.sidebar-open {
            left: 0 !important;
          }
          
          /* Show overlay when sidebar is open */
          .sidebar-overlay {
            display: block !important;
          }
          
          /* Main content takes full width */
          .min-h-screen > div[style*="display: flex"] {
            padding: 70px 20px 29px !important;
          }
        }
        
        /* Mobile specific adjustments */
        @media (max-width: 767px) {
          /* Container adjustments */
          .min-h-screen > div[style*="display: flex"] {
            flex-direction: column !important;
            padding: 70px 15px 15px !important;
            gap: 15px !important;
          }
          
          /* Cover photo smaller */
          .min-h-screen > div[style*="display: flex"] > div > div:first-child {
            height: 150px !important;
          }
          
          /* Profile overlay - keep horizontal, just adjust size */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(2) {
            padding: 15px !important;
            margin: -40px auto 15px !important;
            width: 95% !important;
            max-width: 95% !important;
          }
          
          /* Avatar slightly smaller */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(2) > div:first-child > div {
            width: 100px !important;
            height: 100px !important;
          }
          
          /* Name and email smaller text */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(2) h2 {
            font-size: 24px !important;
            line-height: 1.3 !important;
          }
          
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(2) p {
            font-size: 14px !important;
          }
          
          /* Events section responsive */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) {
            padding: 20px !important;
          }
          
          /* My Events Space responsive */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div {
            padding: 20px !important;
          }
          
          /* Search and filter row responsive */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div > div:first-child > div:last-child {
            flex-direction: column !important;
            gap: 12px !important;
            align-items: stretch !important;
          }
          
          /* Search input responsive */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div > div:first-child > div:last-child > div:first-child > input {
            width: 100% !important;
            max-width: 100% !important;
          }
          
          /* Filter button responsive */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div > div:first-child > div:last-child > div:last-child > button {
            width: 100% !important;
            max-width: 200px !important;
          }
          
          /* Event status buttons responsive */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div > div:nth-child(2) > div:first-child {
            flex-wrap: wrap !important;
            gap: 8px !important;
          }
          
          /* Filter buttons stack on mobile */
          .min-h-screen button {
            font-size: 14px !important;
          }
        }
        
        /* Extra small screens (below 443px) */
        @media (max-width: 443px) {
          /* Further reduce padding and spacing */
          .min-h-screen > div[style*="display: flex"] {
            padding: 60px 10px 10px !important;
            gap: 10px !important;
          }
          
          /* Cover photo even smaller */
          .min-h-screen > div[style*="display: flex"] > div > div:first-child {
            height: 120px !important;
          }
          
          /* Profile overlay more compact */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(2) {
            padding: 10px !important;
            margin: -30px auto 10px !important;
            width: 98% !important;
            max-width: 98% !important;
          }
          
          /* Avatar smaller */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(2) > div:first-child > div {
            width: 80px !important;
            height: 80px !important;
          }
          
          /* Text even smaller */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(2) h2 {
            font-size: 20px !important;
            line-height: 1.2 !important;
          }
          
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(2) p {
            font-size: 12px !important;
          }
          
          /* Events section more compact */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) {
            padding: 15px !important;
          }
          
          /* My Events Space more compact */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div {
            padding: 15px !important;
          }
          
          /* Search and filter more compact */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div > div:first-child > div:last-child {
            gap: 8px !important;
          }
          
          /* Filter button smaller */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div > div:first-child > div:last-child > div:last-child > button {
            max-width: 150px !important;
            font-size: 12px !important;
            padding: 8px 12px !important;
          }
          
          /* Event status buttons more compact */
          .min-h-screen > div[style*="display: flex"] > div > div:nth-child(3) > div > div:nth-child(2) > div:first-child {
            gap: 6px !important;
          }
          
          /* All buttons smaller */
          .min-h-screen button {
            font-size: 12px !important;
            padding: 6px 10px !important;
          }
          
          /* Menu button smaller */
          .sidebar-toggle-btn {
            width: 40px !important;
            height: 40px !important;
            top: 15px !important;
            left: 15px !important;
          }
        }
      `}} />

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

      {/* Flag Reason Modal */}
      {showFlagModal && selectedFlaggedEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => {
            setShowFlagModal(false);
            setSelectedFlaggedEvent(null);
            setFlagData(null);
            setUnflagRequestReason('');
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'Raleway', fontSize: '24px', fontWeight: 600, marginBottom: '20px', color: '#0B1A33' }}>
              Event Flagged
            </h3>
            
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontFamily: 'Raleway', fontSize: '14px', color: '#616161', marginBottom: '8px' }}>
                <strong>Event:</strong> {selectedFlaggedEvent.title}
              </p>
              {flagData?.flagReason && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ fontFamily: 'Raleway', fontSize: '14px', fontWeight: 600, color: '#DC2626', marginBottom: '8px' }}>
                    Reason for Flagging:
                  </p>
                  <p style={{ fontFamily: 'Raleway', fontSize: '14px', color: '#0B1A33' }}>
                    {flagData.flagReason}
                  </p>
                  {flagData.flaggedAt && (
                    <p style={{ fontFamily: 'Raleway', fontSize: '12px', color: '#616161', marginTop: '8px' }}>
                      Flagged on: {new Date(flagData.flaggedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
              
              {flagData?.unflagRequestStatus === 'PENDING' && (
                <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ fontFamily: 'Raleway', fontSize: '14px', color: '#92400E' }}>
                    Your unflag request is pending admin review.
                  </p>
                </div>
              )}
              
              {flagData?.unflagRequestStatus === 'REJECTED' && (
                <div style={{ backgroundColor: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ fontFamily: 'Raleway', fontSize: '14px', color: '#DC2626' }}>
                    Your unflag request was rejected by admin.
                  </p>
                </div>
              )}
              
              {(!flagData?.unflagRequestStatus || flagData?.unflagRequestStatus === 'REJECTED') && (
                <div>
                  <label style={{ display: 'block', fontFamily: 'Raleway', fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#0B1A33' }}>
                    Request Unflag (provide reason):
                  </label>
                  <textarea
                    value={unflagRequestReason}
                    onChange={(e) => setUnflagRequestReason(e.target.value)}
                    placeholder="Explain why this event should be unflagged..."
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      padding: '12px',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                      fontFamily: 'Raleway',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                  />
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowFlagModal(false);
                  setSelectedFlaggedEvent(null);
                  setFlagData(null);
                  setUnflagRequestReason('');
                }}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  backgroundColor: 'white',
                  color: '#0B1A33',
                  fontFamily: 'Raleway',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              {(!flagData?.unflagRequestStatus || flagData?.unflagRequestStatus === 'REJECTED') && (
                <button
                  onClick={handleRequestUnflag}
                  disabled={requestingUnflag || !unflagRequestReason.trim()}
                  style={{
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: requestingUnflag || !unflagRequestReason.trim() ? '#9CA3AF' : '#0B1A33',
                    color: 'white',
                    fontFamily: 'Raleway',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: requestingUnflag || !unflagRequestReason.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {requestingUnflag ? 'Submitting...' : 'Request Unflag'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
    </>
  );
}

export default function MyEventsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MyEventsPageContent />
    </Suspense>
  );
}