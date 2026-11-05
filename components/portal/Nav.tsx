"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  LayoutDashboard, Briefcase, CalendarDays, Inbox, ListChecks, Mic, Users, ScanSearch, ShieldCheck, ScrollText, Server, FileText, FolderInput, Smartphone, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  today: LayoutDashboard, matters: Briefcase, diary: CalendarDays, register: Inbox, tasks: ListChecks, meetings: Mic,
  clients: Users, conflicts: ScanSearch, people: ShieldCheck, audit: ScrollText, system: Server, word: FileText, inbox: FolderInput, connect: Smartphone,
};

export interface NavItem { key: string; label: string; href: string; badge?: number }
export interface NavGroup { name: string; items: NavItem[] }

export function Nav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: boolean }) {
  const path = usePathname();
  const ref = useRef<HTMLElement>(null);
  // The phone menu is a <details>; close it after moving to another page
  useEffect(() => {
    if (onNavigate) ref.current?.closest("details")?.removeAttribute("open");
  }, [path, onNavigate]);
  const active = (href: string) => (href === "/portal" ? path === "/portal" : path === href || path.startsWith(href + "/"));
  return (
    <nav ref={ref} className="space-y-6">
      {groups.map((g) => (
        <div key={g.name}>
          <div className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold/60">{g.name}</div>
          <div className="space-y-0.5">
            {g.items.map((i) => {
              const Icon = ICONS[i.key];
              const on = active(i.href);
              return (
                <Link key={i.key} href={i.href}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${on ? "bg-white/10 text-white shadow-[inset_2px_0_0_#D4B06A]" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
                  {Icon && <Icon className={`h-[18px] w-[18px] ${on ? "text-gold" : "text-white/50 group-hover:text-white/80"}`} />}
                  <span className="flex-1">{i.label}</span>
                  {!!i.badge && <span className="rounded-full bg-gold px-1.5 py-px text-[11px] font-bold text-maroon-dark">{i.badge}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
