import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { stats } from "@/lib/site-data";

export default function AboutPage() {
  return (
    <>
      <Header />
      <main>
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">About SOS&A</p>
            <h1 className="font-serif text-5xl md:text-7xl">A Legacy of Legal Excellence</h1>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-2">
            <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
              From personal to business legal advice, we are dedicated to pursuing the best possible outcomes.
            </h2>
            <div className="space-y-6 text-lg leading-relaxed text-gray-700">
              <p>
                Segun Sipeolu & Associates is a full-service Nigerian law firm with a strong reputation for integrity, client service, and professional legal representation.
              </p>
              <p>
                The firm serves clients across corporate affairs, litigation, commercial law, property law, intellectual property, immigration, shipping, aviation, oil and gas, telecommunications, and arbitration.
              </p>
              <p>
                Our office is strategically located in Ikeja, Lagos, within the commercial nerve centre of Lagos State.
              </p>
            </div>
          </div>
        </section>

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
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}