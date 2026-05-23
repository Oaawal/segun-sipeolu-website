import Image from "next/image";
import { notFound } from "next/navigation";

import { attorneys } from "@/data/attorneys";

type Props = {
  params: {
    slug: string;
  };
};

export async function generateStaticParams() {
  return attorneys.map((attorney) => ({
    slug: attorney.slug,
  }));
}

export default function AttorneyPage({ params }: Props) {
  const attorney = attorneys.find(
    (a) => a.slug === params.slug
  );

  if (!attorney) {
    notFound();
  }

  return (
    <main className="bg-[#F8F5F2]">
      <section className="relative overflow-hidden bg-[#2B0D17] py-24 text-white">
        <div className="mx-auto max-w-7xl px-6">
          <p className="text-sm uppercase tracking-[0.3em] text-[#D4AF37]">
            Barristers & Solicitors
          </p>

          <h1 className="mt-6 font-serif text-5xl md:text-7xl">
            {attorney.name}
          </h1>

          <p className="mt-6 text-lg uppercase tracking-[0.2em] text-white/80">
            {attorney.role}
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-[420px,1fr]">
          <div>
            <Image
              src={attorney.image}
              alt={attorney.name}
              width={700}
              height={900}
              className="aspect-[4/5] w-full object-cover"
            />

            <div className="mt-8 border border-[#6D1F3B]/10 bg-white p-8">
              <h3 className="font-serif text-2xl text-[#2B0D17]">
                Contact Information
              </h3>

              <div className="mt-6 space-y-5">
                {attorney.phone && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">
                      Phone
                    </p>

                    <p className="mt-2 text-gray-700">
                      {attorney.phone}
                    </p>
                  </div>
                )}

                {attorney.email && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#6D1F3B]">
                      Email
                    </p>

                    <p className="mt-2 text-gray-700">
                      {attorney.email}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-[#6D1F3B]">
                Professional Experience
              </p>

              <h2 className="mt-4 font-serif text-4xl text-[#2B0D17]">
                Biography
              </h2>

              <p className="mt-8 whitespace-pre-line leading-relaxed text-gray-700">
                {attorney.bio}
              </p>
            </div>

            {attorney.education && (
              <div className="mt-20">
                <p className="text-sm uppercase tracking-[0.3em] text-[#6D1F3B]">
                  Education
                </p>

                <div className="mt-10 space-y-6">
                  {attorney.education.map((edu, index) => (
                    <div
                      key={index}
                      className="border border-[#6D1F3B]/10 bg-white p-8"
                    >
                      <h3 className="font-serif text-2xl text-[#2B0D17]">
                        {edu.degree}
                      </h3>

                      <p className="mt-2 text-sm uppercase tracking-[0.2em] text-[#6D1F3B]">
                        {edu.school}
                      </p>

                      <p className="mt-5 leading-relaxed text-gray-700">
                        {edu.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {attorney.practiceAreas && (
              <div className="mt-20">
                <p className="text-sm uppercase tracking-[0.3em] text-[#6D1F3B]">
                  Practice Areas
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
                  {attorney.practiceAreas.map((area, index) => (
                    <div
                      key={index}
                      className="border border-[#6D1F3B]/10 bg-white px-5 py-3 text-sm uppercase tracking-[0.15em] text-[#2B0D17]"
                    >
                      {area}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {attorney.memberships && (
              <div className="mt-20">
                <p className="text-sm uppercase tracking-[0.3em] text-[#6D1F3B]">
                  Memberships
                </p>

                <div className="mt-8 space-y-4">
                  {attorney.memberships.map((membership, index) => (
                    <div
                      key={index}
                      className="border border-[#6D1F3B]/10 bg-white p-5"
                    >
                      {membership}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {attorney.certifications && (
              <div className="mt-20">
                <p className="text-sm uppercase tracking-[0.3em] text-[#6D1F3B]">
                  Certifications
                </p>

                <div className="mt-8 space-y-4">
                  {attorney.certifications.map((cert, index) => (
                    <div
                      key={index}
                      className="border border-[#6D1F3B]/10 bg-white p-5"
                    >
                      {cert}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}