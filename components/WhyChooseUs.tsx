const reasons = [
  "Over 30 years of legal excellence",
  "Client-focused legal representation",
  "Experienced litigation and advisory team",
  "Strategic commercial legal solutions",
  "Institutional professionalism and integrity",
  "Responsive and confidential legal support",
];

export default function WhyChooseUs() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
            Why Choose Us
          </p>

          <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
            Trusted Legal Representation Built on Experience, Precision, and Professionalism
          </h2>
        </div>

        <div className="grid gap-5">
          {reasons.map((reason) => (
            <div
              key={reason}
              className="flex items-center gap-4 border border-[#E8DED3] bg-[#FAF8F5] p-5"
            >
              <div className="h-2.5 w-2.5 rounded-full bg-[#6D1F3B]" />

              <p className="text-lg text-gray-700">
                {reason}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}