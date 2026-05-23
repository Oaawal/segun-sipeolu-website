import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-[#1A1114] text-white">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-4">
        <div>
          <h3 className="font-serif text-3xl text-white">
            Segun Sipeolu
          </h3>

          <p className="mt-2 text-sm uppercase tracking-[0.25em] text-[#D4AF37]">
            & Associates
          </p>

          <p className="mt-6 leading-relaxed text-white/70">
            Barristers, Solicitors, Corporate Advisory, Litigation,
            Property Law, and Commercial Dispute Resolution.
          </p>
        </div>

        <div>
          <h4 className="font-serif text-xl">Quick Links</h4>

          <div className="mt-6 flex flex-col gap-3 text-white/70">
            <Link href="/">Home</Link>
            <Link href="/about">About</Link>
            <Link href="/practice-areas">Practice Areas</Link>
            <Link href="/attorneys">Attorneys</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>

        <div>
          <h4 className="font-serif text-xl">Practice Areas</h4>

          <div className="mt-6 flex flex-col gap-3 text-white/70">
            <p>Litigation</p>
            <p>Corporate Law</p>
            <p>Property Law</p>
            <p>Employment Law</p>
            <p>Arbitration & ADR</p>
          </div>
        </div>

        <div>
          <h4 className="font-serif text-xl">Contact</h4>

          <div className="mt-6 space-y-4 text-white/70">
            <p>
              12 Hakeem Balogun Street,
              <br />
              Agidingbi, Ikeja, Lagos
            </p>

            <p>+234 909 000 1826</p>

            <p>info@segunsipeolu.com</p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-6 text-center text-sm text-white/50">
        © 2026 Segun Sipeolu & Associates. All rights reserved.
      </div>
    </footer>
  );
}