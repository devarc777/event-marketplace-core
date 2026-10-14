"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRoleContext } from "../../../../components/RoleContext";
import { Footer } from "../../../../components/TrustFooter";
import VendorDashboardTopBar from "../../../../components/VendorDashboardTopBar";

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

export default function ServiceDetail() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, user } = useRoleContext();
  const id = params?.id as string;
  const [svc, setSvc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
        // First get the vendor profile to get the vendor ID
        const vendorRes = await fetch(`${API_BASE}/vendors/profile`, {
          credentials: 'include',
        });
        
        if (!vendorRes.ok) {
          console.error('Failed to fetch vendor profile');
          router.replace('/vendor/auth/login');
          return;
        }
        
        const vendorData = await vendorRes.json();
        const vendorId = vendorData.id;
        
        // Now fetch the service using the vendor ID
        const res = await fetch(`${API_BASE}/vendors/services/${id}`, {
          credentials: 'include',
        });
        
        if (res.ok) {
          const json = await res.json();
          setSvc(json);
        } else {
          console.error('Failed to fetch service');
          router.push('/vendor/profile');
        }
      } catch (error) {
        console.error('Error fetching service:', error);
        router.push('/vendor/profile');
      } finally { 
        setLoading(false); 
      }
    })();
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }
  
  if (!svc) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Service not found</p>
      </div>
    );
  }

  const pkgs = svc.packages || {};
  const availablePackages = Object.entries(pkgs).filter(([_, pkg]: any) => pkg && pkg.price);
  
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      <VendorDashboardTopBar unreadCount={0} onOpenBidNotifications={() => {}} />

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-10">
          {/* Local actions row (Back + Edit) moved below header */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium transition-colors group"
            >
              <svg
                className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </button>
            <Link
              href={`/vendor/services/${id}/edit`}
              className="px-5 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:border-gray-300 hover:shadow-sm transition-all"
            >
              Edit Service
            </Link>
          </div>

          {/* Main Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* Header Section */}
          <div className="px-8 py-8 border-b border-gray-100">
            <h1 className="text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Inter, system-ui, sans-serif', lineHeight: '1.2' }}>
              {svc.name}
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {svc.category.replace(/_/g, ' ')}
              </span>
              {svc.status && (
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border ${
                  svc.status === 'PUBLISHED' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                    : 'bg-amber-50 text-amber-700 border-amber-100'
                }`}>
                  {svc.status}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {svc.description && (
            <div className="px-8 py-8 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Raleway' }}>About This Service</h2>
              <p className="text-gray-600 leading-relaxed" style={{ lineHeight: '1.7' }}>
                {svc.description}
              </p>
            </div>
          )}

          {/* Photos */}
          {!!(svc.media?.length) && (
            <div className="px-8 py-8 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 mb-5" style={{ fontFamily: 'Raleway' }}>Gallery</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {svc.media.map((m: string, i: number) => (
                  <div key={i} className="group relative overflow-hidden rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
                    <img 
                      src={m} 
                      alt={`Gallery ${i + 1}`} 
                      className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pricing */}
          {availablePackages.length > 0 && (
            <div className="px-8 py-8 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 mb-6" style={{ fontFamily: 'Raleway' }}>Pricing Options</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {availablePackages.map(([tier, pkg]: any) => (
                  <div 
                    key={tier} 
                    className="relative bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        {tier}
                      </h3>
                      {tier === 'premium' && (
                        <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-200">
                          Popular
                        </span>
                      )}
                    </div>
                    
                    <div className="mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">
                          {pkg.currency === 'USD' ? '$' : pkg.currency === 'EUR' ? '€' : pkg.currency === 'GBP' ? '£' : pkg.currency === 'INR' ? '₹' : pkg.currency === 'PKR' ? '₨' : pkg.currency}
                          {pkg.price}
                        </span>
                        <span className="text-sm text-gray-500">{pkg.currency}</span>
                      </div>
                    </div>
                    
                    {pkg.inclusions && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">What's Included</p>
                        <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line" style={{ lineHeight: '1.6' }}>
                          {pkg.inclusions}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Availability */}
          {svc.availability && (
            <div className="px-8 py-8 bg-gray-50">
              <h2 className="text-base font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Raleway' }}>Availability</h2>
              <p className="text-gray-600 leading-relaxed whitespace-pre-line" style={{ lineHeight: '1.7' }}>
                {svc.availability}
              </p>
            </div>
          )}

        </div>

        {/* CTA Button (currently hidden) */}
        <div className="mt-10 flex justify-center" style={{ display: "none" }}>
          <button
            className="group px-8 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 shadow-sm hover:shadow transition-all duration-200 flex items-center gap-2"
          >
            Book This Service
            <svg
              className="w-4 h-4 group-hover:translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </button>
        </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
