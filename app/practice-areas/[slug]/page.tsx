import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { services, firm } from "@/lib/site-data";

export async function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export default async function PracticeAreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);
  if (!service) notFound();

  const otherServices = services.filter((s) => s.slug !== slug).slice(0, 4);

  return (
    <>
      <Header />
      <main>

        {/* Hero */}
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <Link href="/practice-areas" className="text-xs uppercase tracking-[0.3em] text-[#D4B06A]/70 hover:text-[#D4B06A]">
              ← Practice Areas
            </Link>
            <h1 className="mt-6 font-serif text-5xl leading-tight md:text-7xl">{service.title}</h1>
            <p className="mt-6 max-w-2xl text-white/70 text-lg">{service.summary}</p>
          </div>
        </section>

        {/* Content */}
        <section className="bg-white py-24">
          <div className="mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-[1fr,340px]">

            {/* Main */}
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Overview</p>
              <h2 className="mt-4 font-serif text-4xl text-[#2B0D17]">How We Can Help</h2>
              <div className="mt-8 space-y-5 text-lg leading-relaxed text-gray-700">
                <p>{service.summary}</p>
                <p>
                  Segun Sipeolu & Associates brings over 30 years of experience to every matter in this practice area.
                  Our team provides practical, results-driven legal counsel tailored to your specific needs.
                </p>
                <p>
                  We work with individuals, businesses, government agencies, and institutions — delivering
                  strategic legal solutions with integrity and professionalism.
                </p>
              </div>

              <div className="mt-14 grid gap-6 md:grid-cols-2">
                {[
                  { title: "Expert Counsel", body: "Over 30 years of active legal practice in this and related areas." },
                  { title: "Client-Focused", body: "We tailor our approach to your specific circumstances and objectives." },
                  { title: "Proven Results", body: "A track record of successful outcomes for over 3,000 clients." },
                  { title: "Global Reach", body: "Extensive networks across 9 cities including London, Dubai, and New York." },
                ].map((item) => (
                  <div key={item.title} className="border-t-2 border-[#6D1F3B] bg-[#F8F5F2] p-6">
                    <h3 className="font-serif text-xl text-[#2B0D17]">{item.title}</h3>
                    <p className="mt-3 text-gray-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <aside className="space-y-6">
              <div className="bg-[#2B0D17] p-8 text-white">
                <h3 className="font-serif text-2xl">Request a Consultation</h3>
                <p className="mt-3 text-sm text-white/60">
                  Speak confidentially with our team about your {service.title.toLowerCase()} matter.
                </p>
                <div className="mt-6 space-y-3">
                  <Link href="/contact" className="block w-full bg-[#6D1F3B] py-3 text-center text-xs uppercase tracking-[0.2em] text-white transition hover:bg-[#8B2A4A]">
                    Book Consultation
                  </Link>
                  <a href={`https://wa.me/${firm.whatsapp}`} target="_blank" rel="noopener noreferrer" className="block w-full border border-white/20 py-3 text-center text-xs uppercase tracking-[0.2em] text-white/80 transition hover:bg-white/10">WhatsApp Us</a>
                </div>
                <div className="mt-6 border-t border-white/10 pt-6 space-y-3 text-sm text-white/60">
                  <p>{firm.phone}</p>
                  <p>{firm.email}</p>
                </div>
              </div>

              <div className="border border-[#E8DED3] bg-[#F8F5F2] p-8">
                <h3 className="font-serif text-xl text-[#2B0D17]">Other Practice Areas</h3>
                <div className="mt-5 space-y-3">
                  {otherServices.map((s) => (
                    <Link key={s.slug} href={`/practice-areas/${s.slug}`} className="block border-b border-[#E8DED3] pb-3 text-sm text-gray-700 hover:text-[#6D1F3B]">
                      {s.title} →
                    </Link>
                  ))}
                  <Link href="/practice-areas" className="block pt-1 text-xs uppercase tracking-[0.2em] text-[#6D1F3B] hover:underline">
                    View All 14 Areas
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#6D1F3B] py-20 text-white">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <h2 className="font-serif text-4xl">Ready to discuss your matter?</h2>
            <p className="mt-4 text-white/70">Our team is available for confidential consultations.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/contact" className="bg-white px-8 py-4 text-sm uppercase tracking-[0.2em] text-[#6D1F3B] transition hover:bg-[#F8F5F2]">
                Contact Chambers
              </Link>
              <Link href="/attorneys" className="border border-white/40 px-8 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-white/10">
                Meet Our Attorneys
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