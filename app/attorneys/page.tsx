import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Image from "next/image";
import Link from "next/link";
import { attorneys, firm } from "@/lib/site-data";

export default function AttorneysPage() {
  return (
    <>
      <Header />
      <main>
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Team</p>
            <h1 className="font-serif text-5xl md:text-7xl">Our Team of Experts</h1>
            <p className="mt-6 max-w-3xl text-white/75">
              Meet the professionals behind the firm's legal representation, advisory work, and client service.
            </p>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-2 lg:grid-cols-3">
            {attorneys.map((a) => (
              <Link key={a.slug} href={`/attorneys/${a.slug}`} className="group block">
                <div className="overflow-hidden bg-[#F8F5F2]">
                  <div className="relative h-[420px] w-full bg-[#F0EBE6]">
                    <Image
                      src={a.image}
                      alt={a.name}
                      fill
                      className="object-cover object-top transition duration-500 group-hover:scale-105"
                    />
                    {/* Fallback initials shown behind image */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-serif text-6xl text-[#6D1F3B]/20">
                        {a.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                  </div>
                </div>
                <h2 className="mt-6 font-serif text-2xl text-[#2B0D17] group-hover:text-[#6D1F3B] transition-colors">
                  {a.name}
                </h2>
                <p className="mt-2 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">{a.role}</p>
                <p className="mt-3 text-sm text-gray-500">{a.email}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#F8F5F2] py-20">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <h2 className="font-serif text-3xl text-[#2B0D17]">Ready to speak with our team?</h2>
            <p className="mt-4 text-gray-600">Contact chambers for a confidential consultation.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/contact"
                className="bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-[#2B0D17]"
              >
                Book Consultation
              </Link>
              
                <a href={`https://wa.me/${firm.whatsapp}`} target="_blank" rel="noopener noreferrer" className="border border-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-[#6D1F3B] transition hover:bg-[#6D1F3B] hover:text-white">WhatsApp Chambers</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}