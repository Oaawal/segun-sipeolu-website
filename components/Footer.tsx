import Link from "next/link";
import { firm, services } from "@/lib/site-data";

export default function Footer() {
  return (
    <footer className="bg-[#1A1114] text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-4">
        <div>
          <h3 className="font-serif text-3xl">Segun Sipeolu</h3>
          <p className="mt-2 text-sm uppercase tracking-[0.25em] text-[#D4B06A]">& Associates</p>
          <p className="mt-6 leading-relaxed text-white/70">
            Barristers, Solicitors, Litigation, Corporate Advisory, Property Law, Commercial Law, and Dispute Resolution.
          </p>
        </div>

        <div>
          <h4 className="font-serif text-xl">Quick Links</h4>
          <div className="mt-6 flex flex-col gap-3 text-white/70">
            <Link href="/about">About</Link>
            <Link href="/practice-areas">Practice Areas</Link>
            <Link href="/attorneys">Attorneys</Link>
            <Link href="/insights">Insights</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>

        <div>
          <h4 className="font-serif text-xl">Practice Areas</h4>
          <div className="mt-6 flex flex-col gap-3 text-white/70">
            {services.slice(0, 6).map((s) => (
              <Link key={s.slug} href={`/practice-areas/${s.slug}`}>
                {s.title}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-serif text-xl">Contact</h4>
          <div className="mt-6 space-y-4 text-white/70">
            <p>{firm.address}</p>
            <p>{firm.phone}</p>
            <p>{firm.email}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-6 text-center text-sm text-white/50">
        © 2026 Segun Sipeolu & Associates. All rights reserved.
      </div>
    </footer>
  );
}