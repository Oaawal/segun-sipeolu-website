import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Link from "next/link";
import Image from "next/image";
import { attorneys, firm, insights, services, stats } from "@/lib/site-data";

export default function Home() {
  return (
    <>
      <Header />

      <main>
        <section className="relative min-h-[82vh] overflow-hidden bg-[#2B0D17] text-white">
          <Image src="/hero.jpg" alt="Legal chambers" fill priority className="object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-[#2B0D17]/70 to-black/40" />

          <div className="relative mx-auto flex min-h-[82vh] max-w-7xl flex-col justify-center px-6 py-24">
            <p className="mb-6 text-xs uppercase tracking-[0.4em] text-[#D4B06A]">
              Barristers & Solicitors
            </p>
            <h1 className="max-w-5xl font-serif text-5xl leading-tight md:text-7xl">
              Delivering Cutting Edge Legal Solutions Since 1993
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/80">
              A full-service Nigerian law firm providing strategic legal representation for individuals, businesses, and institutions.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/contact" className="bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white">
                Book Consultation
              </Link>
              <Link href="/practice-areas" className="border border-white/30 px-8 py-4 text-sm uppercase tracking-[0.2em] text-white">
                View Practice Areas
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-white py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <h2 className="font-serif text-5xl text-[#6D1F3B]">{s.value}</h2>
                <p className="mt-3 text-sm uppercase tracking-[0.18em] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">The Firm</p>
              <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
                Trusted, experienced, client-friendly, and result-oriented.
              </h2>
            </div>
            <div className="space-y-6 text-lg leading-relaxed text-gray-700">
              <p>
                {firm.name} is a Lagos-based law firm built on integrity, professional discipline, and legal excellence.
              </p>
              <p>
                The firm serves clients across litigation, corporate affairs, property, commercial law, debt recovery, immigration, arbitration, and other specialist areas.
              </p>
              <Link href="/about" className="inline-block text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">
                Read More →
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Practice Areas</p>
                <h2 className="font-serif text-4xl text-[#2B0D17] md:text-5xl">
                  Strategic legal support across core sectors.
                </h2>
              </div>
              <Link href="/practice-areas" className="text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">
                View All Services →
              </Link>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {services.slice(0, 4).map((s) => (
                <Link key={s.slug} href={`/practice-areas/${s.slug}`} className="border border-[#E8DED3] bg-[#FAF8F5] p-8 transition hover:-translate-y-1">
                  <h3 className="font-serif text-2xl text-[#2B0D17]">{s.title}</h3>
                  <p className="mt-4 text-gray-600">{s.summary}</p>
                  <p className="mt-6 text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">Read More →</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#2B0D17] py-24 text-white">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Team</p>
            <h2 className="font-serif text-4xl md:text-5xl">Our Team of Experts</h2>
            <p className="mt-5 max-w-2xl text-white/70">
              We have a team of professionals that provide top-tier advice and client service.
            </p>
            <div className="mt-10">
              <Link href="/attorneys" className="bg-white px-8 py-4 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">
                Meet Our Lawyers
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto max-w-7xl px-6">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Legal Insights</p>
            <h2 className="font-serif text-4xl text-[#2B0D17] md:text-5xl">Professional legal perspectives.</h2>

            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {insights.map((post) => (
                <Link key={post.slug} href={`/insights/${post.slug}`} className="border border-[#E8DED3] bg-[#FAF8F5] p-8">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">{post.category}</p>
                  <h3 className="mt-5 font-serif text-2xl text-[#2B0D17]">{post.title}</h3>
                  <p className="mt-4 text-gray-600">{post.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Consultation</p>
              <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
                Request a confidential legal consultation.
              </h2>
            </div>
            <div>
              <Link href="/contact" className="inline-block bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white">
                Contact Chambers
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <WhatsAppButton />
    </>
  );
}