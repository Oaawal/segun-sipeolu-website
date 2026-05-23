import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { firm } from "@/lib/site-data";

export default function ContactPage() {
  return (
    <>
      <Header />
      <main>
        <section className="bg-[#2B0D17] px-6 py-24 text-white">
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#D4B06A]">Contact</p>
            <h1 className="font-serif text-5xl md:text-7xl">Contact Chambers</h1>
          </div>
        </section>

        <section className="bg-[#F8F5F2] py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2">
            <div>
              <h2 className="font-serif text-4xl text-[#2B0D17]">Lagos Office</h2>
              <div className="mt-8 space-y-5 text-lg text-gray-700">
                <p>{firm.address}</p>
                <p>Direct Line: {firm.phone}</p>
                <p>Email: {firm.email}</p>
                <p>Office Hours: Monday to Friday, 8:00AM to 6:00PM</p>
              </div>
            </div>

            <form className="space-y-5 bg-white p-8 shadow-sm">
              <input placeholder="Full Name" className="w-full border border-gray-200 px-5 py-4" />
              <input placeholder="Email Address" className="w-full border border-gray-200 px-5 py-4" />
              <input placeholder="Phone Number" className="w-full border border-gray-200 px-5 py-4" />
              <textarea placeholder="Message" rows={6} className="w-full border border-gray-200 px-5 py-4" />
              <button className="w-full bg-[#6D1F3B] px-6 py-4 text-sm uppercase tracking-[0.2em] text-white">
                Submit Message
              </button>
            </form>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}