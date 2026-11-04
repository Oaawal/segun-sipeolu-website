/** Date and text helpers. Lagos is UTC+1 all year. */

const TZ = "Africa/Lagos";

export function today(): string {
  return new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** DATE columns come back as Date (pg) or string; normalise to YYYY-MM-DD. */
export function ymd(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    // pg returns DATE at local midnight; take the calendar date it represents
    return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  return String(v).slice(0, 10);
}

export function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T12:00:00Z`).getTime());
}

export function fmtDay(v: unknown, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = ymd(v);
  if (!d) return "—";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", ...opts });
}

export function fmtLongDay(v: unknown): string {
  return fmtDay(v, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  return new Date(v as string).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function daysUntil(v: unknown): number | null {
  const d = ymd(v);
  if (!d) return null;
  return Math.round((new Date(`${d}T12:00:00Z`).getTime() - new Date(`${today()}T12:00:00Z`).getTime()) / 86400000);
}

export function dueLabel(v: unknown): string {
  const n = daysUntil(v);
  if (n === null) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n} days overdue`;
  if (n < 7) return `In ${n} days`;
  return fmtDay(v);
}

export function ago(v: unknown): string {
  if (!v) return "—";
  const mins = Math.round((Date.now() - new Date(v as string).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`;
  return fmtDay(v);
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

export function fmtSize(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Form helpers */
export function str(fd: FormData, name: string, max = 500): string | null {
  const v = String(fd.get(name) ?? "").trim().slice(0, max);
  return v || null;
}

export function oneOf<T extends string>(fd: FormData, name: string, allowed: Record<T, unknown>, fallback: NoInfer<T>): T {
  const v = String(fd.get(name) ?? "");
  return (Object.prototype.hasOwnProperty.call(allowed, v) ? v : fallback) as T;
}

export function dateField(fd: FormData, name: string): string | null {
  const v = String(fd.get(name) ?? "").trim();
  return isYmd(v) ? v : null;
}

export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
