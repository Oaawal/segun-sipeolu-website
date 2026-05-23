const posts = [
  {
    title: "Understanding Corporate Compliance in Nigeria",
    category: "Corporate Law",
  },
  {
    title: "Key Considerations in Commercial Litigation",
    category: "Litigation",
  },
  {
    title: "Property Acquisition and Legal Due Diligence",
    category: "Property Law",
  },
];

export default function InsightsPreview() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
              Legal Insights
            </p>

            <h2 className="font-serif text-4xl leading-tight text-[#2B0D17] md:text-5xl">
              Legal perspectives, industry insights, and professional commentary.
            </h2>
          </div>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {posts.map((post) => (
            <div
              key={post.title}
              className="border border-[#E8DED3] bg-[#FAF8F5] p-8 transition hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-[0.25em] text-[#6D1F3B]">
                {post.category}
              </p>

              <h3 className="mt-6 font-serif text-2xl leading-snug text-[#2B0D17]">
                {post.title}
              </h3>

              <button className="mt-8 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">
                Read Article →
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}