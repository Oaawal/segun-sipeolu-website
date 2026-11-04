import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import { initials } from "@/lib/portal/format";

/** Building blocks for the staff portal, in the firm's maroon, gold and cream. */

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-maroon px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-maroon-light focus:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50",
  gold: "inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-maroon-dark shadow-sm transition hover:brightness-95",
  ghost: "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-maroon/40 hover:text-maroon",
  danger: "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50",
  small: "inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-maroon/40 hover:text-maroon",
};

export const inputCls = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-maroon focus:outline-none focus:ring-2 focus:ring-maroon/15";

export function PageHeader({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-maroon">
            ← {back.label}
          </Link>
        )}
        <h1 className="font-serif text-2xl font-semibold text-maroon-dark sm:text-3xl">{title}</h1>
        {sub && <div className="mt-1 text-sm text-stone-500">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = "", pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(43,13,23,.04),0_8px_24px_-12px_rgba(43,13,23,.12)] ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-stone-500">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? "p-5" : "pt-2"}>{children}</div>
    </section>
  );
}

const TONES = {
  maroon: "bg-maroon/10 text-maroon",
  gold: "bg-gold/20 text-[#7a5a14]",
  green: "bg-green/10 text-green",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-800",
  blue: "bg-sky-50 text-sky-800",
  grey: "bg-stone-100 text-stone-600",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs";
  return <span className={`grid flex-none place-items-center rounded-full bg-gradient-to-br from-maroon to-maroon-light font-semibold text-gold ${s}`}>{initials(name)}</span>;
}

export function Stat({ label, value, note, href, icon, tone = "maroon" }: { label: string; value: ReactNode; note?: string; href?: string; icon?: ReactNode; tone?: Tone }) {
  const inner = (
    <>
      <div className="flex items-center justify-between text-[13px] font-medium text-stone-500">
        <span>{label}</span>
        {icon && <span className={`grid h-9 w-9 place-items-center rounded-xl ${TONES[tone]}`}>{icon}</span>}
      </div>
      <div className="mt-2 font-serif text-3xl font-semibold text-maroon-dark">{value}</div>
      {note && <div className="mt-1 text-xs text-stone-500">{note}</div>}
    </>
  );
  const cls = "block rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(43,13,23,.04)] transition";
  return href ? <Link href={href} className={`${cls} hover:-translate-y-0.5 hover:border-maroon/30`}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      {icon && <div className="text-stone-300">{icon}</div>}
      <div className="font-semibold text-stone-700">{title}</div>
      {text && <div className="max-w-sm text-sm text-stone-500">{text}</div>}
      {action}
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok" | "lock"; children: ReactNode }) {
  const styles = {
    info: "border-stone-200 bg-cream text-stone-700",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
    ok: "border-green/20 bg-green/5 text-green",
    lock: "border-maroon/15 bg-maroon/5 text-maroon-dark",
  }[tone];
  const Icon = tone === "warn" || tone === "danger" ? AlertTriangle : tone === "ok" ? CheckCircle2 : tone === "lock" ? Lock : Info;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Field({ label, name, required, hint, className = "", ...rest }: { label: string; name: string; required?: boolean; hint?: string; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">
        {label}
        {required && <span className="text-maroon"> *</span>}
      </span>
      <input name={name} required={required} className={inputCls} {...rest} />
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, name, required, hint, className = "", ...rest }: { label: string; name: string; required?: boolean; hint?: string; className?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">
        {label}
        {required && <span className="text-maroon"> *</span>}
      </span>
      <textarea name={name} required={required} rows={4} className={inputCls} {...rest} />
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Select({ label, name, options, required, hint, blank, className = "", ...rest }: {
  label: string; name: string; options: string[][] | Record<string, string>; required?: boolean; hint?: string; blank?: string; className?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const list = Array.isArray(options) ? options : Object.entries(options);
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">
        {label}
        {required && <span className="text-maroon"> *</span>}
      </span>
      <select name={name} required={required} className={inputCls} {...rest}>
        {blank !== undefined && <option value="">{blank}</option>}
        {list.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Check({ name, label, defaultChecked, required, value = "1" }: { name: string; label: ReactNode; defaultChecked?: boolean; required?: boolean; value?: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-stone-700">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} required={required} className="mt-0.5 h-4 w-4 flex-none accent-maroon" />
      <span>{label}</span>
    </label>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: ReactNode; href: string }[]; active: string }) {
  return (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-stone-200 px-1 [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`-mb-px flex-none whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${t.key === active ? "border-maroon text-maroon" : "border-transparent text-stone-500 hover:text-stone-800"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Chips({ items, active }: { items: { key: string; label: string; href: string; n?: number }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {items.map((i) => (
        <Link key={i.key} href={i.href} className={`flex-none rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${i.key === active ? "border-maroon bg-maroon text-white" : "border-stone-300 bg-white text-stone-700 hover:border-maroon/40"}`}>
          {i.label}
          {i.n !== undefined && <span className={`ml-1.5 text-xs ${i.key === active ? "text-gold" : "text-stone-400"}`}>{i.n}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Row({ href, children, className = "" }: { href?: string; children: ReactNode; className?: string }) {
  const cls = `flex items-center gap-3 border-t border-stone-100 px-5 py-3 first:border-t-0 ${className}`;
  return href ? <Link href={href} className={`${cls} transition hover:bg-cream/60`}>{children}</Link> : <div className={cls}>{children}</div>;
}

const MESSAGES: Record<string, [ "ok" | "danger", string ]> = {
  saved: ["ok", "Saved."],
  created: ["ok", "Created."],
  denied: ["danger", "Your role does not allow that. If you need access, ask the Managing Partner."],
  invalid: ["danger", "Some details are missing or not valid. Please check and try again."],
  uploaded: ["ok", "Uploaded. The file is encrypted and its fingerprint recorded."],
  upload_failed: ["danger", "The file could not be uploaded. Check its type and size."],
  removed: ["ok", "Removed from the list. The file is kept in storage and the action is logged."],
  adjourned: ["ok", "Sitting recorded and the next date added to the diary."],
  task_done: ["ok", "Task done."],
  tasks_created: ["ok", "Tasks created from the action items."],
  invited: ["ok", "Invitation created. Send the link to the person; it works once and expires in 72 hours."],
  user_updated: ["ok", "Person updated."],
  deactivated: ["ok", "Deactivated and signed out everywhere. Their history is kept."],
  self: ["danger", "You cannot change your own role or deactivate yourself."],
  two_factor_on: ["ok", "Two-factor sign-in is on."],
  password_changed: ["ok", "Password changed. Other devices were signed out."],
  member_added: ["ok", "Added to the matter team."],
  member_removed: ["ok", "Removed from the matter team."],
  processing: ["ok", "Recording received. Transcription is running; this page updates by itself."],
  minutes_ready: ["ok", "Minutes generated. Review them before relying on them."],
  speakers: ["ok", "Speaker names updated."],
};

export function Flash({ msg }: { msg?: string | string[] }) {
  const key = Array.isArray(msg) ? msg[0] : msg;
  const m = key ? MESSAGES[key] : null;
  if (!m) return null;
  return (
    <div className="mb-5">
      <Note tone={m[0]}>{m[1]}</Note>
    </div>
  );
}

export function DueBadge({ days, label }: { days: number | null; label: string }) {
  if (days === null) return null;
  const tone: Tone = days < 0 ? "red" : days <= 2 ? "amber" : "blue";
  return <Badge tone={tone}>{label}</Badge>;
}
