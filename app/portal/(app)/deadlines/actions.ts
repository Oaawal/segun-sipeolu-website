"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission, requireUser } from "@/lib/portal/auth";
import { can, canSeeMatter } from "@/lib/portal/permissions";
import { matterFacts } from "@/lib/portal/guards";
import { loadService } from "@/lib/portal/data";
import { dateField, isUuid, isYmd, str } from "@/lib/portal/format";
import { computeDeadline, fixedHolidays } from "@/lib/portal/deadlines";

export async function saveRule(fd: FormData) {
  const u = await requirePermission("deadlines.edit");
  const days = Number(fd.get("days"));
  const court = str(fd, "court", 160), trigger = str(fd, "trigger_event", 200), action = str(fd, "action", 200);
  if (!court || !trigger || !action || !Number.isInteger(days) || days < 1 || days > 365) redirect("/portal/deadlines?tab=rules&msg=invalid");
  const id = crypto.randomUUID();
  // A partner adding a rule confirms it at the same time if they tick the box
  const verify = can(u, "deadlines.verify") && fd.get("verified") === "1";
  await tx(async (t) => {
    await t.query(`INSERT INTO deadline_rules (id, court, trigger_event, action, days, count_mode, authority, note, verified_by, verified_at, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, court, trigger, action, days, fd.get("count_mode") === "working" ? "working" : "calendar", str(fd, "authority", 200), str(fd, "note", 1000), verify ? u.id : null, verify ? new Date().toISOString() : null, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "deadline_rule.created", entityType: "deadline_rule", entityId: id, detail: { court, action, days, verified: verify } }, t);
  });
  redirect("/portal/deadlines?tab=rules&msg=saved");
}

export async function verifyRule(fd: FormData) {
  const u = await requirePermission("deadlines.verify");
  const id = String(fd.get("id") || "");
  await tx(async (t) => {
    const r = await t.query("UPDATE deadline_rules SET verified_by = $2, verified_at = now() WHERE id = $1 AND active RETURNING id", [id, u.id]);
    if (r.rows.length) await audit({ userId: u.id, actor: u.email, action: "deadline_rule.verified", entityType: "deadline_rule", entityId: id }, t);
  });
  redirect("/portal/deadlines?tab=rules&msg=rule_verified");
}

export async function retireRule(fd: FormData) {
  const u = await requirePermission("deadlines.verify");
  const id = String(fd.get("id") || "");
  await tx(async (t) => {
    await t.query("UPDATE deadline_rules SET active = FALSE WHERE id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: "deadline_rule.retired", entityType: "deadline_rule", entityId: id }, t);
  });
  redirect("/portal/deadlines?tab=rules&msg=removed");
}

export async function addHoliday(fd: FormData) {
  const u = await requirePermission("deadlines.verify");
  const day = dateField(fd, "day");
  const name = str(fd, "name", 120);
  if (!day || !name) redirect("/portal/deadlines?tab=holidays&msg=invalid");
  await tx(async (t) => {
    await t.query("INSERT INTO holidays (day, name) VALUES ($1,$2) ON CONFLICT (day) DO UPDATE SET name = $2", [day, name]);
    await audit({ userId: u.id, actor: u.email, action: "holiday.added", detail: { day, name } }, t);
  });
  redirect("/portal/deadlines?tab=holidays&msg=saved");
}

export async function removeHoliday(fd: FormData) {
  const u = await requirePermission("deadlines.verify");
  const day = String(fd.get("day") || "");
  if (!isYmd(day)) redirect("/portal/deadlines?tab=holidays");
  await tx(async (t) => {
    await t.query("DELETE FROM holidays WHERE day = $1", [day]);
    await audit({ userId: u.id, actor: u.email, action: "holiday.removed", detail: { day } }, t);
  });
  redirect("/portal/deadlines?tab=holidays&msg=removed");
}

export async function addYearHolidays(fd: FormData) {
  const u = await requirePermission("deadlines.verify");
  const year = Number(fd.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) redirect("/portal/deadlines?tab=holidays&msg=invalid");
  await tx(async (t) => {
    for (const h of fixedHolidays(year)) await t.query("INSERT INTO holidays (day, name) VALUES ($1,$2) ON CONFLICT (day) DO NOTHING", [h.day, h.name]);
    await audit({ userId: u.id, actor: u.email, action: "holiday.year_added", detail: { year } }, t);
  });
  redirect("/portal/deadlines?tab=holidays&msg=saved");
}

/** Put a calculated date on a matter as a deadline task, or on a served document as its response date. */
export async function applyDeadline(fd: FormData) {
  const u = await requireUser();
  const ruleId = String(fd.get("rule_id") || "");
  const from = dateField(fd, "from");
  const rule = isUuid(ruleId) ? await one<{ id: string; court: string; trigger_event: string; action: string; days: number; count_mode: "calendar" | "working"; authority: string | null }>(
    "SELECT id, court, trigger_event, action, days, count_mode, authority FROM deadline_rules WHERE id = $1 AND active AND verified_by IS NOT NULL", [ruleId]) : null;
  if (!rule || !from) redirect("/portal/deadlines?msg=invalid");
  const { due } = await computeDeadline(from, rule.days, rule.count_mode);
  const label = `${rule.action} (${rule.days} ${rule.count_mode === "working" ? "working " : ""}days from ${from}${rule.authority ? `, ${rule.authority}` : ""}, ${rule.court})`;
  const serviceId = String(fd.get("service_id") || "");
  if (isUuid(serviceId)) {
    if (!can(u, "service.edit")) redirect("/portal/deadlines?msg=denied");
    const e = await loadService(u, serviceId);
    if (!e) redirect("/portal/deadlines?msg=denied");
    await tx(async (t) => {
      await t.query("UPDATE service_register SET response_due = $2, updated_at = now() WHERE id = $1", [e.id, due]);
      const upd = await t.query("UPDATE tasks SET due_on = $2 WHERE source = $1 AND status = 'open' RETURNING id", [`service:${e.id}`, due]);
      if (!upd.rows.length) await t.query("INSERT INTO tasks (id, title, detail, matter_id, assigned_to, due_on, kind, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,'deadline','high',$7,$8)",
        [crypto.randomUUID(), `${rule.action}: ${e.title}`.slice(0, 250), label, e.matter_id, e.handled_by || u.id, due, `service:${e.id}`, u.id]);
      await audit({ userId: u.id, actor: u.email, action: "deadline.applied", entityType: "service", entityId: e.id, matterId: e.matter_id, detail: { rule: rule.id, from, due } }, t);
    });
    redirect(`/portal/register/${e.id}?msg=deadline_set`);
  }
  const m = await matterFacts(u, fd.get("matter_id"));
  if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) redirect("/portal/deadlines?msg=denied");
  await tx(async (t) => {
    await t.query("INSERT INTO tasks (id, title, detail, matter_id, assigned_to, due_on, kind, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,'deadline','high',$7,$5)",
      [crypto.randomUUID(), rule.action.slice(0, 250), label, m.id, u.id, due, `rule:${rule.id}`]);
    await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, `Deadline set: ${label}, due ${due}`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "deadline.applied", entityType: "matter", entityId: m.id, matterId: m.id, detail: { rule: rule.id, from, due } }, t);
  });
  redirect(`/portal/matters/${m.id}?tab=tasks&msg=deadline_set`);
}
