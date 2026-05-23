import Image from "next/image";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[#2B0D17] text-white">
      <div className="absolute inset-0 bg-black/50 z-10" />

      <Image
        src="/hero.jpg"
        alt="Law Firm"
        fill
        priority
        className="object-cover"
      />

      <div className="relative z-20 mx-auto flex min-h-[78vh] max-w-7xl flex-col justify-center px-6 py-20">
        <div className="max-w-4xl">
          <p className="mb-6 text-xs uppercase tracking-[0.4em] text-[#D4AF37]">
            Barristers & Solicitors
          </p>

          <h1 className="font-serif text-5xl leading-tight md:text-7xl">
            Strategic Legal Solutions Rooted in Experience and Excellence
          </h1>

          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/80">
            Segun Sipeolu & Associates provides sophisticated legal counsel
            across litigation, corporate advisory, commercial disputes, and
            property law in Nigeria.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <button className="bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-[#54152d]">
              Book Consultation
            </button>

            <button className="border border-white/30 px-8 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-white hover:text-black">
              Contact Chambers
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}