"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRoleContext } from "../../../components/RoleContext";
import { useRouter } from "next/navigation";
import { Footer } from "../../../components/TrustFooter";
import BidNotification from "../../../components/BidNotification";
import VendorDashboardTopBar from "../../../components/VendorDashboardTopBar";
import { getAuthHeaders, shouldSkipAuthCheck } from "@/lib/auth-utils";
import { resolveApiBaseUrl } from "@/lib/api-base";

function getApiBase(): string {
  return resolveApiBaseUrl();
}

// Sophisticated Dashboard Components
function StatCard({ title, value, icon, trend, trendValue, isWarning, cardType }: {
  title: string;
  value: number;
  icon: React.ReactNode;
  trend?: 'up' | 'down';
  trendValue?: string;
  isWarning?: boolean;
  cardType?: 'services' | 'requests' | 'default';
}) {
  // Determine background based on card type
  const getBackground = () => {
    if (isWarning) return 'linear-gradient(145deg, #ffffff 0%, #fef2f2 100%)';
    if (cardType === 'services') return 'linear-gradient(145deg, #ffffff 0%, #f0fdf4 100%)'; // subtle green
    if (cardType === 'requests') return 'linear-gradient(145deg, #ffffff 0%, #fffbeb 100%)'; // subtle yellow
    return 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)';
  };

  const getBorder = () => {
    if (isWarning) return '1px solid rgba(239, 68, 68, 0.15)';
    if (cardType === 'services') return '1px solid rgba(34, 197, 94, 0.2)'; // green border
    if (cardType === 'requests') return '1px solid rgba(234, 179, 8, 0.2)'; // yellow border
    return '1px solid rgba(203, 213, 225, 0.4)';
  };

  return (
    <div className="relative overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 group cursor-pointer"
         style={{
           background: getBackground(),
           border: getBorder(),
           boxShadow: isWarning
             ? '0 4px 20px rgba(239, 68, 68, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)'
             : '0 4px 20px rgba(100, 116, 139, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)'
         }}>
      
      {/* Decorative gradient overlay on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
           style={{
             background: isWarning 
               ? 'linear-gradient(145deg, rgba(254, 242, 242, 0.5) 0%, rgba(254, 226, 226, 0.5) 100%)'
               : 'linear-gradient(145deg, rgba(248, 250, 252, 0.5) 0%, rgba(241, 245, 249, 0.5) 100%)'
           }}></div>
      
      <div className="relative z-10 p-6">
        {/* Top section: Icon and Trend Badge */}
        <div className="flex items-start justify-between mb-5">
          <div className={`p-4 rounded-xl shadow-md transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg ${
            isWarning 
              ? 'bg-gradient-to-br from-red-500 to-red-600' 
              : 'bg-gradient-to-br from-slate-700 to-slate-800'
          }`}>
            <div className="text-white">
              {icon}
            </div>
          </div>
          {trend && (
            <div className={`flex items-center text-xs font-bold px-3 py-1.5 rounded-full shadow-sm ${
              trend === 'up' 
                ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-700 border border-green-200' 
                : 'bg-gradient-to-r from-red-50 to-red-100 text-red-700 border border-red-200'
            }`} style={{ display: 'none' }}>
              {trend === 'up' ? (
                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
              )}
              <span>{trendValue}</span>
            </div>
          )}
        </div>
        
        {/* Bottom section: Value and Title */}
        <div className="space-y-2">
          <p className="text-4xl font-extrabold tracking-tight"
             style={{ 
               color: isWarning ? '#dc2626' : (cardType === 'services' ? '#064e3b' : cardType === 'requests' ? '#ca8a04' : '#1e293b'),
               fontFamily: 'Raleway, sans-serif'
             }}>
            {value.toLocaleString()}
          </p>
          <p className="text-sm font-semibold uppercase tracking-wide"
             style={{ 
               color: isWarning ? '#991b1b' : (cardType === 'services' ? '#065f46' : cardType === 'requests' ? '#a16207' : '#475569'),
               letterSpacing: '0.05em'
             }}>
            {title}
          </p>
        </div>
      </div>
      
      {/* Subtle bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
           style={{
             background: isWarning 
               ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
               : cardType === 'services'
               ? 'linear-gradient(90deg, #059669 0%, #047857 100%)'
               : cardType === 'requests'
               ? 'linear-gradient(90deg, #eab308 0%, #ca8a04 100%)'
               : 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)'
           }}></div>
    </div>
  );
}

function QuickActionCard({ title, description, href, icon, buttonText }: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  buttonText: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:scale-105 group"
         style={{
           background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
           border: '1px solid rgba(148, 163, 184, 0.2)',
           boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)'
         }}>
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5"
           style={{
             backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23334155' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
           }}></div>
      
      <div className="relative z-10 flex items-start space-x-4">
        <div className="p-4 bg-gradient-to-br from-slate-600 to-slate-700 text-white rounded-xl shadow-lg">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-slate-800 mb-2" style={{ fontFamily: 'Raleway, sans-serif' }}>
            {title}
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            {description}
          </p>
          <Link
            href={href}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black text-sm font-bold rounded-xl hover:from-yellow-300 hover:to-yellow-400 transition-all duration-200 shadow-lg transform hover:scale-105"
          >
            {buttonText}
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

function RecentActivity() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const handleDismissActivity = async (activityId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the activity click
    
    // If it's a service-created activity (from services list, not a notification), just remove from UI
    if (activityId.startsWith('service-created-')) {
      setActivities(prev => prev.filter(activity => activity.id !== activityId));
      return;
    }
    
    // For notifications, delete from backend
    setDismissingId(activityId);
    try {
      const response = await fetch(`${getApiBase()}/vendors/notifications/${activityId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        // Remove from local state
        setActivities(prev => prev.filter(activity => activity.id !== activityId));
      } else {
        console.error('Failed to delete notification');
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    } finally {
      setDismissingId(null);
    }
  };

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const past = new Date(date);
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minute${Math.floor(diffInSeconds / 60) > 1 ? 's' : ''} ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hour${Math.floor(diffInSeconds / 3600) > 1 ? 's' : ''} ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} day${Math.floor(diffInSeconds / 86400) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffInSeconds / 604800)} week${Math.floor(diffInSeconds / 604800) > 1 ? 's' : ''} ago`;
  };

  const getActivityIcon = (type: string, metadata?: any) => {
    switch (type) {
      case 'BID_ACCEPTED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'BID_SUBMITTED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'WORK_ACCEPTED':
      case 'PAYMENT_RECEIVED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'RATING_RECEIVED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        );
      case 'PACKAGE_CREATED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'PACKAGE_DELETED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        );
      case 'QUOTE_REQUEST':
      case 'QUOTE_SUBMITTED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'BID_ACCEPTED':
        return '#10B981'; // green
      case 'BID_SUBMITTED':
        return '#3B82F6'; // blue
      case 'WORK_ACCEPTED':
      case 'PAYMENT_RECEIVED':
        return '#F59E0B'; // amber
      case 'RATING_RECEIVED':
        return '#8B5CF6'; // purple
      case 'PACKAGE_CREATED':
        return '#3B82F6'; // blue
      case 'PACKAGE_DELETED':
        return '#EF4444'; // red
      case 'QUOTE_REQUEST':
      case 'QUOTE_SUBMITTED':
        return '#06B6D4'; // cyan
      default:
        return '#6B7280'; // gray
    }
  };

  const parseActivity = (notification: any) => {
    // Parse metadata if it's a string (JSON)
    let metadata = notification.metadata || {};
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch (e) {
        console.error('Failed to parse metadata:', e);
        metadata = {};
      }
    }
    
    const type = metadata.type || notification.type;
    
    let message = notification.message || notification.title || 'New activity';
    let activityType = type || 'UNKNOWN';

    // Parse different notification types
    if (metadata.type === 'PACKAGE_CREATED') {
      activityType = 'PACKAGE_CREATED';
      message = notification.message || `Package "${metadata.serviceName || 'package'}" was created`;
    } else if (metadata.type === 'PACKAGE_DELETED') {
      activityType = 'PACKAGE_DELETED';
      message = notification.message || `Package "${metadata.serviceName || 'package'}" was deleted`;
    } else if (metadata.type === 'BID_SUBMITTED') {
      activityType = 'BID_SUBMITTED';
      message = notification.message || `You submitted a bid of ${metadata.currency || 'USD'} ${metadata.bidAmount || ''} for "${metadata.serviceTitle || 'service'}"`;
    } else if (metadata.type === 'QUOTE_SUBMITTED') {
      activityType = 'QUOTE_SUBMITTED';
      message = notification.message || `You submitted a quote of $${metadata.quotePrice || ''} for ${metadata.customerName || 'customer'}'s request`;
    } else if (notification.title?.includes('Bid Accepted')) {
      activityType = 'BID_ACCEPTED';
      message = notification.message || `Your bid for "${metadata.serviceTitle || 'service'}" was accepted`;
    } else if (notification.title?.includes('Payment Received') || notification.title?.includes('Work Accepted')) {
      activityType = metadata.type === 'WORK_ACCEPTED' ? 'WORK_ACCEPTED' : 'PAYMENT_RECEIVED';
      if (metadata.rating) {
        message = `Work accepted with ${metadata.rating}-star rating${metadata.paymentStatus === 'COMPLETED' ? ' - Payment received!' : ''}`;
      } else {
        message = notification.message || 'Work accepted and payment received';
      }
    } else if (metadata.rating) {
      activityType = 'RATING_RECEIVED';
      message = `Received ${metadata.rating}-star rating${metadata.review ? `: "${metadata.review.substring(0, 50)}${metadata.review.length > 50 ? '...' : ''}"` : ''}`;
    }
    
    // Fallback: if no specific type found, use the notification title/message
    if (activityType === 'UNKNOWN' || !activityType) {
      activityType = notification.type || 'INFO';
      message = notification.message || notification.title || 'New activity';
    }

    return {
      id: notification.id,
      type: activityType,
      message,
      time: formatTimeAgo(notification.createdAt),
      createdAt: notification.createdAt,
      icon: getActivityIcon(activityType, metadata),
      color: getActivityColor(activityType),
      metadata
    };
  };

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        // Fetch all notifications
        const notificationsRes = await fetch(`${getApiBase()}/vendors/notifications`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        
        let allActivities: any[] = [];
        const notificationServiceIds = new Set<string>();
        
        if (notificationsRes.ok) {
          const notifications = await notificationsRes.json();
          console.log('📋 Fetched notifications:', notifications.length);
          
          // Parse all notifications
          allActivities = notifications.map((n: any) => {
            const parsed = parseActivity(n);
            // Track which services have notifications
            if (parsed.metadata?.serviceId) {
              notificationServiceIds.add(parsed.metadata.serviceId);
            }
            return parsed;
          });
          console.log('📋 Parsed activities from notifications:', allActivities.length);
        } else {
          console.error('Failed to fetch notifications:', notificationsRes.status);
        }

        // Fetch all services to create activities for ones without notifications
        const servicesRes = await fetch(`${getApiBase()}/vendors/services`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        
        if (servicesRes.ok) {
          const services = await servicesRes.json();
          console.log('📦 Fetched services:', services.length);
          
          // Create activities for services that don't have creation notifications
          const serviceActivities = services
            .filter((s: any) => !notificationServiceIds.has(s.id))
            .map((s: any) => ({
              id: `service-created-${s.id}`,
              type: 'PACKAGE_CREATED',
              message: `Package "${s.name}" was created`,
              time: formatTimeAgo(s.createdAt),
              createdAt: s.createdAt,
              icon: getActivityIcon('PACKAGE_CREATED'),
              color: getActivityColor('PACKAGE_CREATED'),
              metadata: { serviceId: s.id, serviceName: s.name }
            }));
          
          allActivities = [...allActivities, ...serviceActivities];
          console.log('📦 Added service activities:', serviceActivities.length);
        }

        // Sort by date (newest first) - show ALL activities, not just 20
        allActivities.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        });

        // Show all activities (or limit to 50 if there are too many)
        setActivities(allActivities.slice(0, 50));
        console.log('✅ Final activities count:', allActivities.slice(0, 50).length);
      } catch (error) {
        console.error('Error fetching activities:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchActivities, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          .recent-activity-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .recent-activity-scroll::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 10px;
          }
          .recent-activity-scroll::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 10px;
          }
          .recent-activity-scroll::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
        `
      }} />
      <div className="relative overflow-hidden rounded-2xl p-6"
           style={{
             background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
             border: '1px solid rgba(148, 163, 184, 0.2)',
             boxShadow: '0 10px 25px rgba(0, 0, 0, 0.08)'
           }}>
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5"
             style={{
               backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23334155' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
             }}></div>
        
        <div className="relative z-10">
        <h3 className="text-xl font-bold text-slate-800 mb-6" style={{ fontFamily: 'Raleway, sans-serif' }}>
          Recent Activity
        </h3>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-sm text-gray-600">Loading activities...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-600">No recent activities</p>
          </div>
        ) : (
          <div 
            className="space-y-4 overflow-y-auto pr-2 recent-activity-scroll"
            style={{
              maxHeight: '500px',
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e1 #f1f5f9'
            }}
          >
            {activities.map((activity) => (
              <div key={activity.id} className="relative flex items-start space-x-4 p-4 rounded-xl transition-all duration-200 hover:scale-105 cursor-pointer group"
                   style={{ background: 'rgba(148, 163, 184, 0.05)' }}>
                <div className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 shadow-lg"
                     style={{ backgroundColor: `${activity.color}20`, border: `2px solid ${activity.color}40` }}>
                  <div style={{ color: activity.color }}>
                    {activity.icon}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {activity.message}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    {activity.time}
                  </p>
                </div>
                <div className="w-3 h-3 rounded-full shadow-sm flex-shrink-0" style={{ backgroundColor: activity.color }}></div>
                {/* Dismiss Button */}
                <button
                  onClick={(e) => handleDismissActivity(activity.id, e)}
                  disabled={dismissingId === activity.id}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Inter, sans-serif' }}
                  aria-label="Dismiss activity"
                  title="Dismiss"
                >
                  {dismissingId === activity.id ? (
                    <svg className="w-3.5 h-3.5 text-gray-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </>
  );
}

export default function VendorDashboard() {
  const { isAuthenticated, user, authChecked, checkAuth } = useRoleContext();
  const router = useRouter();
  const [stats, setStats] = useState<{ 
    services: number; 
    requests: number; 
    quoteRequests: number; 
    pendingDocs: number;
    averageRating?: number;
    totalReviews?: number;
    totalBids?: number;
    completedJobs?: number;
    winRate?: number;
    monthlyRevenue?: number;
  }>({ 
    services: 0, 
    requests: 0, 
    quoteRequests: 0, 
    pendingDocs: 0,
    averageRating: 0,
    totalReviews: 0,
    totalBids: 0,
    completedJobs: 0,
    winRate: 0,
    monthlyRevenue: 0
  });
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBidNotifications, setShowBidNotifications] = useState(false);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Fetch unread notification count
  const fetchUnreadCount = async () => {
    if (!user?.id) return;
    
    try {
      console.log('🔔 Dashboard: Fetching unread count...');
      const response = await fetch(`${getApiBase()}/vendors/notifications/unread-count`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      
      console.log('🔔 Dashboard: Unread count response status:', response.status);
      
      if (!response.ok) {
        console.log('❌ Dashboard: Unread count API response not OK:', response.status);
        setUnreadCount(0);
        return;
      }
      
      const text = await response.text();
      console.log('🔔 Dashboard: Raw unread count response:', text);
      
      if (!text || text.trim() === '') {
        console.log('❌ Dashboard: Empty unread count response received');
        setUnreadCount(0);
        return;
      }
      
      const data = JSON.parse(text);
      console.log('🔔 Dashboard: Unread count data:', data);
      const count = typeof data === 'number' ? data : 0;
      setUnreadCount(count);
    } catch (error) {
      console.error('❌ Dashboard: Error fetching unread count:', error);
      setUnreadCount(0);
    }
  };

  // Authentication check and redirect handling
  useEffect(() => {
    if (!authChecked) {
      return;
    }

    const justLoggedIn =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('vendor_login_success') === '1';

    if (justLoggedIn && isAuthenticated && user?.role === 'VENDOR') {
      sessionStorage.removeItem('vendor_login_success');
    } else if (justLoggedIn && (!isAuthenticated || user?.role !== 'VENDOR')) {
      if (!shouldSkipAuthCheck()) {
        checkAuth();
      }
      return;
    }

    if (!justLoggedIn && (!isAuthenticated || user?.role !== 'VENDOR')) {
      router.replace('/vendor/auth/login');
      return;
    }

    const redirectUrl =
      sessionStorage.getItem('vendor_redirect_after_login') ||
      sessionStorage.getItem('vendor_redirect_after_onboarding');

    if (redirectUrl) {
      sessionStorage.removeItem('vendor_redirect_after_login');
      sessionStorage.removeItem('vendor_redirect_after_onboarding');
      console.log('Redirecting to:', redirectUrl);
      window.location.replace(redirectUrl);
    }
  }, [isAuthenticated, user, router, authChecked, checkAuth]);

  // Claim external (OSM) vendor listing if user signed up via claim link
  useEffect(() => {
    if (!authChecked || !isAuthenticated || user?.role !== 'VENDOR' || typeof window === 'undefined') return;
    const claimToken = sessionStorage.getItem('vendor_claim_token');
    if (!claimToken) return;
    (async () => {
      try {
        const res = await fetch(`${getApiBase()}/vendors/claim-external`, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({ claimToken }),
        });
        if (res.ok) {
          console.log('External vendor listing claimed successfully');
        }
      } catch (e) {
        console.warn('Claim external vendor failed:', e);
      } finally {
        sessionStorage.removeItem('vendor_claim_token');
      }
    })();
  }, [authChecked, isAuthenticated, user?.role]);

  // Fetch dashboard stats - optimized single API call
  useEffect(() => {
    if (!authChecked || !isAuthenticated || user?.role !== 'VENDOR') {
      return;
    }
    
    (async () => {
      try {
        console.log('Dashboard: Fetching optimized stats...');
        const response = await fetch(`${getApiBase()}/vendors/dashboard-stats`, { 
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        
        if (response.ok) {
          const statsData = await response.json();
          console.log('Dashboard: Optimized stats data:', statsData);
          setStats(statsData);
        } else {
          console.error('Dashboard: Failed to fetch stats:', response.status);
          setStats({ services: 0, requests: 0, quoteRequests: 0, pendingDocs: 0, averageRating: 0, totalReviews: 0, totalBids: 0, completedJobs: 0, winRate: 0, monthlyRevenue: 0 });
        }
      } catch (error) {
        console.error('Dashboard: Error fetching stats:', error);
        setStats({ services: 0, requests: 0, quoteRequests: 0, pendingDocs: 0, averageRating: 0, totalReviews: 0, totalBids: 0, completedJobs: 0, winRate: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, user, authChecked]);

  // Fetch recent payments
  const fetchRecentPayments = async () => {
    console.log('🔄 DASHBOARD REVENUE - Fetching recent payments...');
    setLoadingPayments(true);
    try {
      const response = await fetch(`${getApiBase()}/work-orders/vendor/my-orders`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      
      console.log('📥 DASHBOARD REVENUE - Response status:', response.status);
      
      if (response.ok) {
        const workOrders = await response.json();
        console.log('📦 DASHBOARD REVENUE - Received work orders:', {
          total: workOrders.length,
          workOrders: workOrders.map((wo: any) => ({
            id: wo.id,
            status: wo.status,
            paymentStatus: wo.paymentStatus,
            paymentIntentId: wo.paymentIntentId,
            completedAt: wo.completedAt
          }))
        });
        
        // Filter for completed work orders with payment status COMPLETED
        // IMPORTANT: Only show payments where BOTH status is COMPLETED (work accepted) AND paymentStatus is COMPLETED (payment captured)
        // Payment should only be shown as "Paid" when organizer has accepted the work
        const paidWorkOrders = workOrders
          .filter((wo: any) => 
            wo.status === 'COMPLETED' && // Work must be accepted
            wo.paymentStatus === 'COMPLETED' && // Payment must be captured
            wo.paymentIntentId // Must have payment intent
          )
          .sort((a: any, b: any) => {
            const dateA = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.updatedAt).getTime();
            const dateB = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.updatedAt).getTime();
            return dateB - dateA;
          })
          .slice(0, 10); // Get latest 10 payments
        
        console.log('✅ DASHBOARD REVENUE - Filtered paid work orders:', {
          count: paidWorkOrders.length,
          payments: paidWorkOrders.map((wo: any) => {
            let amount = 0;
            if (wo.serviceBid?.bidAmount) {
              amount = wo.serviceBid.bidAmount;
            } else if (wo.quoteRequest) {
              // Prioritize finalPrice, then counterOfferPrice, then quotePrice (same as backend)
              amount = wo.quoteRequest.finalPrice 
                || wo.quoteRequest.counterOfferPrice 
                || wo.quoteRequest.quotePrice 
                || 0;
            }
            return {
            id: wo.id,
              amount,
            paymentIntentId: wo.paymentIntentId,
            completedAt: wo.completedAt
            };
          })
        });
        
        setRecentPayments(paidWorkOrders);
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('❌ DASHBOARD REVENUE - Failed to fetch:', {
          status: response.status,
          error: errorText
        });
      }
    } catch (error) {
      console.error('❌ DASHBOARD REVENUE - Error:', error);
    } finally {
      setLoadingPayments(false);
      console.log('✅ DASHBOARD REVENUE - Fetch completed');
    }
  };

  // Fetch notifications when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      fetchUnreadCount();
      fetchRecentPayments();
      
      // Set up periodic refresh
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, 30000); // Check every 30 seconds

      return () => clearInterval(interval);
    }
  }, [isAuthenticated, user?.id]);

  // If not authenticated or not a vendor, don't render anything
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
          <p className="text-gray-600 font-medium text-lg">
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }
  
  // If not authenticated or not a vendor, don't render anything (will redirect)
  if (!isAuthenticated || user?.role !== 'VENDOR') {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
          <p className="text-gray-600 font-medium text-lg">
            Loading dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-hidden" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
      {/* Reusable top bar used across vendor dashboard & add-package pages */}
      <VendorDashboardTopBar
        unreadCount={unreadCount}
        onOpenBidNotifications={() => setShowBidNotifications(true)}
      />

      {/* Main Dashboard Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <StatCard
            title="Active Packages"
            value={stats.services}
            cardType="services"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            trend="up"
            trendValue="+12%"
          />
          <StatCard
            title="Quote Requests"
            value={stats.quoteRequests}
            cardType="requests"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            trend="up"
            trendValue="+15%"
          />
          <div style={{ display: 'none' }}>
            <StatCard
              title="Booking Requests"
              value={stats.requests}
              cardType="requests"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              trend="up"
              trendValue="+8%"
            />
          </div>
          <StatCard
            title="Pending Documents"
            value={stats.pendingDocs}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
            isWarning={true}
          />
        </div>

        {/* Actions and Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Quick Actions */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-6" style={{ fontFamily: 'Raleway, sans-serif' }}>
              Quick Actions
            </h2>
            <div className="space-y-4">
              <QuickActionCard
                title="Manage Packages"
                description="View, edit, and organize your package offerings"
                href="/vendor/services"
                buttonText="View Packages"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                }
              />
              <QuickActionCard
                title="Payouts & Withdrawals"
                description="Withdraw your earnings and manage payouts"
                href="/vendor/payouts"
                buttonText="View Payouts"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              <QuickActionCard
                title="Review Requests"
                description="Check and respond to new quote and booking requests"
                href="/vendor/requests"
                buttonText="View Requests"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
            </div>
          </div>

          {/* Activity Feed */}
          <RecentActivity />
        </div>

        {/* Performance Overview */}
        <div className="bg-white rounded-xl p-8 shadow-sm" style={{ border: '3px solid rgba(100, 140, 200, 0.28)' }}>
          <h3 className="text-2xl font-bold text-gray-900 mb-8">
            Performance Overview
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center p-6 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {stats.averageRating ? stats.averageRating.toFixed(1) : '0.0'}
              </div>
              <div className="text-sm font-medium text-gray-600 mb-2">
                Average Rating
              </div>
              <div className="flex justify-center mb-1">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className={`w-4 h-4 ${i < Math.floor(stats.averageRating || 0) ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <div className="text-xs text-gray-500">
                {stats.totalReviews || 0} {stats.totalReviews === 1 ? 'review' : 'reviews'}
              </div>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {stats.winRate ? `${stats.winRate}%` : '0%'}
              </div>
              <div className="text-sm font-medium text-gray-600 mb-2">
                Win Rate
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-600 h-2 rounded-full" style={{ width: `${Math.min(stats.winRate || 0, 100)}%` }}></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.completedJobs || 0} / {stats.totalBids || 0} completed
              </div>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                ${stats.monthlyRevenue ? stats.monthlyRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
              </div>
              <div className="text-sm font-medium text-gray-600 mb-2">
                Monthly Revenue
              </div>
              <div className="text-xs text-gray-500">From completed & paid work</div>
            </div>
            <div className="text-center p-6 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                24
              </div>
              <div className="text-sm font-medium text-gray-600 mb-2">
                Completed Events
              </div>
              <div className="text-xs text-green-600 font-semibold">+6 this month</div>
          </div>
          </div>
        </div>

        {/* Revenue Section */}
        <div className="bg-white rounded-xl p-8 shadow-sm mt-8" style={{ border: '3px solid rgba(100, 140, 200, 0.28)' }}>
          <h3 className="text-2xl font-bold text-gray-900 mb-6" style={{ fontFamily: 'Raleway, sans-serif' }}>
            💰 Revenue & Payments
          </h3>
          {loadingPayments ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Loading payments...</p>
            </div>
          ) : recentPayments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                No completed payments yet. Payments will appear here once work is completed and paid.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentPayments.map((payment: any) => {
                let amount = 0;
                if (payment.serviceBid?.bidAmount) {
                  amount = parseFloat(payment.serviceBid.bidAmount.toString());
                } else if (payment.quoteRequest) {
                  // Prioritize finalPrice, then counterOfferPrice, then quotePrice (same as backend)
                  const finalPrice = payment.quoteRequest.finalPrice ? parseFloat(payment.quoteRequest.finalPrice.toString()) : null;
                  const counterOfferPrice = payment.quoteRequest.counterOfferPrice ? parseFloat(payment.quoteRequest.counterOfferPrice.toString()) : null;
                  const quotePrice = payment.quoteRequest.quotePrice ? parseFloat(payment.quoteRequest.quotePrice.toString()) : null;
                  amount = finalPrice || counterOfferPrice || quotePrice || 0;
                }
                const currency = payment.serviceBid?.currency || payment.quoteRequest?.currency || 'USD';
                const serviceName = payment.serviceBid?.eventService?.title || 'Service';
                const quoteEvent = payment.quoteRequest?.eventType || 'Quote Request';
                
                return (
                  <div
                    key={payment.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>
                              {payment.serviceBid ? serviceName : quoteEvent}
                            </div>
                            <div className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                              {payment.organizer?.firstName} {payment.organizer?.lastName}
                            </div>
                          </div>
                        </div>
                        {payment.paymentIntentId && (
                          <div className="text-xs text-gray-500 mt-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Payment ID: {payment.paymentIntentId}
                          </div>
                        )}
                        {payment.completedAt && (
                          <div className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Completed: {new Date(payment.completedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-green-600 mb-1" style={{ fontFamily: 'Raleway, sans-serif' }}>
                          {currency} {amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-green-600 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                          💰 Paid
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <Footer />

      {/* Vendor Message Icon */}
      <div 
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          cursor: 'pointer',
          display: 'none'
        }}
        onClick={() => {
          // Navigate to requests page where the full chat functionality is available
          window.location.href = '/vendor/requests';
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
        </div>
      </div>
      
      {/* Bid Notifications Modal */}
      <BidNotification 
        isOpen={showBidNotifications} 
        onClose={() => setShowBidNotifications(false)} 
      />
    </div>
  );
}


