"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRoleContext } from "../../../components/RoleContext";
import { useRouter } from "next/navigation";
import { Footer } from "../../../components/TrustFooter";
import VendorDashboardTopBar from "../../../components/VendorDashboardTopBar";
import { getAuthHeaders } from "@/lib/auth-utils";

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

export default function VendorServicesPage() {
  const { isAuthenticated, user } = useRoleContext();
  const router = useRouter();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<{ id: string; name: string } | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Authentication check
  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'VENDOR') {
      router.replace('/vendor/auth/login');
      return;
    }
  }, [isAuthenticated, user, router]);

  // If not authenticated or not a vendor, don't render anything
  if (!isAuthenticated || user?.role !== 'VENDOR') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
          <p className="text-gray-600 font-medium text-lg">
            Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/vendors/services`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        const json = await res.json();
        setServices(Array.isArray(json) ? json : []);
      } catch (error) { 
        setServices([]); 
      }
      finally { setLoading(false); }
    })();
  }, []);

  const handleDeleteClick = (serviceId: string, serviceName: string) => {
    setPackageToDelete({ id: serviceId, name: serviceName });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!packageToDelete) return;
    
    try {
      const res = await fetch(`${API_BASE}/vendors/services/${packageToDelete.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include'
      });
      
      if (res.ok) {
        setServices(services.filter(s => s.id !== packageToDelete.id));
        setNotification({ message: 'Package deleted successfully!', type: 'success' });
        setTimeout(() => setNotification(null), 3000);
        setShowDeleteModal(false);
        setPackageToDelete(null);
      } else {
        setNotification({ message: 'Failed to delete package. Please try again.', type: 'error' });
        setTimeout(() => setNotification(null), 5000);
      }
    } catch (error) {
      setNotification({ message: 'Failed to delete service. Please try again.', type: 'error' });
      setTimeout(() => setNotification(null), 5000);
    }
  };

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
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Shared vendor dashboard header (same as /vendor/dashboard) */}
      <VendorDashboardTopBar
        unreadCount={0}
        onOpenBidNotifications={() => {}}
      />

      <main className="flex-1">
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>My Packages</h1>
          <Link 
            href="/vendor/services/new" 
            className="px-6 py-2.5 text-white font-medium rounded-lg transition-colors"
            style={{ backgroundColor: '#0B1A33' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0d1f3d'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0B1A33'}
          >
            Add Package
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : !Array.isArray(services) || services.length === 0 ? (
          <div className="bg-white rounded-lg border p-12 text-center">
            <p className="text-gray-600 mb-4">No packages yet.</p>
            <Link 
              href="/vendor/services/new" 
              className="hover:underline transition-colors"
              style={{ color: '#0B1A33' }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#0d1f3d'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#0B1A33'}
            >
              Create your first package
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Package Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Category</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {services.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{service.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{service.category.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                        service.status === 'PUBLISHED' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {service.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <Link href={`/vendor/services/${service.id}`} className="text-gray-600 hover:text-gray-900 mr-4">
                        View
                      </Link>
                      <Link href={`/vendor/services/${service.id}/edit`} className="text-blue-600 hover:text-blue-700 mr-4">
                        Edit
                      </Link>
                      <button onClick={() => handleDeleteClick(service.id, service.name)} className="text-red-600 hover:text-red-700">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Package Confirmation Modal */}
      {showDeleteModal && packageToDelete && (
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
              Are you sure you want to delete "{packageToDelete.name}"? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setPackageToDelete(null);
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
                onClick={confirmDelete}
                style={{
                  backgroundColor: '#DC2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontFamily: 'Inter',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      </main>

      {/* Footer */}
      <Footer />
    </div>
    </>
  );
}
