export default function ConsultationCTA() {
  return (
    <section className="bg-[#F8F5F2] py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
            Consultation
          </p>

          <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
            Trusted Legal Guidance for Individuals, Businesses, and Institutions
          </h2>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-600">
            Our chambers provides strategic legal advisory and representation
            tailored to complex disputes, commercial transactions, and corporate
            legal needs.
          </p>
        </div>

        <div className="border border-[#6D1F3B]/10 bg-white p-8 shadow-sm">
          <form className="space-y-5">
            <input
              type="text"
              placeholder="Full Name"
              className="w-full border border-gray-200 px-5 py-4 outline-none transition focus:border-[#6D1F3B]"
            />

            <input
              type="email"
              placeholder="Email Address"
              className="w-full border border-gray-200 px-5 py-4 outline-none transition focus:border-[#6D1F3B]"
            />

            <input
              type="text"
              placeholder="Phone Number"
              className="w-full border border-gray-200 px-5 py-4 outline-none transition focus:border-[#6D1F3B]"
            />

            <textarea
              placeholder="Tell us about your legal matter"
              rows={5}
              className="w-full border border-gray-200 px-5 py-4 outline-none transition focus:border-[#6D1F3B]"
            />

            <button className="w-full bg-[#6D1F3B] px-6 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-[#54152d]">
              Request Consultation
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}