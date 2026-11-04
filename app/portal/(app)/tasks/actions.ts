"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { can, canSeeMatter, type Actor } from "@/lib/portal/permissions";
import { matterFacts } from "@/lib/portal/guards";
import { dateField, isUuid, oneOf, str } from "@/lib/portal/format";

function back(fd: FormData, fallback = "/portal/tasks") {
  const b = String(fd.get("back") || "");
  return /^\/portal(\/[A-Za-z0-9/_\-?=&%.]*)?$/.test(b) ? b : fallback;
}
const withMsg = (p: string, m: string) => `${p}${p.includes("?") ? "&" : "?"}msg=${m}`;

async function taskAccess(u: Actor, id: string) {
  const t = await one<{ id: string; title: string; matter_id: string | null; assigned_to: string | null; created_by: string | null; status: string }>("SELECT id, title, matter_id, assigned_to, created_by, status FROM tasks WHERE id = $1", [id]);
  if (!t) return null;
  if (t.matter_id) {
    const m = await matterFacts(u, t.matter_id);
    return m && canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member }) ? t : null;
  }
  return t.assigned_to === u.id || t.created_by === u.id || u.role === "admin" ? t : null;
}

export async function createTask(fd: FormData) {
  const u = await requireUser();
  const to = back(fd);
  const title = str(fd, "title", 250);
  if (!title) redirect(withMsg(to, "invalid"));
  let matterId: string | null = null;
  if (fd.get("matter_id")) {
    const m = await matterFacts(u, fd.get("matter_id"));
    if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) redirect(withMsg(to, "denied"));
    matterId = m.id;
  }
  let assignee = String(fd.get("assigned_to") || u.id);
  if (!isUuid(assignee) || (assignee !== u.id && !can(u, "tasks.assign_others"))) assignee = u.id;
  if (!(await one("SELECT 1 FROM users WHERE id = $1 AND active", [assignee]))) assignee = u.id;
  const id = crypto.randomUUID();
  await tx(async (t) => {
    await t.query(
      "INSERT INTO tasks (id, title, detail, matter_id, assigned_to, due_on, kind, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9)",
      [id, title, str(fd, "detail", 2000), matterId, assignee, dateField(fd, "due_on"), oneOf(fd, "kind", { task: 1, deadline: 1 }, "task"), oneOf(fd, "priority", { low: 1, normal: 1, high: 1 }, "normal"), u.id],
    );
    await audit({ userId: u.id, actor: u.email, action: "task.created", entityType: "task", entityId: id, matterId, detail: { assignee } }, t);
  });
  redirect(withMsg(to, "saved"));
}

export async function toggleTask(fd: FormData) {
  const u = await requireUser();
  const to = back(fd);
  const t0 = await taskAccess(u, String(fd.get("id") || ""));
  if (!t0) redirect(withMsg(to, "denied"));
  const done = t0.status !== "done";
  await tx(async (t) => {
    await t.query("UPDATE tasks SET status = $2, completed_at = CASE WHEN $2 = 'done' THEN now() END, completed_by = CASE WHEN $2 = 'done' THEN $3::uuid END WHERE id = $1", [t0.id, done ? "done" : "open", u.id]);
    await audit({ userId: u.id, actor: u.email, action: done ? "task.done" : "task.reopened", entityType: "task", entityId: t0.id, matterId: t0.matter_id }, t);
  });
  redirect(withMsg(to, done ? "task_done" : "saved"));
}
