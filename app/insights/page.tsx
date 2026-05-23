import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Link from "next/link";
import { insights } from "@/lib/site-data";

export default function InsightsPage() {
  return (
    <>
      <Header />
      <main>
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Our Journal</p>
            <h1 className="font-serif text-5xl md:text-7xl">Legal Insights</h1>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto grid max-w-7xl gap-6 px-6 lg:grid-cols-3">
            {insights.map((post) => (
              <Link key={post.slug} href={`/insights/${post.slug}`} className="border border-[#E8DED3] bg-[#FAF8F5] p-8">
                <p className="text-xs uppercase tracking-[0.25em] text-[#6D1F3B]">{post.category}</p>
                <h2 className="mt-5 font-serif text-2xl text-[#2B0D17]">{post.title}</h2>
                <p className="mt-4 text-gray-600">{post.summary}</p>
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