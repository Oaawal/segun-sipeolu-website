import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Image from "next/image";
import Link from "next/link";
import { attorneys } from "@/lib/site-data";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return attorneys.map((a) => ({ slug: a.slug }));
}

export default async function AttorneyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const attorney = attorneys.find((a) => a.slug === slug);

  if (!attorney) notFound();

  return (
    <>
      <Header />
      <main>
        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-2 lg:items-center">
            <div className="overflow-hidden bg-white">
              <Image src={attorney.image} alt={attorney.name} width={800} height={1000} className="h-[620px] w-full object-cover object-top grayscale" />
            </div>

            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">Attorney Profile</p>
              <h1 className="font-serif text-5xl leading-tight text-[#2B0D17] md:text-6xl">{attorney.name}</h1>
              <p className="mt-4 text-sm uppercase tracking-[0.25em] text-[#6D1F3B]">{attorney.role}</p>
              <p className="mt-8 text-lg leading-relaxed text-gray-700">{attorney.bio}</p>

              <div className="mt-8 space-y-3 text-gray-700">
                <p>Phone: {attorney.phone}</p>
                <p>Email: {attorney.email}</p>
              </div>

              <Link href="/contact" className="mt-10 inline-block bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white">
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