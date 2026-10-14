"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Footer } from "../../../../../components/TrustFooter";

interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  media: string[];
  packages: any;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Vendor {
  id: string;
  businessName: string;
  description: string;
  category: string;
  email: string;
  phone: string;
  city: string;
  user: {
    firstName: string;
    lastName: string;
    avatar: string;
  };
}

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

export default function PublicServiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vendorId = params.id as string; // Changed from vendorId to id
  const serviceId = params.serviceId as string;
  const [service, setService] = useState<Service | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (vendorId && serviceId) {
      fetchService();
    }
  }, [vendorId, serviceId]);

  const fetchService = async () => {
    try {
      const response = await fetch(`${API_BASE}/vendors/public/${vendorId}/services/${serviceId}`);
      
      if (response.ok) {
        const data = await response.json();
        setService(data.service);
        setVendor(data.vendor);
      } else {
        console.error('Failed to fetch service');
        router.push(`/vendor/${vendorId}/public`);
      }
    } catch (error) {
      console.error('Failed to fetch service:', error);
      router.push(`/vendor/${vendorId}/public`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!service || !vendor) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Package Not Found</h1>
            <p className="text-gray-600 mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>The package you're looking for doesn't exist.</p>
            <a 
              href={`/vendor/${vendorId}/public`}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors" style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Back to Vendor Profile
            </a>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <style jsx>{`
        /* Contact section responsive fixes */
        @media (max-width: 732px) {
          .contact-vendor-container {
            flex-direction: column !important;
            gap: 16px !important;
          }
          .contact-buttons-wrapper {
            width: 100% !important;
            flex-wrap: wrap !important;
            justify-content: flex-start !important;
          }
        }
        @media (max-width: 696px) {
          .contact-buttons-wrapper {
            gap: 8px !important;
          }
          .contact-button {
            flex: 1 1 calc(50% - 4px) !important;
            min-width: 0 !important;
            font-size: 13px !important;
            padding: 8px 12px !important;
          }
        }
        @media (max-width: 554px) {
          .contact-buttons-wrapper {
            gap: 6px !important;
          }
          .contact-button {
            flex: 1 1 calc(50% - 3px) !important;
            font-size: 12px !important;
            padding: 8px 10px !important;
          }
          .contact-button svg {
            width: 14px !important;
            height: 14px !important;
            margin-right: 4px !important;
          }
        }
        @media (max-width: 400px) {
          .contact-button {
            flex: 1 1 100% !important;
            width: 100% !important;
          }
        }
      `}</style>
      {/* Back Button */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <a 
            href={`/vendor/${vendorId}/public`}
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span style={{ fontFamily: 'Inter, sans-serif' }}>Back to {vendor.businessName}</span>
          </a>
        </div>
      </div>

      {/* Service Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Service Images */}
          {service.media.length > 0 && (
            <div className="h-64">
              <img 
                src={service.media[0]} 
                alt={service.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-8">
            {/* Service Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Raleway, sans-serif' }}>{service.name}</h1>
              <div className="flex items-center gap-4 mb-4">
                <span className="inline-block bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full font-medium">
                  {service.category}
                </span>
                <span className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>by {vendor.businessName}</span>
              </div>
            </div>

            {/* Service Description */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Description</h2>
              <p className="text-gray-700 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>{service.description}</p>
            </div>

            {/* Service Packages */}
            {service.packages && Object.keys(service.packages).length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Packages</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(service.packages).map(([key, pkg]: [string, any]) => (
                    <div 
                      key={key} 
                      className="bg-white border border-gray-200 rounded-lg p-4"
                    >
                      <h3 className="font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Raleway, sans-serif' }}>{pkg.name}</h3>
                      <p className="text-gray-600 mb-3 text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>{pkg.description}</p>
                      <div className="text-2xl font-bold text-blue-600" style={{ fontFamily: 'Raleway, sans-serif' }}>${pkg.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact Vendor */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Contact Vendor</h3>
              <div className="contact-vendor-container flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-shrink-0">
                  <h4 className="font-medium text-gray-900 mb-1" style={{ fontFamily: 'Raleway, sans-serif' }}>{vendor.businessName}</h4>
                  <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.email}</p>
                  {vendor.phone && <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.phone}</p>}
                </div>
                <div className="contact-buttons-wrapper flex flex-wrap gap-2 w-full sm:w-auto">
                  {vendor.phone && (
                    <a 
                      href={`tel:${vendor.phone}`}
                      className="contact-button bg-green-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center flex-shrink-0 text-sm sm:text-base"
                      style={{ fontFamily: 'Inter, sans-serif', minWidth: 'fit-content' }}
                    >
                      <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="whitespace-nowrap">Call</span>
                    </a>
                  )}
                  <a 
                    href={`mailto:${vendor.email}`}
                    className="contact-button bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center flex-shrink-0 text-sm sm:text-base"
                    style={{ fontFamily: 'Inter, sans-serif', minWidth: 'fit-content' }}
                  >
                    <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="whitespace-nowrap">Email</span>
                  </a>
                  {vendor.phone && (
                    <a 
                      href={`https://wa.me/${vendor.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="contact-button bg-green-500 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center flex-shrink-0 text-sm sm:text-base"
                      style={{ fontFamily: 'Inter, sans-serif', minWidth: 'fit-content' }}
                    >
                      <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                      </svg>
                      <span className="whitespace-nowrap">WhatsApp</span>
                    </a>
                  )}
                  <a 
                    href={`/quote-request/${vendorId}`}
                    className="contact-button bg-[#0B1A33] text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-[#1a2a4a] transition-colors flex items-center justify-center flex-shrink-0 text-sm sm:text-base"
                    style={{ fontFamily: 'Inter, sans-serif', minWidth: 'fit-content' }}
                  >
                    <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="whitespace-nowrap">Quote</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Service Details */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Package Details</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Category:</span>
                  <span className="font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>{service.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Vendor:</span>
                  <span className="font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.businessName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>Location:</span>
                  <span className="font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.city}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
