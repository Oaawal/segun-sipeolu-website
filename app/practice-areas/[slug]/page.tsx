import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Link from "next/link";
import { services } from "@/lib/site-data";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export default async function PracticeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = services.find((s) => s.slug === slug);

  if (!service) notFound();

  return (
    <>
      <Header />
      <main>
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-5xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Practice Area</p>
            <h1 className="font-serif text-5xl leading-tight md:text-7xl">{service.title}</h1>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto max-w-4xl px-6">
            <p className="text-xl leading-relaxed text-gray-700">{service.summary}</p>

            <div className="mt-10 border-l-4 border-[#6D1F3B] bg-[#F8F5F2] p-8">
              <h2 className="font-serif text-3xl text-[#2B0D17]">How We Assist</h2>
              <p className="mt-4 leading-relaxed text-gray-600">
                Our team provides practical legal advice, representation, documentation, negotiation, and strategic guidance tailored to the client’s objectives.
              </p>
            </div>

            <Link href="/contact" className="mt-10 inline-block bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white">
              Request Consultation
            </Link>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}