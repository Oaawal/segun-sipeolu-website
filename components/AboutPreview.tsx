export default function AboutPreview() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
            The Firm
          </p>

          <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
            A full-service law firm delivering legal solutions since 1993.
          </h2>
        </div>

        <div className="space-y-6 text-lg leading-relaxed text-gray-600">
          <p>
            Segun Sipeolu & Associates is a Lagos-based law firm providing
            legal representation and advisory services to individuals,
            businesses, and institutions.
          </p>

          <p>
            The firm combines litigation experience, commercial understanding,
            and client-focused service to deliver practical legal outcomes.
          </p>
        </div>
      </div>
    </section>
  );
}