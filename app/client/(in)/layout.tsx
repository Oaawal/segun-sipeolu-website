import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireClient } from "@/lib/portal/client-auth";
import { clientLogout } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClientShell({ children }: { children: React.ReactNode }) {
  const c = await requireClient();
  return (
    <>
      <header className="bg-maroon-dark print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/client" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-gold/40 bg-maroon font-serif text-lg font-bold text-gold">S</span>
            <span><span className="block font-serif text-[15px] font-semibold leading-tight text-white">Segun Sipeolu &amp; Associates</span><span className="block text-[11px] tracking-wide text-gold/75">Client portal · {c.client_name}</span></span>
          </Link>
          <form action={clientLogout}><button className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></button></form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-stone-500 sm:px-6">Signed in as {c.full_name} ({c.email}). Confidential and privileged. Every access is recorded. You are signed out after an hour without activity.</footer>
    </>
  );
}
