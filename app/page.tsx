import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import StatsSection from "@/components/StatsSection";
import Link from "next/link";
import Image from "next/image";
import { attorneys, firm, insights, services } from "@/lib/site-data";

export default function Home() {
  return (
    <>
      <Header />

      <main>
        {/* Hero */}
        <section className="relative min-h-[88vh] overflow-hidden bg-[#2B0D17] text-white">
          <Image src="/hero.jpg" alt="Legal chambers" fill priority className="object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#2B0D17] via-[#2B0D17]/80 to-[#2B0D17]/40" />

          <div className="relative mx-auto flex min-h-[88vh] max-w-7xl flex-col justify-center px-6 py-24">
            <p className="mb-6 text-xs uppercase tracking-[0.5em] text-[#D4B06A]">
              Barristers & Solicitors · Est. 1993
            </p>
            <h1 className="max-w-4xl font-serif text-5xl leading-[1.1] md:text-7xl">
              Delivering Cutting Edge Legal Solutions Since 1993
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/70">
              A full-service Nigerian law firm providing strategic legal representation
              for individuals, businesses, and institutions across Lagos and globally.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/contact" className="bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-[#8B2A4A]">
                Book Consultation
              </Link>
              <Link href="/practice-areas" className="border border-[#D4B06A]/50 px-8 py-4 text-sm uppercase tracking-[0.2em] text-[#D4B06A] transition hover:bg-[#D4B06A]/10">
                View Practice Areas
              </Link>
            </div>

            {/* Bottom bar */}
            <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-black/20">
              <div className="mx-auto flex max-w-7xl flex-wrap gap-8 px-6 py-5 text-xs text-white/50">
                <span>📍 Ikeja, Lagos</span>
                <span>📞 {firm.phone}</span>
                <span>✉ {firm.email}</span>
                <span>🌐 9 Global Networks</span>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <StatsSection />

        {/* About the firm */}
        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">The Firm</p>
              <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
                Trusted, experienced, client-friendly, and result-oriented.
              </h2>
              <Link href="/about" className="mt-8 inline-block text-sm uppercase tracking-[0.2em] text-[#6D1F3B] hover:underline">
                Read More →
              </Link>
            </div>
            <div className="space-y-5 text-lg leading-relaxed text-gray-700">
              <p>
                {firm.name} is a Lagos-based law firm built on integrity, professional discipline,
                and legal excellence — serving clients since 1993.
              </p>
              <p>
                The firm serves clients across litigation, corporate affairs, property, commercial
                law, debt recovery, immigration, arbitration, and other specialist areas with
                extensive networks in London, China, Paris, New York, Dubai, and beyond.
              </p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="border-l-2 border-[#6D1F3B] pl-4">
                  <p className="font-serif text-2xl text-[#6D1F3B]">30+</p>
                  <p className="text-sm text-gray-500">Years active</p>
                </div>
                <div className="border-l-2 border-[#6D1F3B] pl-4">
                  <p className="font-serif text-2xl text-[#6D1F3B]">9</p>
                  <p className="text-sm text-gray-500">Global networks</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Practice Areas */}
        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Practice Areas</p>
                <h2 className="font-serif text-4xl text-[#2B0D17] md:text-5xl">
                  Strategic legal support<br />across core sectors.
                </h2>
              </div>
              <Link href="/practice-areas" className="text-sm uppercase tracking-[0.2em] text-[#6D1F3B] hover:underline">
                View All 14 Areas →
              </Link>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {services.slice(0, 8).map((s) => (
                <Link key={s.slug} href={`/practice-areas/${s.slug}`} className="group border border-[#E8DED3] bg-[#FAF8F5] p-8 transition hover:-translate-y-1 hover:border-[#6D1F3B]/40 hover:shadow-sm">
                  <h3 className="font-serif text-xl text-[#2B0D17] group-hover:text-[#6D1F3B] transition-colors">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-500">{s.summary}</p>
                  <p className="mt-6 text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">Read More →</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Team */}
        <section className="bg-[#2B0D17] py-24 text-white">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Our Team</p>
                <h2 className="font-serif text-4xl md:text-5xl">Meet the Attorneys</h2>
                <p className="mt-5 max-w-xl text-white/60">
                  A dynamic team of barristers and solicitors delivering exceptional results since 1993.
                </p>
              </div>
              <Link href="/attorneys" className="border border-[#D4B06A]/50 px-8 py-4 text-sm uppercase tracking-[0.2em] text-[#D4B06A] transition hover:bg-[#D4B06A]/10">
                Meet Our Lawyers
              </Link>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {attorneys.slice(0, 3).map((a) => (
                <Link key={a.slug} href={`/attorneys/${a.slug}`} className="group block border border-white/10 p-6 transition hover:border-[#D4B06A]/40 hover:bg-white/5">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center bg-[#6D1F3B]/40 font-serif text-2xl text-[#D4B06A]">
                    {a.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <h3 className="font-serif text-xl text-white group-hover:text-[#D4B06A] transition-colors">{a.name}</h3>
                  <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[#D4B06A]/70">{a.role}</p>
                  <p className="mt-4 text-sm text-white/50">{a.bio}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Insights */}
        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Legal Insights</p>
                <h2 className="font-serif text-4xl text-[#2B0D17] md:text-5xl">Professional legal perspectives.</h2>
              </div>
              <Link href="/insights" className="text-sm uppercase tracking-[0.2em] text-[#6D1F3B] hover:underline">
                View All →
              </Link>
            </div>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {insights.map((post) => (
                <Link key={post.slug} href={`/insights/${post.slug}`} className="group border border-[#E8DED3] bg-[#FAF8F5] p-8 transition hover:border-[#6D1F3B]/40">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">{post.category}</p>
                  <h3 className="mt-4 font-serif text-2xl text-[#2B0D17] group-hover:text-[#6D1F3B] transition-colors">{post.title}</h3>
                  <p className="mt-4 text-sm leading-relaxed text-gray-500">{post.summary}</p>
                  <p className="mt-6 text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">Read More →</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-[#6D1F3B] py-24 text-white">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Get Started</p>
            <h2 className="font-serif text-4xl md:text-5xl">
              Request a confidential<br />legal consultation.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-white/70">
              Whether you are an individual, business, or institution — our team is ready to help.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/contact" className="bg-white px-8 py-4 text-sm uppercase tracking-[0.2em] text-[#6D1F3B] transition hover:bg-[#F8F5F2]">
                Contact Chambers
              </Link>
              <a href={`https://wa.me/${firm.whatsapp}`} target="_blank" rel="noopener noreferrer" className="border border-white/40 px-8 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-white/10">WhatsApp Us</a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <WhatsAppButton />
    </>
  );
}