"use server";

import { redirect } from "next/navigation";
import { one, tx, nextNumber } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { can, canSeeMatter } from "@/lib/portal/permissions";
import { matterFacts } from "@/lib/portal/guards";
import { loadService } from "@/lib/portal/data";
import { addDays, dateField, fmtDay, isUuid, oneOf, str, today } from "@/lib/portal/format";
import { FIRM, SERVICE_KINDS, SERVICE_METHODS } from "@/lib/portal/vocab";

async function handler(v: FormDataEntryValue | null) {
  const id = String(v || "");
  return isUuid(id) && (await one("SELECT 1 FROM users WHERE id = $1 AND active AND role != 'front_desk'", [id])) ? id : null;
}

export async function createEntry(fd: FormData) {
  const u = await requireUser();
  const direction = fd.get("direction") === "out" ? "out" : "in";
  if (direction === "in" ? !can(u, "service.log_inward") : !can(u, "service.edit")) redirect("/portal/register?msg=denied");
  const title = str(fd, "title", 250);
  const party = str(fd, "party", 200);
  const servedOn = dateField(fd, "served_on") || today();
  if (!title || !party) redirect(`/portal/register/new?direction=${direction}&msg=invalid`);

  // Link to a matter: chosen from the list (people who can see matters), or matched
  // from the suit / matter number on the document (front desk, without revealing matters)
  let matterId: string | null = null;
  const picked = await matterFacts(u, fd.get("matter_id"));
  if (picked && canSeeMatter(u, { confidential: picked.confidential, isMember: picked.is_member })) matterId = picked.id;
  const ref = str(fd, "reference", 80);
  if (!matterId && ref) {
    const hit = await one<{ id: string }>("SELECT id FROM matters WHERE lower(suit_number) = lower($1) OR lower(number) = lower($1) LIMIT 1", [ref]);
    if (hit) matterId = hit.id;
  }
  const presetDays = Number(fd.get("due_days") || 0);
  const due = dateField(fd, "response_due") || (presetDays > 0 && presetDays <= 365 ? addDays(servedOn, presetDays) : null);
  let handledBy = await handler(fd.get("handled_by"));
  if (!handledBy && matterId) {
    // Default to the matter lead, so a document served on the firm reaches its lawyer
    const lead = await one<{ user_id: string }>("SELECT user_id FROM matter_members WHERE matter_id = $1 ORDER BY role = 'lead' DESC, added_at LIMIT 1", [matterId]);
    handledBy = lead?.user_id ?? null;
  }
  const id = crypto.randomUUID();
  const kind = oneOf(fd, "kind", SERVICE_KINDS, "other");
  await tx(async (t) => {
    const number = await nextNumber(t, `${direction === "in" ? "IN" : "OUT"}`);
    await t.query(
      `INSERT INTO service_register (id, number, direction, kind, title, matter_id, party, method, served_on, served_at, served_by, received_by, proof, response_due, handled_by, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [id, number, direction, kind, title, matterId, party, oneOf(fd, "method", SERVICE_METHODS, "hand"), servedOn, str(fd, "served_at", 10),
        str(fd, "served_by", 160), str(fd, "received_by", 160) || (direction === "in" ? u.full_name : null), str(fd, "proof", 300), due, handledBy, str(fd, "notes", 4000), u.id],
    );
    if (due && handledBy) {
      await t.query(
        "INSERT INTO tasks (id, title, matter_id, assigned_to, due_on, kind, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,'deadline','high',$6,$7)",
        [crypto.randomUUID(), `${direction === "in" ? "Respond to" : "Follow up"}: ${title} (${number})`, matterId, handledBy, due, `service:${id}`, u.id],
      );
    }
    if (matterId) {
      await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)",
        [crypto.randomUUID(), matterId, `${direction === "in" ? "Served on us" : "We served"}: ${title} (${number}) on ${fmtDay(servedOn)}${due ? `. Response due ${fmtDay(due)}` : ""}.`, u.id]);
    }
    await audit({ userId: u.id, actor: u.email, action: "service.logged", entityType: "service", entityId: id, matterId, detail: { number, direction, kind, due } }, t);
  });
  redirect(`/portal/register/${id}?msg=created`);
}

export async function updateEntry(fd: FormData) {
  const u = await requireUser();
  if (!can(u, "service.edit")) redirect("/portal/register?msg=denied");
  const e = await loadService(u, String(fd.get("id") || ""));
  if (!e) redirect("/portal/register?msg=denied");
  let matterId = e.matter_id;
  const picked = await matterFacts(u, fd.get("matter_id"));
  if (picked && canSeeMatter(u, { confidential: picked.confidential, isMember: picked.is_member })) matterId = picked.id;
  const status = oneOf(fd, "status", { open: 1, actioned: 1, filed: 1 }, "open");
  const due = dateField(fd, "response_due");
  await tx(async (t) => {
    await t.query("UPDATE service_register SET status=$2, response_due=$3, handled_by=$4, matter_id=$5, proof=$6, notes=$7, updated_at=now() WHERE id=$1",
      [e.id, status, due, await handler(fd.get("handled_by")), matterId, str(fd, "proof", 300), str(fd, "notes", 4000)]);
    if (status !== "open") await t.query("UPDATE tasks SET status = 'done', completed_at = now(), completed_by = $2 WHERE source = $1 AND status = 'open'", [`service:${e.id}`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "service.updated", entityType: "service", entityId: e.id, matterId, detail: { status, due } }, t);
  });
  redirect(`/portal/register/${e.id}?msg=saved`);
}
