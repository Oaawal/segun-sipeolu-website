import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Link from "next/link";
import { stats, firm } from "@/lib/site-data";

export default function AboutPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">About SOS&A</p>
            <h1 className="font-serif text-5xl md:text-7xl">A Legacy of Legal Excellence</h1>
            <p className="mt-6 max-w-2xl text-white/70">
              Over three decades of trusted legal representation in Lagos and across the globe.
            </p>
          </div>
        </section>

        {/* Intro */}
        <section className="bg-white py-24">
          <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-2 lg:items-start">
            <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
              From personal to business legal advice, we are dedicated to pursuing the best possible outcomes.
            </h2>
            <div className="space-y-6 text-lg leading-relaxed text-gray-700">
              <p>
                Segun Sipeolu & Associates is a full-service Nigerian law firm with a strong reputation for integrity, client service, and professional legal representation since 1993.
              </p>
              <p>
                The firm serves clients across corporate affairs, litigation, commercial law, property law, intellectual property, immigration, shipping, aviation, oil and gas, telecommunications, and arbitration.
              </p>
              <p>
                Our office is strategically located in Ikeja, Lagos — within the Central Business District, the commercial nerve centre of Lagos State.
              </p>
            </div>
          </div>
        </section>

        {/* Managing Partner */}
        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Leadership</p>
            <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="font-serif text-4xl text-[#2B0D17]">Samuel Olusegun Sipeolu</h2>
                <p className="mt-2 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">Founder & Managing Partner</p>
                <div className="mt-8 space-y-5 text-lg leading-relaxed text-gray-700">
                  <p>
                    Mr. Samuel Olusegun Sipeolu has been in active legal practice for over 30 years. He is a Solicitor of the Supreme Court of England and Wales and holds a Master of Laws degree (LLM, Oil and Gas Law) from Robert Gordon University, Aberdeen, Scotland.
                  </p>
                  <p>
                    He leads a dynamic team of barristers and solicitors, delivering exceptional legal results for clients across Nigeria and internationally.
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap gap-4">
                  <Link href="/attorneys" className="bg-[#6D1F3B] px-6 py-3 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-[#2B0D17]">
                    Meet the Full Team
                  </Link>
                  <Link href="/contact" className="border border-[#6D1F3B] px-6 py-3 text-sm uppercase tracking-[0.2em] text-[#6D1F3B] transition hover:bg-[#6D1F3B] hover:text-white">
                    Book Consultation
                  </Link>
                </div>
              </div>

              {/* Credentials */}
              <div className="space-y-4">
                {[
                  { label: "Qualification", value: "Solicitor, Supreme Court of England & Wales" },
                  { label: "Education", value: "LLM, Oil and Gas Law — Robert Gordon University, Aberdeen" },
                  { label: "Experience", value: "30+ years in active legal practice" },
                  { label: "Specialisation", value: "Litigation, Corporate Advisory, Oil & Gas, Property" },
                  { label: "Networks", value: "London, Paris, Amsterdam, New York, Houston, Dubai, Guangzhou, Accra, Johannesburg" },
                ].map((item) => (
                  <div key={item.label} className="border border-[#E8DED3] bg-white p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">{item.label}</p>
                    <p className="mt-2 text-gray-700">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="bg-[#6D1F3B] py-20 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <h3 className="font-serif text-5xl text-[#D4B06A]">{s.value}</h3>
                <p className="mt-3 text-sm uppercase tracking-[0.18em] text-white/80">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Our Values</p>
            <h2 className="font-serif text-4xl text-[#2B0D17]">What sets us apart</h2>
            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {[
                { title: "Trusted", body: "Built on integrity and the highest legal ethics over three decades of practice within and outside Nigeria." },
                { title: "Experienced", body: "A rich blend of young and experienced professionals determined to deliver exceptional results since 1993." },
                { title: "Client-Friendly", body: "Shared empathy underpins our commitment to bespoke solutions and robust client relationships." },
                { title: "Result-Oriented", body: "We deliver top-drawer creative legal solutions that surpass the expectations of our teeming clients." },
              ].map((v, i) => (
                <div key={v.title} className={`pt-8 border-t-2 ${i % 2 === 0 ? 'border-[#6D1F3B]' : 'border-[#1A5A3C]'}`}>
                  <h3 className="font-serif text-2xl text-[#2B0D17]">{v.title}</h3>
                  <p className="mt-4 leading-relaxed text-gray-600">{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Global Networks */}
        <section className="bg-[#F8F5F2] py-20">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Global Reach</p>
            <h2 className="font-serif text-4xl text-[#2B0D17]">Extensive networks across 9 cities</h2>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              {["London", "Paris", "Amsterdam", "New York", "Houston", "Dubai", "Guangzhou", "Accra", "Johannesburg"].map((city) => (
                <span key={city} className="border border-[#6D1F3B]/20 bg-white px-5 py-2.5 text-sm text-[#2B0D17]">
                  {city}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#2B0D17] py-20 text-white">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <h2 className="font-serif text-4xl">Ready to work with us?</h2>
            <p className="mt-4 text-white/60">Contact chambers for a confidential consultation.</p>
            <Link href="/contact" className="mt-8 inline-block bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-[#8B2A4A]">
              Book a Consultation
            </Link>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}