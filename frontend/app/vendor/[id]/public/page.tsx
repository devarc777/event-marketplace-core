"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Footer } from "../../../../components/TrustFooter";

interface PublicVendor {
  id: string;
  businessName: string;
  description: string;
  category: string;
  email: string;
  phone: string;
  city: string;
  averageRating: number;
  totalReviews: number;
  totalBids: number;
  completedJobs: number;
  winRate: number;
  profilePicture: string | null;
  user: {
    firstName: string;
    lastName: string;
    avatar: string;
  };
  portfolioProjects: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    images: string[];
  }>;
  pricingPackages: Array<{
    name: string;
    description: string;
    price: number;
  }>;
  services: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    media: string[];
    packages: any;
  }>;
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

export default function PublicVendorProfile() {
  const params = useParams();
  const vendorId = params.id as string;
  
  const [vendor, setVendor] = useState<PublicVendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'portfolio' | 'pricing' | 'services'>('overview');

  useEffect(() => {
    if (vendorId) {
      fetchVendorData();
    }
  }, [vendorId]);

  const fetchVendorData = async () => {
    try {
      const response = await fetch(`${API_BASE}/vendors/public/${vendorId}`);
      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      
      if (response.ok) {
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        
        if (responseText.trim()) {
          try {
            const data = JSON.parse(responseText);
            setVendor(data);
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
            console.error('Response text:', responseText);
          }
        } else {
          console.error('Empty response received');
        }
      } else {
        console.error('Response not ok:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to fetch vendor data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vendor profile...</p>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Vendor Not Found</h1>
          <p className="text-gray-600 mb-8">The vendor you're looking for doesn't exist or is no longer available.</p>
          <a 
            href="/search/vendors" 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse All Vendors
          </a>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Back Button */}
      <div className="bg-white border-b border-gray-200">
        <style jsx>{`
          @media (max-width: 1362px) {
            .back-button-wrapper {
              padding-top: 140px !important;
            }
          }
        `}</style>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 back-button-wrapper">
          <a 
            href="/search/vendors" 
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Vendor Marketplace
          </a>
        </div>
      </div>

      {/* Hero Section */}
      <section className="bg-white text-gray-900 py-16 border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex-shrink-0">
              {(() => {
                console.log('🔍 Public profile vendor data:', vendor);
                console.log('🔍 Profile picture:', vendor.profilePicture);
                console.log('🔍 User avatar:', vendor.user.avatar);
                return null;
              })()}
              {vendor.profilePicture ? (
                <img 
                  src={vendor.profilePicture.startsWith('/uploads/') ? `/api${vendor.profilePicture}` : vendor.profilePicture} 
                  alt={vendor.businessName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                  onLoad={() => console.log('✅ Public profile image loaded:', vendor.profilePicture)}
                  onError={(e) => console.error('❌ Public profile image failed to load:', vendor.profilePicture, e)}
                />
              ) : vendor.user.avatar ? (
                <img 
                  src={vendor.user.avatar} 
                  alt={vendor.businessName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center border-4 border-gray-200">
                  <span className="text-2xl text-blue-600 font-bold">
                    {vendor.businessName.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl font-bold mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>{vendor.businessName}</h1>
              <div className="flex flex-wrap justify-center md:justify-start gap-4 text-sm">
                <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                  📍 {vendor.city}
                </span>
                <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                  🏷️ {vendor.category}
                </span>
                <div className="flex items-center bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                  <div className="flex text-yellow-400 mr-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg key={star} className="w-4 h-4" fill={star <= Math.round(vendor.averageRating) ? "currentColor" : "none"} stroke={star <= Math.round(vendor.averageRating) ? "none" : "currentColor"} viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <span style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.averageRating.toFixed(1)} ({vendor.totalReviews} reviews)</span>
                </div>
                <div className="flex items-center bg-green-100 text-green-700 px-3 py-1 rounded-full">
                  <span className="font-semibold mr-1">🎯</span>
                  <span style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.winRate}% Win Rate</span>
                </div>
              </div>
            </div>
            <div className="flex-shrink-0">
              <div className="bg-gray-50 rounded-lg p-6 text-center border border-gray-200">
                <h3 className="text-lg font-semibold mb-2 text-gray-900" style={{ fontFamily: 'Raleway, sans-serif' }}>Contact Info</h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p style={{ fontFamily: 'Inter, sans-serif' }}>📧 {vendor.email}</p>
                  {vendor.phone && <p style={{ fontFamily: 'Inter, sans-serif' }}>📞 {vendor.phone}</p>}
                </div>
                {vendor.phone ? (
                  <a 
                    href={`tel:${vendor.phone.replace(/\s+/g, '')}`}
                    className="mt-4 bg-[#0B1A33] text-white px-6 py-2 rounded-lg font-medium hover:bg-[#1a2a4a] transition-colors inline-block text-center"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  >
                    Contact Vendor
                  </a>
                ) : (
                  <button 
                    className="mt-4 bg-gray-400 text-white px-6 py-2 rounded-lg font-medium cursor-not-allowed" 
                    style={{ fontFamily: 'Inter, sans-serif' }}
                    disabled
                  >
                  Contact Vendor
                </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <section className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', icon: '📋' },
              { id: 'services', label: 'Packages', icon: '🛠️' },
              { id: 'portfolio', label: 'Portfolio', icon: '🎨' },
              { id: 'pricing', label: 'Pricing', icon: '💰' }
            ].map((tab) => (
              <div key={tab.id} style={tab.id === 'pricing' ? { display: 'none' } : undefined}>
                <button
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              </div>
            ))}
          </nav>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {activeTab === 'services' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Active Packages</h3>
                {vendor.services.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No active packages available yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {vendor.services.map((service) => (
                      <a 
                        key={service.id} 
                        href={`/vendor/${vendor.id}/services/${service.id}`}
                        className="block border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                      >
                        {service.media.length > 0 ? (
                          <img 
                            src={service.media[0]} 
                            alt={service.name}
                            className="w-full h-48 object-cover"
                          />
                        ) : (
                          <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-500">No image</span>
                          </div>
                        )}
                        <div className="p-4">
                          <h4 className="font-semibold text-gray-900 mb-2">{service.name}</h4>
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{service.description}</p>
                          <div className="flex items-center justify-between">
                            <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {service.category}
                            </span>
                            <span className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                              View Details →
                            </span>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>About {vendor.businessName}</h3>
                <p className="text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.description}</p>
              </div>
              
              {/* Performance Stats */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Performance & Reputation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-700" style={{ fontFamily: 'Inter, sans-serif' }}>Rating</span>
                      <span className="text-2xl">⭐</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-blue-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{vendor.averageRating.toFixed(1)}</span>
                      <span className="text-sm text-blue-600">/ 5.0</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.totalReviews} {vendor.totalReviews === 1 ? 'review' : 'reviews'}</p>
                  </div>
                  
                  <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-700" style={{ fontFamily: 'Inter, sans-serif' }}>Win Rate</span>
                      <span className="text-2xl">🎯</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-green-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{vendor.winRate}%</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.completedJobs} of {vendor.totalBids} bids won</p>
                  </div>
                  
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-purple-700" style={{ fontFamily: 'Inter, sans-serif' }}>Completed Jobs</span>
                      <span className="text-2xl">✅</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-purple-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{vendor.completedJobs}</span>
                    </div>
                    <p className="text-xs text-purple-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>Successfully completed</p>
                  </div>
                  
                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-orange-700" style={{ fontFamily: 'Inter, sans-serif' }}>Total Bids</span>
                      <span className="text-2xl">📊</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-orange-900" style={{ fontFamily: 'Raleway, sans-serif' }}>{vendor.totalBids}</span>
                    </div>
                    <p className="text-xs text-orange-600 mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>Bids submitted</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>Email</label>
                    <p className="text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.email}</p>
                  </div>
                  {vendor.phone && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>Phone</label>
                      <p className="text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.phone}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>Location</label>
                    <p className="text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.city}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>Category</label>
                    <p className="text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>{vendor.category}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'portfolio' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Portfolio Projects</h3>
                {vendor.portfolioProjects.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No portfolio projects available yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {vendor.portfolioProjects.map((project) => (
                      <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                        {project.images.length > 0 ? (
                          <div className="w-full h-48 bg-gray-100">
                            <img 
                              src={project.images[0]} // Now using S3 URL directly
                              alt={project.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-full h-48 bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-500">No image</span>
                          </div>
                        )}
                        <div className="p-4">
                          <h4 className="font-semibold text-gray-900 mb-2">{project.title}</h4>
                          <p className="text-sm text-gray-600 mb-2">{project.description}</p>
                          <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {project.category}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'none' }}>
            {activeTab === 'pricing' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Raleway, sans-serif' }}>Package Pricing</h3>
                {vendor.pricingPackages.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No pricing packages available yet.</p>
                ) : (
                  <div className="space-y-4">
                    {vendor.pricingPackages.map((pkg, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="font-medium text-gray-900">{pkg.name}</h4>
                            <p className="text-sm text-gray-600">{pkg.description}</p>
                          </div>
                          <span className="text-lg font-semibold text-blue-600">${pkg.price}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </main>
  );
}
