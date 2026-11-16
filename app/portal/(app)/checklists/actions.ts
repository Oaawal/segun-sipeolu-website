"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { canSeeMatter } from "@/lib/portal/permissions";
import { matterFacts } from "@/lib/portal/guards";
import { isUuid, oneOf, str } from "@/lib/portal/format";
import { MATTER_TYPES } from "@/lib/portal/vocab";
import { applyWorkflow, STARTER_WORKFLOWS, stepsFromText } from "@/lib/portal/workflows";

export async function saveWorkflow(fd: FormData) {
  const u = await requirePermission("workflows.manage");
  const id = String(fd.get("id") || "");
  const name = str(fd, "name", 160);
  const steps = stepsFromText(String(fd.get("steps") || ""));
  if (!name || !steps.length) redirect("/portal/checklists?msg=invalid");
  const type = fd.get("matter_type") ? oneOf(fd, "matter_type", MATTER_TYPES, "other") : null;
  await tx(async (t) => {
    if (isUuid(id)) await t.query("UPDATE workflows SET name = $2, matter_type = $3, description = $4, steps = $5, updated_at = now() WHERE id = $1", [id, name, type, str(fd, "description", 500), JSON.stringify(steps)]);
    else await t.query("INSERT INTO workflows (id, name, matter_type, description, steps, created_by) VALUES ($1,$2,$3,$4,$5,$6)", [crypto.randomUUID(), name, type, str(fd, "description", 500), JSON.stringify(steps), u.id]);
    await audit({ userId: u.id, actor: u.email, action: isUuid(id) ? "workflow.updated" : "workflow.created", entityType: "workflow", entityId: isUuid(id) ? id : null, detail: { name, steps: steps.length } }, t);
  });
  redirect("/portal/checklists?msg=saved");
}

export async function archiveWorkflow(fd: FormData) {
  const u = await requirePermission("workflows.manage");
  const id = String(fd.get("id") || "");
  if (!isUuid(id)) redirect("/portal/checklists");
  await tx(async (t) => {
    await t.query("UPDATE workflows SET active = FALSE, updated_at = now() WHERE id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: "workflow.archived", entityType: "workflow", entityId: id }, t);
  });
  redirect("/portal/checklists?msg=removed");
}

export async function addStarterWorkflows() {
  const u = await requirePermission("workflows.manage");
  await tx(async (t) => {
    for (const w of STARTER_WORKFLOWS) {
      if ((await t.query("SELECT 1 FROM workflows WHERE name = $1", [w.name])).rows.length) continue;
      await t.query("INSERT INTO workflows (id, name, matter_type, description, steps, created_by) VALUES ($1,$2,$3,$4,$5,$6)", [crypto.randomUUID(), w.name, w.matter_type, w.description, JSON.stringify(stepsFromText(w.steps)), u.id]);
    }
    await audit({ userId: u.id, actor: u.email, action: "workflow.starters_added" }, t);
  });
  redirect("/portal/checklists?msg=saved");
}

export async function applyChecklist(fd: FormData) {
  const u = await requirePermission("tasks.assign_others");
  const m = await matterFacts(u, fd.get("matter_id"));
  const wf = String(fd.get("workflow_id") || "");
  if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member }) || !isUuid(wf) || !(await one("SELECT 1 FROM workflows WHERE id = $1 AND active", [wf]))) redirect("/portal/matters?msg=denied");
  await tx(async (t) => {
    const n = await applyWorkflow(t, m.id, wf, u.id);
    await audit({ userId: u.id, actor: u.email, action: "workflow.applied", entityType: "matter", entityId: m.id, matterId: m.id, detail: { workflow: wf, tasks: n } }, t);
  });
  redirect(`/portal/matters/${m.id}?tab=tasks&msg=checklist_applied`);
}
