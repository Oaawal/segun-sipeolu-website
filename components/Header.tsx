"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { firm } from "@/lib/site-data";

const nav = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/practice-areas", label: "Practice Areas" },
  { href: "/attorneys", label: "Attorneys" },
  { href: "/insights", label: "Insights" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#6D1F3B]/10 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <div className="flex h-10 w-10 items-center justify-center bg-[#6D1F3B] text-white">
            <span className="text-lg font-semibold">S</span>
          </div>
          <div>
            <h1 className="font-serif text-lg text-[#6D1F3B]">Segun Sipeolu</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500">
              & Associates
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm transition hover:text-[#6D1F3B]">
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/contact"
          className="hidden bg-[#6D1F3B] px-5 py-3 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-[#54152d] lg:block"
        >
          Book Consultation
        </Link>

        <button onClick={() => setOpen(!open)} className="lg:hidden" aria-label="Toggle menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="border-t border-[#6D1F3B]/10 bg-white lg:hidden">
          <div className="flex flex-col px-6 py-6">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="py-3"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            <a
              href={`https://wa.me/${firm.whatsapp}`}
              className="mt-4 bg-[#6D1F3B] px-5 py-4 text-center text-xs uppercase tracking-[0.2em] text-white"
            >
              WhatsApp Chambers
            </a>
          </div>
        </div>
      )}
    </header>
  );
}