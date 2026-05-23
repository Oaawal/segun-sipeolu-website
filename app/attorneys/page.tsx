import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Image from "next/image";
import Link from "next/link";
import { attorneys } from "@/lib/site-data";

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
              Meet the professionals behind the firm’s legal representation, advisory work, and client service.
            </p>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-2 lg:grid-cols-3">
            {attorneys.map((a) => (
              <Link key={a.slug} href={`/attorneys/${a.slug}`} className="group block">
                <div className="overflow-hidden bg-[#F8F5F2]">
                  <Image src={a.image} alt={a.name} width={700} height={850} className="h-[420px] w-full object-cover object-top grayscale transition duration-500 group-hover:grayscale-0" />
                </div>
                <h2 className="mt-6 font-serif text-2xl text-[#2B0D17]">{a.name}</h2>
                <p className="mt-2 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">{a.role}</p>
                <p className="mt-4 text-sm text-gray-600">{a.email}</p>
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