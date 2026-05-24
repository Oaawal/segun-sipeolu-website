"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#2B0D17] shadow-lg"
          : "bg-[#2B0D17]"
      } border-b-2 border-[#D4B06A]/40`}
    >
      {/* Top contact strip */}
      <div className="hidden border-b border-white/10 bg-[#1A0A10] lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2 text-xs text-white/50">
          <span>12 Hakeem Balogun Street, Ikeja, Lagos</span>
          <div className="flex gap-6">
            <a href="tel:+2348034021136" className="hover:text-[#D4B06A] transition-colors">
              +234 803 402 1136
            </a>
            <a href="mailto:sipeolu@segunsipeolu.com" className="hover:text-[#D4B06A] transition-colors">
              sipeolu@segunsipeolu.com
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <div className="flex h-10 w-10 items-center justify-center border border-[#D4B06A]/60 bg-[#D4B06A]/10">
            <span className="font-serif text-lg font-semibold text-[#D4B06A]">S</span>
          </div>
          <div>
            <p className="font-serif text-lg leading-none text-white">Segun Sipeolu</p>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#D4B06A]">
              & Associates
            </p>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-white/70 transition hover:text-[#D4B06A]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* CTA */}
        <Link
          href="/contact"
          className="hidden border border-[#D4B06A]/60 bg-[#D4B06A]/10 px-5 py-2.5 text-xs uppercase tracking-[0.2em] text-[#D4B06A] transition hover:bg-[#D4B06A] hover:text-[#2B0D17] lg:block"
        >
          Book Consultation
        </Link>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          className="text-white lg:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-white/10 bg-[#2B0D17] lg:hidden">
          <div className="flex flex-col px-6 py-6">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="border-b border-white/10 py-3.5 text-sm text-white/80 hover:text-[#D4B06A]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/contact"
              className="mt-5 bg-[#D4B06A] py-3.5 text-center text-xs uppercase tracking-[0.2em] text-[#2B0D17] font-medium"
              onClick={() => setOpen(false)}
            >
              Book Consultation
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}