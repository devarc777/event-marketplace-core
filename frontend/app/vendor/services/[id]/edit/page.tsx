"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRoleContext } from "../../../../../components/RoleContext";
import { Footer } from "../../../../../components/TrustFooter";
import VendorDashboardTopBar from "../../../../../components/VendorDashboardTopBar";
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

export default function EditServicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, user, authChecked } = useRoleContext();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [packages, setPackages] = useState<any>({
    basic: { enabled: true, price: '', currency: 'USD', inclusions: '' },
    standard: { enabled: true, price: '', currency: 'USD', inclusions: '' },
    premium: { enabled: true, price: '', currency: 'USD', inclusions: '' },
  });
  const [media, setMedia] = useState<string[]>([]);
  const [availability, setAvailability] = useState("");
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [uploadingImages, setUploadingImages] = useState(false);

  // Authentication check
  useEffect(() => {
    // Wait for auth check to complete
    if (!authChecked) {
      return;
    }
    
    if (!isAuthenticated || user?.role !== 'VENDOR') {
      router.replace('/vendor/auth/login');
      return;
    }
  }, [isAuthenticated, user, router, authChecked]);

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
  
  // If not authenticated or not a vendor, don't render anything (will redirect via useEffect)
  if (!isAuthenticated || user?.role !== 'VENDOR') {
    return null;
  }

  useEffect(() => {
    // Don't fetch data until authentication is verified
    if (!authChecked || !isAuthenticated || user?.role !== 'VENDOR') {
      return;
    }
    
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/vendors/services/${id}`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        const json = await res.json();
        setName(json.name || '');
        setDescription(json.description || '');
        setCategory(json.category || '');
        
        // Normalize packages: add 'enabled' property if it exists in backend data
        const backendPackages = json.packages || {};
        const normalizedPackages = {
          basic: backendPackages.basic ? { ...backendPackages.basic, enabled: true } : { enabled: false, price: '', currency: 'USD', inclusions: '' },
          standard: backendPackages.standard ? { ...backendPackages.standard, enabled: true } : { enabled: false, price: '', currency: 'USD', inclusions: '' },
          premium: backendPackages.premium ? { ...backendPackages.premium, enabled: true } : { enabled: false, price: '', currency: 'USD', inclusions: '' },
        };
        setPackages(normalizedPackages);
        
        setMedia(json.media || []);
        setAvailability(json.availability || '');
        setStatus(json.status || 'DRAFT');
      } catch { setError('Failed to load package'); }
      finally { setLoading(false); }
    })();
  }, [id, authChecked, isAuthenticated, user]);

  function setPkg(tier: 'basic'|'standard'|'premium', key: 'price'|'currency'|'inclusions'|'enabled', value: string | boolean) {
    setPackages((p: any) => ({ ...p, [tier]: { ...p[tier], [key]: value } }));
    // Clear validation error when user types
    if (validationErrors[`${tier}-${key}`]) {
      setValidationErrors(prev => {
        const newErrors = {...prev};
        delete newErrors[`${tier}-${key}`];
        return newErrors;
      });
    }
  }

  function togglePackage(tier: 'basic'|'standard'|'premium') {
    setPackages((p: any) => ({ ...p, [tier]: { ...p[tier], enabled: !p[tier].enabled } }));
  }

  function duplicatePackage(from: 'basic'|'standard'|'premium', to: 'basic'|'standard'|'premium') {
    setPackages((p: any) => ({ 
      ...p, 
      [to]: { 
        ...p[to], 
        price: p[from].price, 
        currency: p[from].currency, 
        inclusions: p[from].inclusions 
      } 
    }));
  }

  async function handleFileUpload(files: FileList) {
    if (!files.length) return;

    setUploadingImages(true);
    setError(null);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        if (!file.type.startsWith('image/')) {
          throw new Error(`${file.name} is not a valid image file`);
        }

        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`${file.name} is too large. Maximum size is 5MB`);
        }

        const formData = new FormData();
        formData.append('image', file);
        formData.append('type', 'service');

        const response = await fetch(`${API_BASE}/uploads/service-image`, {
          method: 'POST',
          headers: getAuthorizationHeader(),
          credentials: 'include',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed: ${errorText}`);
        }

        const result = await response.json();
        return result.url;
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      setMedia((m) => Array.from(new Set([...(m || []), ...uploadedUrls])));

      if (validationErrors.media) {
        setValidationErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors.media;
          return newErrors;
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload images');
    } finally {
      setUploadingImages(false);
    }
  }

  function removeMedia(url: string) {
    setMedia((m) => m.filter((item) => item !== url));
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    
    if (!name.trim()) errors.name = 'Package name is required';
    if (name.length > 100) errors.name = 'Package name must be 100 characters or less';
    if (!category) errors.category = 'Please select a category';
    
    // Validate at least one package is enabled with price
    const enabledPackages = Object.entries(packages).filter(([_, pkg]: any) => pkg.enabled);
    if (enabledPackages.length === 0) {
      errors.packages = 'Please enable at least one package';
    } else {
      enabledPackages.forEach(([tier, pkg]: any) => {
        if (!pkg.price || parseFloat(pkg.price) <= 0) {
          errors[`${tier}-price`] = 'Price must be greater than 0';
        }
      });
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    
    if (!validateForm()) {
      setError('Please fix the errors before submitting');
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Clean packages: remove 'enabled' property and only send enabled packages
      const cleanPackages: any = {};
      Object.entries(packages).forEach(([tier, pkg]: any) => {
        if (pkg.enabled) {
          cleanPackages[tier] = {
            price: pkg.price,
            currency: pkg.currency,
            inclusions: pkg.inclusions
          };
        }
      });
      
      console.log('Updating package with data:', { name, description, category, packages: cleanPackages, media, availability, status });
      
      const res = await fetch(`${API_BASE}/vendors/services/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ name, description, category, packages: cleanPackages, media, availability, status })
      });
      
      console.log('Update response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error response:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.message || `Failed to update package (${res.status})`);
        } catch (parseError) {
          throw new Error(`Failed to update package (${res.status}): ${errorText}`);
        }
      }
      
      const json = await res.json();
      console.log('Package updated successfully:', json);
      setSuccess('Package updated successfully! Redirecting to dashboard...');
setTimeout(() => {
  router.push('/vendor/dashboard');
}, 1500);
    } catch (err: any) {
      console.error('Package update error:', err);
      setError(err?.message || 'Failed to save package. Please try again.'); 
    }
    finally { setSaving(false); }
  }

  if (loading) return <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 flex items-center justify-center"><div className="text-xl">Loading…</div></div>;
  if (error && !name) return <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-12 flex items-center justify-center"><div className="text-xl text-red-600">Error: {error}</div></div>;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
      <VendorDashboardTopBar unreadCount={0} onOpenBidNotifications={() => {}} />
      <div className="px-4 py-12">
      <div className="mx-auto max-w-4xl">
        {/* Primary Heading */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Package</h1>
          <div className="w-24 h-1 bg-gradient-to-r from-yellow-400 to-yellow-600 mx-auto rounded-full"></div>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-lg border border-gray-200">
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-green-700">{success}</span>
            </div>
          )}
          
          <form className="space-y-6" onSubmit={onSave}>
            {/* Service Name Section */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Package Details</h2>
              <label className="block">
                <div className="flex justify-between items-center mb-1">
                  <span className="block text-base font-medium text-gray-700">Package Name *</span>
                  <span className="text-xs text-gray-500">{name.length}/100</span>
                </div>
                <input 
                  className={`w-full h-12 rounded-lg border ${validationErrors.name ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'} px-4 py-2 focus:border-blue-500 focus:ring-2 transition-all outline-none`}
                  value={name} 
                  onChange={(e) => {
                    setName(e.target.value);
                    if (validationErrors.name) {
                      setValidationErrors(prev => {
                        const newErrors = {...prev};
                        delete newErrors.name;
                        return newErrors;
                      });
                    }
                  }}
                  placeholder="e.g., Professional Wedding Photography"
                  maxLength={100}
                  required 
                  aria-label="Package Name"
                  aria-required="true"
                />
                {validationErrors.name && <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>}
              </label>
              
              <label className="block">
                <div className="flex justify-between items-center mb-1">
                  <span className="block text-base font-medium text-gray-700">Description</span>
                  <span className="text-xs text-gray-500">{description.length}/500</span>
                </div>
                <textarea 
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" 
                  rows={5} 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your package in detail... (e.g., Years of experience, special equipment, what makes your package unique)"
                  maxLength={500}
                  aria-label="Package Description"
                />
              </label>
              
              <label className="block">
                <span className="block text-base font-medium text-gray-700 mb-1">Category *</span>
                <select 
                  className={`w-full h-12 rounded-lg border ${validationErrors.category ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'} px-4 py-2 focus:border-blue-500 focus:ring-2 transition-all outline-none bg-white`}
                  value={category} 
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (validationErrors.category) {
                      setValidationErrors(prev => {
                        const newErrors = {...prev};
                        delete newErrors.category;
                        return newErrors;
                      });
                    }
                  }}
                  required
                  aria-label="Package Category"
                  aria-required="true"
                >
                  <option value="">Select a category</option>
                  <optgroup label="Event Services">
                    <option value="CATERING">Catering</option>
                    <option value="PHOTOGRAPHY">Photography</option>
                    <option value="VIDEOGRAPHY">Videography</option>
                    <option value="MUSIC_DJ">Music / DJ</option>
                    <option value="DECORATION">Decoration</option>
                    <option value="FLOWERS">Flowers</option>
                  </optgroup>
                  <optgroup label="Logistics">
                    <option value="TRANSPORTATION">Transportation</option>
                    <option value="VENUE">Venue</option>
                    <option value="EQUIPMENT_RENTAL">Equipment Rental</option>
                  </optgroup>
                  <optgroup label="Support Services">
                    <option value="SECURITY">Security</option>
                    <option value="CLEANING">Cleaning</option>
                    <option value="OTHER">Other</option>
                  </optgroup>
                </select>
                {validationErrors.category && <p className="mt-1 text-sm text-red-600">{validationErrors.category}</p>}
              </label>
            </div>

            {/* Package Cards Section - MATCHING FORM STYLE */}
            <div className="space-y-4 mt-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Pricing Packages</h2>
              <p className="text-sm text-gray-600 mb-4">Configure your package pricing. At least one package must be enabled.</p>
              
              {validationErrors.packages && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                  </svg>
                  <span className="text-sm text-red-700 font-medium">{validationErrors.packages}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(['basic','standard','premium'] as const).map((tier, idx) => {
                  const labels = { basic: 'Basic', standard: 'Standard', premium: 'Premium' };
                  const enabled = packages[tier].enabled;
                  
                  return (
                    <div 
                      key={tier}
                      className={`rounded-xl border-2 p-6 transition-all duration-200 ${
                        enabled 
                          ? 'border-gray-200 bg-gradient-to-br from-white to-gray-50 shadow-md hover:shadow-lg' 
                          : 'border-gray-200 bg-gray-50 opacity-60'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-5 pb-4 border-b-2 border-gray-200">
                        <h3 className="text-lg font-bold text-gray-800">{labels[tier]} Package</h3>
                        <label className="flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded text-blue-600 focus:ring-2 focus:ring-blue-500 transition-colors"
                            checked={enabled}
                            onChange={() => togglePackage(tier)}
                            aria-label={`Enable ${tier} package`}
                          />
                        </label>
                      </div>

                      {enabled ? (
                        <div className="space-y-4">
                          {/* Price */}
                          <label className="block">
                            <span className="block text-base font-medium text-gray-700 mb-1">Price *</span>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-medium">
                                {packages[tier].currency === 'USD' ? '$' : packages[tier].currency === 'EUR' ? '€' : packages[tier].currency === 'GBP' ? '£' : packages[tier].currency === 'INR' ? '₹' : packages[tier].currency === 'PKR' ? '₨' : packages[tier].currency}
                              </span>
                              <input 
                                className={`w-full h-12 rounded-lg border ${validationErrors[`${tier}-price`] ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'} pl-10 pr-24 py-2 focus:border-blue-500 focus:ring-2 transition-all outline-none`}
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={packages[tier].price} 
                                onChange={(e) => setPkg(tier,'price',e.target.value)} 
                                placeholder="0.00"
                                required={enabled}
                                aria-label={`${tier} package price`}
                              />
                              <select 
                                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-9 rounded-md border-0 px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm" 
                                value={packages[tier].currency} 
                                onChange={(e) => setPkg(tier,'currency',e.target.value)}
                                aria-label={`${tier} package currency`}
                              >
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="GBP">GBP</option>
                                <option value="CAD">CAD</option>
                                <option value="AUD">AUD</option>
                                <option value="JPY">JPY</option>
                                <option value="INR">INR</option>
                                <option value="PKR">PKR</option>
                              </select>
                            </div>
                            {validationErrors[`${tier}-price`] && (
                              <p className="mt-1 text-sm text-red-600">{validationErrors[`${tier}-price`]}</p>
                            )}
                            {packages[tier].price === '0' && (
                              <p className="mt-1 text-xs text-gray-500 bg-gray-100 inline-block px-2 py-1 rounded">Free package</p>
                            )}
                          </label>

                          {/* Inclusions */}
                          <label className="block">
                            <span className="block text-base font-medium text-gray-700 mb-1">Inclusions</span>
                            <textarea 
                              className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" 
                              rows={5} 
                              value={packages[tier].inclusions} 
                              onChange={(e) => setPkg(tier,'inclusions',e.target.value)}
                              placeholder="• List what's included&#10;• Use bullet points&#10;• E.g., buffet, servers, drinks"
                              aria-label={`${tier} package inclusions`}
                            />
                            <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              List each inclusion on a new line
                            </p>
                          </label>

                          {/* Copy From */}
                          {idx > 0 && (
                            <div>
                              <select
                                className="w-full h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none bg-white cursor-pointer"
                                onChange={(e) => {
                                  if (e.target.value) {
                                    duplicatePackage(e.target.value as any, tier);
                                    e.target.value = '';
                                  }
                                }}
                                defaultValue=""
                              >
                                <option value="" disabled>Copy from another package...</option>
                                {idx >= 1 && <option value="basic">Basic Package</option>}
                                {idx >= 2 && <option value="standard">Standard Package</option>}
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <p className="text-sm text-gray-500 font-medium">Enable this package to configure</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Media Section */}
            <div className="space-y-4 mt-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Package Images (Optional)</h2>
              <div className="space-y-3">
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Upload images to showcase your package (JPG, PNG, WebP - Max 5MB each)
                </p>

                {/* File Upload Area */}
                <div className="relative">
                  <input
                    type="file"
                    id="imageUpload"
                    multiple
                    accept="image/*"
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={uploadingImages}
                  />
                  <label
                    htmlFor="imageUpload"
                    className={`block w-full p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-all ${
                      uploadingImages
                        ? 'border-blue-300 bg-blue-50 cursor-not-allowed'
                        : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                    }`}
                  >
                    {uploadingImages ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="text-blue-600 font-medium">Uploading images...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <div>
                          <span className="text-lg font-medium text-gray-700">Click to upload images</span>
                          <p className="text-sm text-gray-500">or drag and drop files here</p>
                        </div>
                      </div>
                    )}
                  </label>
                </div>

                {validationErrors.media && (
                  <p className="text-sm text-red-600">{validationErrors.media}</p>
                )}

                {/* Image Preview Grid */}
                {!!media?.length && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-gray-700">
                      {media.length} {media.length === 1 ? 'image' : 'images'} attached:
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {media.map((url, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={url}
                            alt={`Service image ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-gray-200"
                          />
                          <button
                            type="button"
                            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeMedia(url)}
                            aria-label="Remove image"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Availability Section */}
            <div className="space-y-4 mt-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Availability (Optional)</h2>
              <label className="block">
                <span className="block text-base font-medium text-gray-700 mb-1">Availability Details</span>
                <textarea 
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all outline-none" 
                  rows={4} 
                  value={availability} 
                  onChange={(e) => setAvailability(e.target.value)}
                  placeholder="Examples:&#10;• Available Monday-Friday, 9 AM - 6 PM&#10;• Weekend bookings available with advance notice&#10;• Flexible scheduling for special events"
                  aria-label="Availability details"
                />
                <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Describe your working hours, peak seasons, or booking requirements
                </p>
              </label>
            </div>

            {/* Publish Status Section */}
            <div className="space-y-4 mt-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Publish Status</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${status==='DRAFT' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input 
                    type="radio" 
                    className="w-5 h-5 mt-0.5 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    checked={status==='DRAFT'} 
                    onChange={() => setStatus('DRAFT')}
                    aria-label="Save as draft" 
                  /> 
                  <div>
                    <span className="font-semibold text-gray-800 block">Save as Draft</span>
                    <span className="text-xs text-gray-600">Package won't be visible to customers yet</span>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${status==='PUBLISHED' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input 
                    type="radio" 
                    className="w-5 h-5 mt-0.5 text-green-600 focus:ring-2 focus:ring-green-500"
                    checked={status==='PUBLISHED'} 
                    onChange={() => setStatus('PUBLISHED')}
                    aria-label="Publish package" 
                  /> 
                  <div>
                    <span className="font-semibold text-gray-800 block">Publish Package</span>
                    <span className="text-xs text-gray-600">Make package visible to customers immediately</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 border-t-2 border-gray-200 mt-8">
              <button 
                type="button"
                className="w-full sm:w-auto h-12 rounded-lg border-2 border-gray-300 px-8 py-2 font-semibold text-gray-700 hover:bg-gray-50 active:scale-95 transition-all touch-manipulation"
                onClick={() => window.history.back()}
                aria-label="Cancel and go back"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="w-full sm:w-auto h-12 rounded-lg bg-gradient-to-r from-yellow-400 to-yellow-500 px-10 py-2 font-bold text-black hover:from-yellow-500 hover:to-yellow-600 shadow-lg hover:shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 touch-manipulation flex items-center justify-center gap-2" 
                disabled={saving}
                aria-label={saving ? 'Saving package' : 'Save changes'}
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <Footer />
      </div>
    </div>
  );
}
