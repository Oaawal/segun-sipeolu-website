import "server-only";
import { one, q } from "./db";
import { audit } from "./audit";
import { diaryAccessSql, matterAccessSql, can, type Role } from "./permissions";
import { addDays, daysUntil, dueLabel, fmtDay, today } from "./format";
import { emailLayout, notify, type Recipient } from "./notify";
import { FIRM } from "./vocab";

/**
 * The morning reminders (run once a day, e.g. 7am Lagos):
 *  - an email digest for each person: court today and tomorrow, their tasks
 *    due or overdue, and responses due from the service register;
 *  - a short SMS when they are in court today or tomorrow, or a deadline is
 *    due today, tomorrow or overdue.
 * Lawyers and partners get their own matters; the litigation team, front
 * desk and the Managing Partner get the firm's whole court list (never
 * through an ethical wall).
 */

export function portalUrl() {
  return (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/$/, "") + "/portal";
}

interface Person extends Recipient { role: Role }

export async function remindersFor(p: Person, day = today()) {
  const tomorrow = addDays(day, 1);
  const firmWide = p.role === "litigation" || p.role === "front_desk" || p.role === "admin";
  const hearingWhere = firmWide && can(p, "diary.view_all")
    ? diaryAccessSql(p)
    : `(h.appearing = $1 OR EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $1))`;
  const [hearings, tasks, service, filings, renewals] = await Promise.all([
    q<{ id: string; matter_id: string; number: string; title: string; sitting_on: string; sitting_time: string | null; court: string; business: string; appearing: string | null; appearing_name: string | null }>(
      `SELECT h.id, h.matter_id, m.number, m.title, h.sitting_on, h.sitting_time, h.court, h.business, h.appearing, u.full_name AS appearing_name
       FROM hearings h JOIN matters m ON m.id = h.matter_id LEFT JOIN users u ON u.id = h.appearing
       WHERE h.status = 'scheduled' AND h.sitting_on BETWEEN $2 AND $3 AND ${hearingWhere}
       ORDER BY h.sitting_on, h.sitting_time NULLS LAST`,
      [p.id, day, tomorrow],
    ),
    q<{ id: string; title: string; due_on: string; kind: string; matter_id: string | null; number: string | null }>(
      `SELECT t.id, t.title, t.due_on, t.kind, t.matter_id, m.number FROM tasks t LEFT JOIN matters m ON m.id = t.matter_id
       WHERE t.status = 'open' AND t.assigned_to = $1 AND t.due_on IS NOT NULL AND t.due_on <= $2
         AND (t.matter_id IS NULL OR ${matterAccessSql(p)})
       ORDER BY t.due_on`,
      [p.id, tomorrow],
    ),
    q<{ id: string; number: string; title: string; response_due: string; matter_number: string | null }>(
      `SELECT s.id, s.number, s.title, s.response_due, m.number AS matter_number FROM service_register s LEFT JOIN matters m ON m.id = s.matter_id
       WHERE s.status = 'open' AND s.response_due IS NOT NULL AND s.response_due <= $2
         AND (s.handled_by = $1 OR (s.matter_id IS NOT NULL AND EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = s.matter_id AND mm.user_id = $1)))
       ORDER BY s.response_due`,
      [p.id, addDays(day, 3)],
    ),
    q<{ id: string; entity_id: string; title: string; due_on: string; name: string }>(
      `SELECT f.id, f.entity_id, f.title, f.due_on, e.name FROM entity_filings f JOIN entities e ON e.id = f.entity_id
       WHERE f.status = 'due' AND f.responsible = $1 AND f.due_on <= $2 ORDER BY f.due_on`, [p.id, addDays(day, 7)]),
    p.role === "admin"
      ? q<{ id: string; name: string; renews_on: string }>("SELECT id, name, renews_on FROM assets WHERE status != 'retired' AND renews_on <= $1 ORDER BY renews_on", [addDays(day, 14)])
      : Promise.resolve([] as { id: string; name: string; renews_on: string }[]),
  ]);
  return { hearings, tasks, service, filings, renewals };
}

