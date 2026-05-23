import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function CareersPage() {
  return (
    <>
      <Header />
      <main>
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Careers</p>
            <h1 className="font-serif text-5xl md:text-7xl">Join Our Chambers</h1>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="font-serif text-4xl text-[#2B0D17]">Career Opportunities</h2>
            <p className="mt-6 text-lg leading-relaxed text-gray-700">
              We welcome applications from innovative, disciplined, and ambitious legal professionals who share our commitment to excellence, integrity, and client service.
            </p>
            <p className="mt-6 text-lg text-gray-700">
              Send your cover letter and CV to:
            </p>
            <p className="mt-4 text-xl font-semibold text-[#6D1F3B]">
              careers@segunsipeolu.com
            </p>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}