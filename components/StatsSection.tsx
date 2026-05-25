const stats = [
  { number: "30+", label: "Years of Legal Excellence" },
  { number: "3000+", label: "Clients Represented" },
  { number: "14", label: "Core Practice Areas" },
  { number: "24/7", label: "Client Support Commitment" },
];

export default function StatsSection() {
  return (
    <section className="bg-[#1A5A3C] py-20 text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border-l-2 border-white/20 pl-6">
            <h3 className="font-serif text-5xl text-[#D4B06A]">{stat.number}</h3>
            <p className="mt-4 text-sm uppercase tracking-[0.2em] text-white/80">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}