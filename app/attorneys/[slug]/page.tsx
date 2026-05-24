import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Image from "next/image";
import { notFound } from "next/navigation";
import { attorneys } from "@/data/attorneys";

export async function generateStaticParams() {
  return attorneys.map((attorney) => ({
    slug: attorney.slug,
  }));
}

export default async function AttorneyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const attorney = attorneys.find((a) => a.slug === slug);

  if (!attorney) notFound();

  return (
    <>
      <Header />

      <main className="bg-[#F8F5F2]">
        <section className="bg-[#2B0D17] py-24 text-white">
          <div className="mx-auto max-w-7xl px-6">
            <p className="text-sm uppercase tracking-[0.35em] text-[#D4B06A]">
              Attorney Profile
            </p>

            <h1 className="mt-6 font-serif text-5xl leading-tight md:text-7xl">
              {attorney.name}
            </h1>

            <p className="mt-6 text-sm uppercase tracking-[0.25em] text-white/75">
              {attorney.role}
            </p>
          </div>
        </section>

        <section className="py-24">
          <div className="mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-[420px,1fr]">
            <aside>
              <Image
                src={attorney.image}
                alt={attorney.name}
                width={700}
                height={900}
                className="h-[520px] w-full object-cover object-top"
              />

              <div className="mt-8 border border-[#E8DED3] bg-white p-8">
                <h3 className="font-serif text-2xl text-[#2B0D17]">
                  Contact Information
                </h3>

                <div className="mt-6 space-y-5 text-gray-700">
                  {attorney.phone && <p>{attorney.phone}</p>}
                  {attorney.email && <p>{attorney.email}</p>}
                </div>
              </div>
            </aside>

            <div>
              <section>
                <p className="text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
                  Professional Experience
                </p>

                <h2 className="mt-4 font-serif text-4xl text-[#2B0D17]">
                  Biography
                </h2>

                <p className="mt-8 whitespace-pre-line text-lg leading-relaxed text-gray-700">
                  {attorney.bio}
                </p>
              </section>

              {attorney.education && (
                <section className="mt-20">
                  <p className="text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
                    Education
                  </p>

                  <div className="mt-8 grid gap-6">
                    {attorney.education.map((edu, index) => (
                      <div
                        key={index}
                        className="border-l-4 border-[#6D1F3B] bg-white p-8 shadow-sm"
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
                </section>
              )}

              {attorney.practiceAreas && (
                <section className="mt-20">
                  <p className="text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
                    Practice Areas
                  </p>

                  <div className="mt-8 flex flex-wrap gap-3">
                    {attorney.practiceAreas.map((area) => (
                      <span
                        key={area}
                        className="bg-white px-5 py-3 text-sm uppercase tracking-[0.16em] text-[#2B0D17] shadow-sm"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {attorney.memberships && (
                <section className="mt-20">
                  <p className="text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
                    Memberships
                  </p>

                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {attorney.memberships.map((item) => (
                      <div key={item} className="bg-white p-5 shadow-sm">
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {attorney.certifications && (
                <section className="mt-20">
                  <p className="text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
                    Certifications
                  </p>

                  <div className="mt-8 grid gap-4 md:grid-cols-2">
                    {attorney.certifications.map((cert) => (
                      <div
                        key={cert}
                        className="border border-[#E8DED3] bg-white p-5 shadow-sm"
                      >
                        <span className="text-[#6D1F3B]">✓</span>{" "}
                        <span className="text-gray-700">{cert}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2">
            <div>
              <p className="mb-4 text-xs uppercase tracking-[0.35em] text-[#6D1F3B]">
                Enquiry Form
              </p>

              <h2 className="font-serif text-4xl text-[#2B0D17] md:text-5xl">
                Request a confidential consultation.
              </h2>
            </div>

            <form className="space-y-5 border border-[#E8DED3] bg-[#F8F5F2] p-8">
              <input className="w-full border border-gray-200 px-5 py-4" placeholder="Full Name" />
              <input className="w-full border border-gray-200 px-5 py-4" placeholder="Email Address" />
              <input className="w-full border border-gray-200 px-5 py-4" placeholder="Phone Number" />
              <textarea className="w-full border border-gray-200 px-5 py-4" rows={6} placeholder="Tell us about your matter" />
              <button className="w-full bg-[#6D1F3B] px-6 py-4 text-sm uppercase tracking-[0.2em] text-white">
                Submit Enquiry
              </button>
            </form>
          </div>
        </section>
      </main>

      <Footer />
      <WhatsAppButton />
    </>
  );
}