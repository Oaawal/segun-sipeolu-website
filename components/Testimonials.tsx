const testimonials = [
  {
    quote:
      "Segun Sipeolu & Associates handled our commercial dispute with professionalism and strategic precision.",
    name: "Corporate Client",
  },
  {
    quote:
      "Their responsiveness and legal insight gave us confidence throughout a sensitive property transaction.",
    name: "Real Estate Client",
  },
];

export default function Testimonials() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 max-w-3xl">
          <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
            Client Confidence
          </p>

          <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
            Trusted Legal Representation Built on Excellence
          </h2>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {testimonials.map((item) => (
            <div
              key={item.name}
              className="border border-[#E7DED3] bg-[#FAF8F5] p-10"
            >
              <p className="text-lg leading-relaxed text-gray-700">
                “{item.quote}”
              </p>

              <p className="mt-8 font-serif text-2xl text-[#2B0D17]">
                {item.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}