export async function sendDigest(p: Person, day = today(), { force = false } = {}) {
  const r = await remindersFor(p, day);
  if (!r.hearings.length && !r.tasks.length && !r.service.length && !r.filings.length && !r.renewals.length && !force) return { skipped: true };
  const url = portalUrl();
  const detailSms = process.env.PORTAL_SMS_DETAIL === "full";
  const html = emailLayout(
    `Good morning, ${p.full_name.split(" ")[0]}`,
    [
      { heading: "In court", items: r.hearings.map((h) => ({ tag: h.sitting_on === day ? "Today" : "Tomorrow", title: `${h.sitting_time || ""} ${h.business}`.trim(), detail: `${h.title} (${h.number}) · ${h.court} · ${h.appearing_name ? `Counsel: ${h.appearing_name}` : "No counsel assigned"}`, href: `${url}/matters/${h.matter_id}?tab=diary` })) },
      { heading: "Your tasks due", items: r.tasks.map((t) => ({ tag: dueLabel(t.due_on), title: t.title, detail: `${t.kind === "deadline" ? "Deadline · " : ""}${t.number || "No matter"}`, href: t.matter_id ? `${url}/matters/${t.matter_id}?tab=tasks` : `${url}/tasks` })) },
      { heading: "Responses due (service register)", items: r.service.map((s) => ({ tag: dueLabel(s.response_due), title: s.title, detail: `${s.number}${s.matter_number ? ` · ${s.matter_number}` : ""}`, href: `${url}/register/${s.id}` })) },
      { heading: "Company filings due", items: r.filings.map((f) => ({ tag: dueLabel(f.due_on), title: f.title, detail: f.name, href: `${url}/cosec/${f.entity_id}?tab=filings` })) },
      { heading: "Office renewals", items: r.renewals.map((a) => ({ tag: dueLabel(a.renews_on), title: a.name, href: `${url}/office` })) },
    ],
    `${fmtDay(day, { weekday: "long", day: "numeric", month: "long" })}. Here is what needs you.`,
    url,
  );
  const text = [
    `${FIRM.short} Portal reminders for ${fmtDay(day)}`,
    ...r.hearings.map((h) => `COURT ${h.sitting_on === day ? "TODAY" : "TOMORROW"} ${h.sitting_time || ""} ${h.business}: ${h.title} (${h.number}), ${h.court}`),
    ...r.tasks.map((t) => `TASK ${dueLabel(t.due_on)}: ${t.title}`),
    ...r.service.map((s) => `RESPONSE ${dueLabel(s.response_due)}: ${s.title} (${s.number})`),
    ...r.filings.map((f) => `FILING ${dueLabel(f.due_on)}: ${f.title} (${f.name})`),
    ...r.renewals.map((a) => `RENEWAL ${dueLabel(a.renews_on)}: ${a.name}`),
    url,
  ].join("\n");

  // SMS only for what is urgent; matter numbers, never client names
  const urgentTasks = r.tasks.filter((t) => t.due_on <= addDays(day, 1));
  const urgentService = r.service.filter((s) => s.response_due <= addDays(day, 1));
  const smsParts = [
    ...r.hearings.map((h) => `Court ${h.sitting_on === day ? "today" : "tmrw"} ${h.sitting_time || ""} ${h.court.split(",")[0]}: ${detailSms ? h.title : h.number} (${h.business})`),
    ...(urgentTasks.length ? [`${urgentTasks.length} task${urgentTasks.length === 1 ? "" : "s"} due${urgentTasks.some((t) => t.due_on < day) ? " incl. overdue" : ""}`] : []),
    ...(urgentService.length ? [`${urgentService.length} response${urgentService.length === 1 ? "" : "s"} due`] : []),
    ...(r.filings.some((f) => f.due_on <= addDays(day, 1)) ? ["company filing due"] : []),
  ];
  const sms = smsParts.length ? `${FIRM.short}: ${smsParts.join("; ")}. Details in the portal.` : undefined;
  return notify(p, { kind: "digest", key: `digest:${day}`, subject: `${r.hearings.length ? `Court: ${r.hearings.length} · ` : ""}${r.tasks.length + r.service.length + r.filings.length} due · ${fmtDay(day, { day: "numeric", month: "short" })}`, html, text, sms });
}

/** Run the morning reminders for everyone. Safe to call more than once a day. */
export async function runReminders({ day = today(), actor = "system:reminders" } = {}) {
  const people = await q<Person>("SELECT id, email, full_name, phone, role, notify_email, notify_sms FROM users WHERE active AND password_hash IS NOT NULL ORDER BY full_name");
  let emails = 0, sms = 0, failed = 0;
  for (const p of people) {
    const r = (await sendDigest(p, day)) as { email?: string; sms?: string };
    if (r.email === "sent") emails++;
    if (r.sms === "sent") sms++;
    if (r.email === "failed" || r.sms === "failed") failed++;
  }
  const detail = { people: people.length, emails, sms, failed };
  await q("INSERT INTO job_runs (job, run_date, detail) VALUES ('reminders', $1, $2) ON CONFLICT (job, run_date) DO UPDATE SET ran_at = now(), detail = $2", [day, JSON.stringify(detail)]);
  await audit({ actor, action: "job.reminders", detail, ip: null });
  return detail;
}

/** Immediate alert when a document is served on the firm and someone is made responsible. */
export async function alertServed(serviceId: string) {
  const s = await one<{ id: string; number: string; title: string; party: string; response_due: string | null; handled_by: string | null; matter_number: string | null }>(
    "SELECT s.id, s.number, s.title, s.party, s.response_due, s.handled_by, m.number AS matter_number FROM service_register s LEFT JOIN matters m ON m.id = s.matter_id WHERE s.id = $1",
    [serviceId],
  );
  if (!s?.handled_by) return;
  const p = await one<Person>("SELECT id, email, full_name, phone, role, notify_email, notify_sms FROM users WHERE id = $1 AND active", [s.handled_by]);
  if (!p) return;
  const url = portalUrl();
  const soon = s.response_due && (daysUntil(s.response_due) ?? 99) < 7;
  const due = s.response_due ? `Response due ${fmtDay(s.response_due)}${soon ? ` (${dueLabel(s.response_due).toLowerCase()})` : ""}.` : "No response date set yet.";
  await notify(p, {
    kind: "served", key: `served:${s.id}`,
    subject: `Served on the firm: ${s.title}`,
    html: emailLayout("A document was served on the firm", [{ heading: "Service register", items: [{ title: s.title, detail: `${s.number}${s.matter_number ? ` · ${s.matter_number}` : ""} · from ${s.party} · ${due}`, href: `${url}/register/${s.id}`, tag: "New" }] }], "You are responsible for this document.", url),
    text: `Served on the firm: ${s.title} (${s.number}) from ${s.party}. ${due}\n${url}/register/${s.id}`,
    sms: `${FIRM.short}: document served (${s.number}${s.matter_number ? `, ${s.matter_number}` : ""}). ${due} See the portal.`,
  });
}
