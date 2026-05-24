"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { firm, services } from "@/lib/site-data";
import { useState } from "react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Contact</p>
            <h1 className="font-serif text-5xl md:text-7xl">Contact Chambers</h1>
            <p className="mt-6 max-w-2xl text-white/70">
              Reach out for a confidential consultation. We respond within one business day.
            </p>
          </div>
        </section>

        {/* Contact grid */}
        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-2">

            {/* Office info */}
            <div>
              <h2 className="font-serif text-3xl text-[#2B0D17]">Lagos Office</h2>
              <div className="mt-8 space-y-6 text-gray-700">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">Address</p>
                  <p className="mt-2 leading-relaxed">{firm.address}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">Phone</p>
                  <a href={`tel:${firm.phone}`} className="mt-2 block hover:text-[#6D1F3B]">{firm.phone}</a>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">Email</p>
                  <a href={`mailto:${firm.email}`} className="mt-2 block hover:text-[#6D1F3B]">{firm.email}</a>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">Office Hours</p>
                  <p className="mt-2">Monday to Friday, 8:00AM – 6:00PM</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">WhatsApp</p>
                  
                    <a href={`https://wa.me/${firm.whatsapp}`} target="_blank" rel="noopener noreferrer" className="mt-2 block hover:text-[#6D1F3B]">Chat with us on WhatsApp</a>
                </div>
              </div>

              {/* Google Map embed */}
              <div className="mt-10 overflow-hidden border border-[#E8DED3]">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3963.1894813658932!2d3.3506745746312387!3d6.623370193370878!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x103b93c432606625%3A0x4164804b918070f8!2sSegun%20Sipeolu%20and%20Associates!5e0!3m2!1sen!2sng!4v1779665186918!5m2!1sen!2sng"
                  width="100%"
                  height="240"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>

            {/* Form */}
            <div className="bg-white p-10 shadow-sm">
              {submitted ? (
                <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center bg-[#6D1F3B]/10">
                    <span className="text-3xl text-[#6D1F3B]">✓</span>
                  </div>
                  <h3 className="font-serif text-3xl text-[#2B0D17]">Message Received</h3>
                  <p className="mt-4 text-gray-600">
                    Thank you for reaching out. We will respond within one business day.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="font-serif text-3xl text-[#2B0D17]">Send a Message</h2>
                  <p className="mt-2 text-sm text-gray-500">All enquiries are treated with strict confidentiality.</p>

                  <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs uppercase tracking-[0.15em] text-gray-500">Full Name *</label>
                        <input
                          required
                          placeholder="e.g. Adebayo Johnson"
                          className="w-full border border-gray-200 bg-[#FAF8F5] px-4 py-3 text-sm outline-none focus:border-[#6D1F3B]"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs uppercase tracking-[0.15em] text-gray-500">Phone Number</label>
                        <input
                          placeholder="+234 800 000 0000"
                          className="w-full border border-gray-200 bg-[#FAF8F5] px-4 py-3 text-sm outline-none focus:border-[#6D1F3B]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs uppercase tracking-[0.15em] text-gray-500">Email Address *</label>
                      <input
                        required
                        type="email"
                        placeholder="your@email.com"
                        className="w-full border border-gray-200 bg-[#FAF8F5] px-4 py-3 text-sm outline-none focus:border-[#6D1F3B]"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs uppercase tracking-[0.15em] text-gray-500">Practice Area</label>
                      <select className="w-full border border-gray-200 bg-[#FAF8F5] px-4 py-3 text-sm outline-none focus:border-[#6D1F3B]">
                        <option value="">Select a practice area</option>
                        {services.map((s) => (
                          <option key={s.slug} value={s.slug}>{s.title}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs uppercase tracking-[0.15em] text-gray-500">Brief Description *</label>
                      <textarea
                        required
                        rows={5}
                        placeholder="Briefly describe your legal matter..."
                        className="w-full border border-gray-200 bg-[#FAF8F5] px-4 py-3 text-sm outline-none focus:border-[#6D1F3B]"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-[#6D1F3B] px-6 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-[#2B0D17]"
                    >
                      Send Message
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}