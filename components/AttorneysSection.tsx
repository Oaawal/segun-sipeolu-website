import Image from "next/image";

const attorneys = [
  { name: "Samuel Olusegun Sipeolu", role: "Founder & Managing Partner", image: "/attorney-1.jpg" },
  { name: "Tejiri Avwobobe", role: "Senior Partner", image: "/attorney-2.jpg" },
  { name: "Baridura Barikor", role: "Senior Associate", image: "/attorney-3.jpg" },
  { name: "M.P Bamigboye", role: "Junior Associate", image: "/attorney-4.jpg" },
  { name: "Oseni Adedotun Ibrahim", role: "Junior Associate", image: "/attorney-5.jpg" },
  { name: "O.A Abdulwaheed", role: "Paralegal & Digital Operations Support", image: "/attorney-6.jpg" },
];

export default function AttorneysSection() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-6">
        <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
          Our Attorneys
        </p>
        <h2 className="font-serif text-4xl text-[#2B0D17] md:text-5xl">
          Our Team of Experts
        </h2>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {attorneys.map((a) => (
            <div key={a.name} className="overflow-hidden">
              <Image
                src={a.image}
                alt={a.name}
                width={600}
                height={700}
                className="h-[420px] w-full object-cover object-top grayscale"
              />
              <h3 className="mt-5 font-serif text-2xl text-[#2B0D17]">{a.name}</h3>
              <p className="mt-2 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">
                {a.role}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}