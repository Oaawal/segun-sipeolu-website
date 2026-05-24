import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Link from "next/link";

export default function CareersPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Careers</p>
            <h1 className="font-serif text-5xl md:text-7xl">Join Our Chambers</h1>
            <p className="mt-6 max-w-2xl text-white/70">
              We welcome ambitious legal professionals who share our commitment to excellence, integrity, and client service.
            </p>
          </div>
        </section>

        {/* Why join */}
        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Why SOS&A</p>
            <h2 className="font-serif text-4xl text-[#2B0D17]">Build your legal career with us</h2>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {[
                { title: "Rich Experience", body: "Work alongside seasoned practitioners with over 30 years of active legal practice across diverse areas of law." },
                { title: "Diverse Practice", body: "Exposure to 14+ practice areas including litigation, corporate, property, oil & gas, aviation, shipping, and more." },
                { title: "Global Networks", body: "Benefit from the firm's extensive connections in London, New York, Dubai, Accra, Johannesburg, and beyond." },
              ].map((item) => (
                <div key={item.title} className="border-t-2 border-[#6D1F3B] bg-[#F8F5F2] p-8">
                  <h3 className="font-serif text-2xl text-[#2B0D17]">{item.title}</h3>
                  <p className="mt-4 leading-relaxed text-gray-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Open positions */}
        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Openings</p>
            <h2 className="font-serif text-4xl text-[#2B0D17]">Current Opportunities</h2>
            <div className="mt-10 space-y-4">
              {[
                { role: "Associate — Litigation", type: "Full-time · Lagos" },
                { role: "Associate — Corporate & Commercial", type: "Full-time · Lagos" },
                { role: "Legal Intern", type: "Internship · Lagos" },
                { role: "Paralegal", type: "Full-time · Lagos" },
              ].map((job) => (
                <div key={job.role} className="flex flex-col justify-between gap-4 border border-[#E8DED3] bg-white p-6 md:flex-row md:items-center">
                  <div>
                    <h3 className="font-serif text-xl text-[#2B0D17]">{job.role}</h3>
                    <p className="mt-1 text-sm text-gray-500">{job.type}</p>
                  </div>
                  <a href="mailto:careers@segunsipeolu.com" className="border border-[#6D1F3B] px-6 py-2.5 text-xs uppercase tracking-[0.2em] text-[#6D1F3B] transition hover:bg-[#6D1F3B] hover:text-white">Apply Now</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How to apply */}
        <section className="bg-white py-24">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Apply</p>
            <h2 className="font-serif text-4xl text-[#2B0D17]">How to Apply</h2>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-700">
              Send your cover letter and CV to our careers email. Shortlisted candidates will be contacted within 5 business days.
            </p>
            <div className="mt-8">
              <a href="mailto:careers@segunsipeolu.com" className="inline-block bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-[#2B0D17]">
                careers@segunsipeolu.com
              </a>
            </div>
            <p className="mt-6 text-sm text-gray-400">
              We are an equal opportunity employer committed to diversity and inclusion.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#2B0D17] py-20 text-white">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <h2 className="font-serif text-4xl">Have questions?</h2>
            <p className="mt-4 text-white/60">Reach out to us directly for more information.</p>
            <Link href="/contact" className="mt-8 inline-block border border-[#D4B06A] px-8 py-4 text-sm uppercase tracking-[0.2em] text-[#D4B06A] transition hover:bg-[#D4B06A] hover:text-[#2B0D17]">
              Contact Chambers
            </Link>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}