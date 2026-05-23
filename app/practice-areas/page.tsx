import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Link from "next/link";
import { services } from "@/lib/site-data";

export default function PracticeAreasPage() {
  return (
    <>
      <Header />
      <main>
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Practice Areas</p>
            <h1 className="font-serif text-5xl md:text-7xl">Our Legal Services</h1>
            <p className="mt-6 max-w-3xl text-white/75">
              Explore the firm’s full range of legal services across litigation, corporate law, property, immigration, aviation, shipping, oil and gas, arbitration, and more.
            </p>
          </div>
        </section>

        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Link key={s.slug} href={`/practice-areas/${s.slug}`} className="border border-[#E8DED3] bg-white p-8 transition hover:-translate-y-1">
                <h2 className="font-serif text-2xl text-[#2B0D17]">{s.title}</h2>
                <p className="mt-4 leading-relaxed text-gray-600">{s.summary}</p>
                <p className="mt-8 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">Read More →</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}