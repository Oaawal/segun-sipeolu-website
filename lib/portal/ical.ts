import "server-only";
import { q } from "./db";
import { can, diaryAccessSql, matterAccessSql, type Actor } from "./permissions";
import { addDays, today } from "./format";
import { FILING_KINDS, FIRM } from "./vocab";
import { portalUrl } from "./reminders";

/**
 * One person's calendar feed (iCalendar, RFC 5545): their court dates,
 * deadlines, tasks, responses due from the service register, company
 * filings and (for the administrator) office renewals.
 *
 * Calendar providers (Google, Microsoft, Apple) keep a copy of what they
 * show, so by default events carry matter numbers, courts and times but no
 * client names or case details. "full" detail adds matter titles and task
 * names, at the person's choice.
 */

type Ev = { uid: string; summary: string; start: string; time?: string | null; minutes?: number; location?: string | null; description?: string; url?: string };

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
}

/** Fold lines at 75 octets, as the format requires. */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = " " + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

function stamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function vevent(e: Ev, now: string) {
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}@ssa-portal`, `DTSTAMP:${now}`];
  if (e.time && /^\d{2}:\d{2}$/.test(e.time)) {
    // Lagos is UTC+1 all year
    const start = new Date(`${e.start}T${e.time}:00+01:00`);
    const end = new Date(start.getTime() + (e.minutes || 60) * 60000);
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${e.start.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(e.start, 1).replace(/-/g, "")}`, "TRANSP:TRANSPARENT");
  }
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description || e.url) lines.push(`DESCRIPTION:${esc([e.description, e.url].filter(Boolean).join("\n"))}`);
  if (e.url) lines.push(`URL:${e.url}`);
  // A reminder the evening before for court, the morning of for deadlines
  lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.summary)}`, `TRIGGER:${e.time ? "-PT15H" : "PT8H"}`, "END:VALARM", "END:VEVENT");
  return lines.map(fold).join("\r\n");
}

export async function buildCalendar(u: Actor, detail: "minimal" | "full") {
  const full = detail === "full";
  const from = addDays(today(), -30);
  const to = addDays(today(), 400);
  const url = portalUrl();
  const firmWide = (u.role === "litigation" || u.role === "front_desk" || u.role === "admin") && can(u, "diary.view_all");
  const hearingWhere = firmWide ? diaryAccessSql(u) : "(h.appearing = $1 OR EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $1))";
  const [hearings, tasks, service, filings, renewals] = await Promise.all([
    q<{ id: string; matter_id: string; number: string; title: string; sitting_on: string; sitting_time: string | null; court: string; business: string; appearing_name: string | null }>(
      `SELECT h.id, h.matter_id, m.number, m.title, h.sitting_on, h.sitting_time, h.court, h.business, u.full_name AS appearing_name
       FROM hearings h JOIN matters m ON m.id = h.matter_id LEFT JOIN users u ON u.id = h.appearing
       WHERE h.status IN ('scheduled','held','adjourned') AND h.sitting_on BETWEEN $2 AND $3 AND ${hearingWhere}`, [u.id, from, to]),
    q<{ id: string; title: string; due_on: string; kind: string; matter_id: string | null; number: string | null }>(
      `SELECT t.id, t.title, t.due_on, t.kind, t.matter_id, m.number FROM tasks t LEFT JOIN matters m ON m.id = t.matter_id
       WHERE t.status = 'open' AND t.assigned_to = $1 AND t.due_on BETWEEN $2 AND $3 AND (t.matter_id IS NULL OR ${matterAccessSql(u)})`, [u.id, from, to]),
    q<{ id: string; number: string; title: string; response_due: string; matter_number: string | null }>(
      `SELECT s.id, s.number, s.title, s.response_due, m.number AS matter_number FROM service_register s LEFT JOIN matters m ON m.id = s.matter_id
       WHERE s.status = 'open' AND s.response_due BETWEEN $2 AND $3 AND s.handled_by = $1`, [u.id, from, to]),
    can(u, "cosec.view") ? q<{ id: string; entity_id: string; kind: keyof typeof FILING_KINDS; title: string; due_on: string; name: string }>(
      `SELECT f.id, f.entity_id, f.kind, f.title, f.due_on, e.name FROM entity_filings f JOIN entities e ON e.id = f.entity_id
       WHERE f.status = 'due' AND f.responsible = $1 AND f.due_on BETWEEN $2 AND $3`, [u.id, from, to]) : Promise.resolve([]),
    can(u, "office.manage") ? q<{ id: string; name: string; renews_on: string }>(
      "SELECT id, name, renews_on FROM assets WHERE status != 'retired' AND renews_on BETWEEN $1 AND $2", [from, to]) : Promise.resolve([]),
  ]);
  const evs: Ev[] = [
    ...hearings.map((h) => ({
      uid: `hearing-${h.id}`, start: h.sitting_on, time: h.sitting_time, minutes: 90, location: h.court,
      summary: `Court: ${full ? h.title : h.number} (${h.business})`,
      description: `${h.business}${h.appearing_name ? ` · Counsel: ${h.appearing_name}` : ""}`, url: `${url}/matters/${h.matter_id}?tab=diary`,
    })),
    ...tasks.map((t) => ({
      uid: `task-${t.id}`, start: t.due_on,
      summary: full ? `${t.kind === "deadline" ? "DEADLINE: " : "Task: "}${t.title}` : `${t.kind === "deadline" ? "Deadline" : "Task due"}${t.number ? ` · ${t.number}` : ""}`,
      url: t.matter_id ? `${url}/matters/${t.matter_id}?tab=tasks` : `${url}/tasks`,
    })),
    ...service.map((s) => ({
      uid: `service-${s.id}`, start: s.response_due,
      summary: full ? `Response due: ${s.title}` : `Response due · ${s.number}${s.matter_number ? ` · ${s.matter_number}` : ""}`, url: `${url}/register/${s.id}`,
    })),
    ...filings.map((f) => ({
      uid: `filing-${f.id}`, start: f.due_on,
      summary: full ? `Filing due: ${f.title} (${f.name})` : `Filing due · ${FILING_KINDS[f.kind]}`, url: `${url}/cosec/${f.entity_id}?tab=filings`,
    })),
    ...renewals.map((r) => ({ uid: `renewal-${r.id}`, start: r.renews_on, summary: `Renewal: ${r.name}`, url: `${url}/office` })),
  ];
  const now = stamp(new Date());
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${FIRM.name}//Practice Portal//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${FIRM.short} · ${u.full_name}`), "X-WR-TIMEZONE:Africa/Lagos", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
    ...evs.map((e) => vevent(e, now)),
    "END:VCALENDAR", "",
  ].join("\r\n");
}
