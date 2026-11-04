import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

/** Centered card used by sign-in, setup and invitation pages. */
export function AuthCard({ title, sub, children, footer }: { title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-maroon-dark px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(900px_500px_at_15%_-10%,rgba(212,176,106,.25),transparent_60%),radial-gradient(700px_500px_at_110%_110%,rgba(109,31,59,.9),transparent_60%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold/40 bg-maroon font-serif text-lg font-bold text-gold">S</span>
          <div>
            <div className="font-serif text-lg font-semibold leading-tight">Segun Sipeolu &amp; Associates</div>
            <div className="text-xs tracking-wide text-gold/80">Practice Portal · Staff only</div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white p-7 shadow-2xl">
          <h1 className="font-serif text-2xl font-semibold text-maroon-dark">{title}</h1>
          {sub && <p className="mt-1.5 text-sm text-stone-500">{sub}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-white/50">
          <ShieldCheck className="h-3.5 w-3.5" /> {footer || "Encrypted connection · every access is recorded"}
        </p>
      </div>
    </div>
  );
}
