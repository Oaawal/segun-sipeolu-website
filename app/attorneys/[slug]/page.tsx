import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { attorneys, firm } from "@/lib/site-data";

export async function generateStaticParams() {
  return attorneys.map((attorney) => ({ slug: attorney.slug }));
}

export default async function AttorneyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = attorneys.find((x) => x.slug === slug) as any;
  if (!a) notFound();

  return (
    <>
      <Header />
      <main>

        {/* Hero */}
        <section className="relative bg-[#2B0D17] py-28 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[url('/hero.jpg')] bg-cover bg-center opacity-20" />
          <div className="relative mx-auto max-w-7xl px-6">
            <div className="flex items-center gap-2 text-xs text-white/40 mb-8">
              <Link href="/" className="hover:text-[#D4B06A] transition-colors">Home</Link>
              <span>/</span>
              <Link href="/attorneys" className="hover:text-[#D4B06A] transition-colors">Team</Link>
              <span>/</span>
              <span className="text-[#D4B06A]">Current Page</span>
            </div>
            <h1 className="font-serif text-5xl md:text-7xl leading-tight">{a.name}</h1>
            <p className="mt-5 text-sm uppercase tracking-[0.3em] text-[#D4B06A]/80">{a.role}</p>
          </div>
        </section>

        {/* Main content */}
        <section className="bg-[#F8F5F2] py-20">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid gap-12 lg:grid-cols-[420px,1fr]">

              {/* LEFT */}
              <div className="space-y-6">

                {/* Photo */}
                <div className="relative w-full overflow-hidden bg-[#E8DED3]" style={{ height: "480px" }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-serif text-9xl text-[#6D1F3B]/10">
                      {a.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                  <Image
                    src={a.image}
                    alt={a.name}
                    fill
                    className="object-cover"
                    style={{ objectPosition: "center 25%" }}
                  />
                </div>

                {/* Contact card */}
                <div className="bg-white border border-[#E8DED3] p-8">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#6D1F3B]">{a.role}</p>
                  <h2 className="mt-2 font-serif text-2xl text-[#2B0D17]">{a.name}</h2>
                  <div className="mt-3 h-px w-12 bg-[#6D1F3B]/30" />
                  <div className="mt-6 space-y-4">
                    {a.phone && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">Phone Number</p>
                        <a href={`tel:${a.phone}`} className="mt-1 block text-sm text-[#2B0D17] hover:text-[#6D1F3B] transition-colors">{a.phone}</a>
                      </div>
                    )}
                    {a.email && (
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400">Email Address</p>
                        <a href={`mailto:${a.email}`} className="mt-1 block text-sm text-[#2B0D17] hover:text-[#6D1F3B] transition-colors">{a.email}</a>
                      </div>
                    )}
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {a.email && (
                      <a href={`mailto:${a.email}`} className="bg-[#6D1F3B] px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] text-white hover:bg-[#2B0D17] transition-colors">Send Email</a>
                    )}
                    {a.whatsapp && (
                      <a href={`https://wa.me/${a.whatsapp}`} target="_blank" rel="noopener noreferrer" className="border border-[#25D366] px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] text-[#25D366] hover:bg-[#25D366] hover:text-white transition-colors">WhatsApp</a>
                    )}
                    {a.linkedin && (
                      <a href={a.linkedin} target="_blank" rel="noopener noreferrer" className="border border-[#0A66C2] px-4 py-2.5 text-[10px] uppercase tracking-[0.2em] text-[#0A66C2] hover:bg-[#0A66C2] hover:text-white transition-colors">LinkedIn</a>
                    )}
                  </div>
                </div>

                {/* Practice areas */}
                {a.practiceAreas && a.practiceAreas.length > 0 && (
                  <div className="bg-white border border-[#E8DED3] p-8">
                    <h3 className="font-serif text-xl text-[#2B0D17]">Practice Areas</h3>
                    <div className="mt-2 h-px w-10 bg-[#6D1F3B]/30" />
                    <div className="mt-5">
                      {a.practiceAreas.map((area: string) => (
                        <div key={area} className="flex items-center justify-between border-b border-[#F0EBE6] py-3">
                          <span className="text-xs uppercase tracking-[0.15em] text-gray-700">{area}</span>
                          <span className="text-[#6D1F3B]">+</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT */}
              <div className="space-y-14">

                {/* Bio */}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-[#6D1F3B]">Background</p>
                  <h2 className="mt-3 font-serif text-3xl text-[#2B0D17]">Professional Experience</h2>
                  <div className="mt-2 h-px w-12 bg-[#6D1F3B]/40" />
                  <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-gray-700">{a.bio}</p>
                </div>

                {/* Memberships */}
                {a.memberships && a.memberships.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#6D1F3B]">Affiliations</p>
                    <h2 className="mt-3 font-serif text-3xl text-[#2B0D17]">Professional Membership</h2>
                    <div className="mt-2 h-px w-12 bg-[#6D1F3B]/40" />
                    <div className="mt-6 space-y-3">
                      {a.memberships.map((m: string) => (
                        <div key={m} className="flex items-center gap-3 border-b border-[#E8DED3] pb-3">
                          <span className="text-[#6D1F3B]">✓</span>
                          <span className="text-gray-700">{m}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Education */}
                {a.education && a.education.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#6D1F3B]">Academic Background</p>
                    <h2 className="mt-3 font-serif text-3xl text-[#2B0D17]">Education</h2>
                    <div className="mt-2 h-px w-12 bg-[#6D1F3B]/40" />
                    <div className="mt-6 space-y-4">
                      {a.education.map((edu: any, i: number) => (
                        <div key={i} className="grid grid-cols-[160px,1fr] gap-6 border border-[#E8DED3] bg-white p-6">
                          <div className="border-r border-[#E8DED3] pr-6">
                            <p className="text-xs font-semibold uppercase leading-snug text-[#2B0D17]">{edu.school}</p>
                          </div>
                          <div>
                            <p className="font-serif text-xl text-[#2B0D17]">{edu.degree}</p>
                            <p className="mt-2 text-sm leading-relaxed text-gray-500">{edu.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Certifications */}
                {a.certifications && a.certifications.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#6D1F3B]">Credentials</p>
                    <h2 className="mt-3 font-serif text-3xl text-[#2B0D17]">Certifications</h2>
                    <div className="mt-2 h-px w-12 bg-[#6D1F3B]/40" />
                    <div className="mt-6 space-y-3">
                      {a.certifications.map((cert: string) => (
                        <div key={cert} className="flex items-center gap-3 border-b border-[#E8DED3] pb-3">
                          <span className="text-[#6D1F3B]">✓</span>
                          <span className="text-gray-700">{cert}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Essays */}
                {a.essays && a.essays.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#6D1F3B]">Publications</p>
                    <h2 className="mt-3 font-serif text-3xl text-[#2B0D17]">Essays, Research Works and Opinions</h2>
                    <div className="mt-2 h-px w-12 bg-[#6D1F3B]/40" />
                    <div className="mt-6 space-y-3">
                      {a.essays.map((essay: string) => (
                        <div key={essay} className="flex items-start gap-3 border-b border-[#E8DED3] pb-3">
                          <span className="mt-1 shrink-0 text-[#6D1F3B]">✓</span>
                          <span className="text-gray-700">{essay}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conferences */}
                {a.conferences && a.conferences.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-[#6D1F3B]">Continuous Development</p>
                    <h2 className="mt-3 font-serif text-3xl text-[#2B0D17]">Recent Conferences and Seminars Attended</h2>
                    <div className="mt-2 h-px w-12 bg-[#6D1F3B]/40" />
                    <div className="mt-6 grid gap-3 md:grid-cols-2">
                      {a.conferences.map((conf: string) => (
                        <div key={conf} className="flex items-start gap-3 border border-[#E8DED3] bg-white p-4">
                          <span className="mt-0.5 shrink-0 text-[#6D1F3B]">✓</span>
                          <span className="text-sm text-gray-700">{conf}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enquiry Form */}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-[#6D1F3B]">Get In Touch</p>
                  <h2 className="mt-3 font-serif text-3xl text-[#2B0D17]">Enquiry Form</h2>
                  <div className="mt-2 h-px w-12 bg-[#6D1F3B]/40" />
                  <form className="mt-8 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <input placeholder="Name" className="w-full border border-gray-200 bg-white px-5 py-4 text-sm outline-none focus:border-[#6D1F3B]" />
                      <input placeholder="Email" type="email" className="w-full border border-gray-200 bg-white px-5 py-4 text-sm outline-none focus:border-[#6D1F3B]" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <input placeholder="Phone" className="w-full border border-gray-200 bg-white px-5 py-4 text-sm outline-none focus:border-[#6D1F3B]" />
                      <input placeholder="Subject" className="w-full border border-gray-200 bg-white px-5 py-4 text-sm outline-none focus:border-[#6D1F3B]" />
                    </div>
                    <textarea placeholder="Tell Us About Your Case" rows={6} className="w-full border border-gray-200 bg-white px-5 py-4 text-sm outline-none focus:border-[#6D1F3B]" />
                    <button type="button" className="bg-[#6D1F3B] px-8 py-4 text-sm uppercase tracking-[0.2em] text-white hover:bg-[#2B0D17] transition-colors">
                      Submit Enquiry
                    </button>
                  </form>
                </div>

                <div className="border-t border-[#E8DED3] pt-8">
                  <Link href="/attorneys" className="text-sm uppercase tracking-[0.2em] text-[#6D1F3B] hover:underline">
                    ← Back to All Attorneys
                  </Link>
                </div>

              </div>
            </div>
          </div>
        </section>

      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}