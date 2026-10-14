"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Footer } from "@/components/TrustFooter";

interface QuoteFormData {
  fullName: string;
  email: string;
  phone: string;
  eventType: string;
  eventDate: string;
  eventLocation: string;
  numberOfGuests: string;
  budgetRange: string;
  additionalDetails: string;
}

function resolveApiBaseUrl(): string {
  const env = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");
  if (env) return env;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3002";
    const base = window.location.origin.replace(/\/$/, "");
    return `${base}/api`;
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3002";
}

const API_BASE = resolveApiBaseUrl();

export default function ExternalQuoteRequestPage() {
  const params = useParams();
  const router = useRouter();
  const externalVendorId = params.externalVendorId as string;

  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [formData, setFormData] = useState<QuoteFormData>({
    fullName: "",
    email: "",
    phone: "",
    eventType: "",
    eventDate: "",
    eventLocation: "",
    numberOfGuests: "",
    budgetRange: "",
    additionalDetails: "",
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!externalVendorId) return;
    setSubmitting(true);
    setNotification(null);

    try {
      const response = await fetch(`${API_BASE}/quote-requests/external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          externalVendorId,
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          eventType: formData.eventType,
          eventDate: formData.eventDate,
          eventLocation: formData.eventLocation,
          numberOfGuests: formData.numberOfGuests,
          budgetRange: formData.budgetRange,
          additionalDetails: formData.additionalDetails || undefined,
        }),
      });

      if (response.ok) {
        setNotification({
          message:
            "Quote request sent! The vendor will receive an email with a link to join Evenzs and respond to your request.",
          type: "success",
        });
        setTimeout(() => {
          setNotification(null);
          router.push("/search/vendors");
        }, 4000);
      } else {
        const err = await response.json().catch(() => ({}));
        setNotification({
          message: err?.message || "Failed to send quote request. Please try again.",
          type: "error",
        });
        setTimeout(() => setNotification(null), 5000);
      }
    } catch (error) {
      console.error("Error submitting external quote request:", error);
      setNotification({
        message: "Error sending quote request. Please try again.",
        type: "error",
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `,
        }}
      />
      {notification && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 10000,
            animation: "slideInRight 0.3s ease-out",
          }}
        >
          <div
            style={{
              backgroundColor: notification.type === "success" ? "#10b981" : "#ef4444",
              color: "white",
              padding: "16px 24px",
              borderRadius: "12px",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              minWidth: "320px",
              maxWidth: "400px",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "15px" }}>
                {notification.type === "success" ? "Success!" : "Error!"}
              </p>
              <p style={{ margin: "4px 0 0 0", fontSize: "14px", opacity: 0.95 }}>{notification.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              style={{
                background: "none",
                border: "none",
                color: "white",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.8,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}

      <main className="min-h-screen bg-gray-50">
        <section className="bg-white border-b border-gray-200 pt-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "Raleway, sans-serif" }}>
              Request a quote
            </h1>
            <p className="text-gray-600 mt-1">
              This vendor is not yet on Evenzs. We’ll send them your details by email and a link to join so they can respond.
            </p>
          </div>
        </section>

        <section className="py-12">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Contact Information Section - same as onboarded: only Full Name visible */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6" style={{ fontFamily: "Raleway, sans-serif" }}>
                  Contact Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      id="fullName"
                      name="fullName"
                      required
                      value={formData.fullName}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div style={{ display: "none" }}>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                    <input type="email" id="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter your email address" />
                  </div>
                  <div className="md:col-span-2" style={{ display: "none" }}>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
                    <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter your phone number" />
                  </div>
                </div>
              </div>

              {/* Event Details Section */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6" style={{ fontFamily: "Raleway, sans-serif" }}>
                  Event Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="eventType" className="block text-sm font-medium text-gray-700 mb-2">
                      Event Type *
                    </label>
                    <select
                      id="eventType"
                      name="eventType"
                      required
                      value={formData.eventType}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select event type</option>
                      <option value="Wedding">Wedding</option>
                      <option value="Birthday Party">Birthday Party</option>
                      <option value="Corporate Event">Corporate Event</option>
                      <option value="Anniversary">Anniversary</option>
                      <option value="Graduation">Graduation</option>
                      <option value="Baby Shower">Baby Shower</option>
                      <option value="Holiday Party">Holiday Party</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="eventDate" className="block text-sm font-medium text-gray-700 mb-2">
                      Event Date *
                    </label>
                    <input
                      type="date"
                      id="eventDate"
                      name="eventDate"
                      required
                      value={formData.eventDate}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label htmlFor="eventLocation" className="block text-sm font-medium text-gray-700 mb-2">
                      Event Location *
                    </label>
                    <input
                      type="text"
                      id="eventLocation"
                      name="eventLocation"
                      required
                      value={formData.eventLocation}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter event location"
                    />
                  </div>
                  <div>
                    <label htmlFor="numberOfGuests" className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Guests *
                    </label>
                    <select
                      id="numberOfGuests"
                      name="numberOfGuests"
                      required
                      value={formData.numberOfGuests}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select number of guests</option>
                      <option value="1-25">1-25</option>
                      <option value="26-50">26-50</option>
                      <option value="51-100">51-100</option>
                      <option value="101-200">101-200</option>
                      <option value="201-500">201-500</option>
                      <option value="500+">500+</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="budgetRange" className="block text-sm font-medium text-gray-700 mb-2">
                      Budget Range *
                    </label>
                    <select
                      id="budgetRange"
                      name="budgetRange"
                      required
                      value={formData.budgetRange}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select budget range</option>
                      <option value="Under $500">Under $500</option>
                      <option value="$500 - $1,000">$500 - $1,000</option>
                      <option value="$1,000 - $2,500">$1,000 - $2,500</option>
                      <option value="$2,500 - $5,000">$2,500 - $5,000</option>
                      <option value="$5,000 - $10,000">$5,000 - $10,000</option>
                      <option value="$10,000 - $25,000">$10,000 - $25,000</option>
                      <option value="$25,000+">$25,000+</option>
                      <option value="Not specified">Not specified</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Additional Details Section */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6" style={{ fontFamily: "Raleway, sans-serif" }}>
                  Additional Details
                </h2>
                <div>
                  <label htmlFor="additionalDetails" className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Information or Requirements
                  </label>
                  <textarea
                    id="additionalDetails"
                    name="additionalDetails"
                    rows={6}
                    value={formData.additionalDetails}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Please provide any additional details about your event, specific requirements, or questions for the vendor..."
                  />
                </div>
              </div>

              {/* Available Services Section - same as onboarded (external vendors have no services yet) */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6" style={{ fontFamily: "Raleway, sans-serif" }}>
                  Available Services
                </h2>
                <p className="text-gray-600">No services available at the moment.</p>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end space-x-4">
                <button
                  type="button"
                  onClick={() => router.push("/search/vendors")}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-3 bg-[#0B1A33] text-white rounded-md hover:bg-[#1a2a4a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting..." : "Submit Quote Request"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}
