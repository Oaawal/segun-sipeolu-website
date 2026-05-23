export default function ContactStrip() {
  return (
    <section className="bg-[#2B0D17] py-16 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#D4B06A]">
            Address
          </p>

          <p className="mt-4 leading-relaxed text-white/80">
            12 Hakeem Balogun Street,
            <br />
            Agidingbi, Ikeja,
            <br />
            Lagos, Nigeria
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#D4B06A]">
            Contact
          </p>

          <p className="mt-4 text-white/80">
            +234 909 000 1826
          </p>

          <p className="mt-2 text-white/80">
            info@segunsipeolu.com
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#D4B06A]">
            Office Hours
          </p>

          <p className="mt-4 text-white/80">
            Monday – Friday
          </p>

          <p className="mt-2 text-white/80">
            8:00AM – 6:00PM
          </p>
        </div>
      </div>
    </section>
  );
}