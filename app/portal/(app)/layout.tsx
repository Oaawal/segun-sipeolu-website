import Link from "next/link";
import { LogOut, Menu, Search, UserCog } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { can, ROLES } from "@/lib/portal/permissions";
import { one } from "@/lib/portal/db";
import { matterAccessSql } from "@/lib/portal/permissions";
import { Nav, type NavGroup } from "@/components/portal/Nav";
import { Avatar } from "@/components/portal/ui";
import { logoutAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const counts = await one<{ tasks: number; due: number; inbox: number }>(
    `SELECT (SELECT COUNT(*) FROM tasks t WHERE t.status = 'open' AND t.assigned_to = $1 AND t.due_on <= CURRENT_DATE) AS tasks,
            (SELECT COUNT(*) FROM documents d WHERE d.owner_type = 'inbox' AND d.owner_id = $1 AND d.deleted_at IS NULL) AS inbox,
            (SELECT COUNT(*) FROM service_register s LEFT JOIN matters m ON m.id = s.matter_id
              WHERE s.status = 'open' AND s.response_due <= CURRENT_DATE + 3 AND (s.handled_by = $1 OR (s.matter_id IS NOT NULL AND ${matterAccessSql(u)}))) AS due`,
    [u.id],
  );

  const groups: NavGroup[] = [
    {
      name: "Work",
      items: [
        { key: "today", label: "Today", href: "/portal" },
        { key: "inbox", label: "Inbox", href: "/portal/inbox", badge: counts?.inbox || 0 },
        ...(u.role !== "front_desk" ? [{ key: "matters", label: "Matters", href: "/portal/matters" }] : []),
        { key: "diary", label: "Court diary", href: "/portal/diary" },
        { key: "register", label: "Service register", href: "/portal/register", badge: counts?.due || 0 },
        { key: "tasks", label: "Tasks", href: "/portal/tasks", badge: counts?.tasks || 0 },
        ...(can(u, "meetings.use") ? [{ key: "meetings", label: "Meetings & minutes", href: "/portal/meetings" }] : []),
      ],
    },
    {
      name: "Clients",
      items: [
        { key: "clients", label: "Clients", href: "/portal/clients" },
        ...(can(u, "conflicts.check") ? [{ key: "conflicts", label: "Conflict check", href: "/portal/conflicts" }] : []),
        { key: "connect", label: "Save from anywhere", href: "/portal/connect" },
      ],
    },
    ...(can(u, "users.manage")
      ? [{ name: "Administration", items: [
          { key: "people", label: "People & access", href: "/portal/admin/people" },
          { key: "audit", label: "Audit trail", href: "/portal/admin/audit" },
          { key: "system", label: "System & backups", href: "/portal/admin/system" },
        ] }]
      : []),
  ];

  const brand = (
    <Link href="/portal" className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl border border-gold/40 bg-maroon font-serif text-lg font-bold text-gold">S</span>
      <span>
        <span className="block font-serif text-[15px] font-semibold leading-tight text-white">Segun Sipeolu</span>
        <span className="block text-[11px] tracking-wide text-gold/75">&amp; Associates · Portal</span>
      </span>
    </Link>
  );

  const userBox = (
    <div className="border-t border-white/10 pt-4">
      <Link href="/portal/account" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
        <Avatar name={u.full_name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{u.full_name}</span>
          <span className="block truncate text-[11px] text-white/50">{ROLES[u.role].label}</span>
        </span>
        <UserCog className="h-4 w-4 text-white/40" />
      </Link>
      <form action={logoutAction}>
        <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen print:!hidden w-64 flex-none flex-col bg-gradient-to-b from-maroon-dark to-[#3a1220] px-4 py-5 lg:flex">
        <div className="px-1 pb-5">{brand}</div>
        <form action="/portal/search" className="relative mb-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input name="q" type="search" placeholder="Search everything" aria-label="Search everything" className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/40 focus:border-gold/50 focus:outline-none" />
        </form>
        <div className="flex-1 overflow-y-auto [scrollbar-width:none]"><Nav groups={groups} /></div>
        {userBox}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex print:hidden items-center justify-between gap-3 bg-maroon-dark px-4 py-3 lg:hidden">
          {brand}
          <div className="flex items-center gap-2">
            <Link href="/portal/search" aria-label="Search" className="rounded-lg bg-white/10 p-2 text-white"><Search className="h-5 w-5" /></Link>
            <details className="group relative">
              <summary className="list-none rounded-lg bg-white/10 p-2 text-white [&::-webkit-details-marker]:hidden" aria-label="Menu"><Menu className="h-5 w-5" /></summary>
              <div className="fixed inset-x-0 bottom-0 top-[64px] overflow-y-auto bg-maroon-dark px-4 py-5">
                <Nav groups={groups} onNavigate />
                <div className="mt-6">{userBox}</div>
              </div>
            </details>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
