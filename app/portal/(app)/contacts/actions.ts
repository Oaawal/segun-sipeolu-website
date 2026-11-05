"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { canSeeMatter } from "@/lib/portal/permissions";
import { matterFacts } from "@/lib/portal/guards";
import { isUuid, oneOf, str } from "@/lib/portal/format";
import { CONTACT_KINDS } from "@/lib/portal/vocab";

export async function saveContact(fd: FormData) {
  const u = await requirePermission("contacts.edit");
  const id = String(fd.get("id") || "");
  const name = str(fd, "name", 160);
  if (!name) redirect(`/portal/contacts${isUuid(id) ? `/${id}` : ""}?msg=invalid`);
  const v = [name, str(fd, "organisation", 160), oneOf(fd, "kind", CONTACT_KINDS, "other"), str(fd, "role", 120), str(fd, "email", 254)?.toLowerCase() ?? null,
    str(fd, "phone", 40), str(fd, "phone_alt", 40), str(fd, "address", 500), str(fd, "website", 200), str(fd, "notes", 4000)];
  if (isUuid(id)) {
    await tx(async (t) => {
      await t.query("UPDATE contacts SET name=$2, organisation=$3, kind=$4, role=$5, email=$6, phone=$7, phone_alt=$8, address=$9, website=$10, notes=$11, updated_at=now() WHERE id=$1", [id, ...v]);
      await audit({ userId: u.id, actor: u.email, action: "contact.updated", entityType: "contact", entityId: id }, t);
    });
    redirect(`/portal/contacts/${id}?msg=saved`);
  }
  const nid = crypto.randomUUID();
  await tx(async (t) => {
    await t.query("INSERT INTO contacts (id, name, organisation, kind, role, email, phone, phone_alt, address, website, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [nid, ...v, u.id]);
    const m = await matterFacts(u, fd.get("matter_id"));
    if (m && canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) await t.query("INSERT INTO contact_matters (contact_id, matter_id, added_by) VALUES ($1,$2,$3)", [nid, m.id, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "contact.created", entityType: "contact", entityId: nid, detail: { name } }, t);
  });
  redirect(`/portal/contacts/${nid}?msg=created`);
}

export async function linkContact(fd: FormData) {
  const u = await requirePermission("contacts.edit");
  const id = String(fd.get("id") || "");
  const m = await matterFacts(u, fd.get("matter_id"));
  if (!isUuid(id) || !m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) redirect(`/portal/contacts/${id}?msg=denied`);
  await tx(async (t) => {
    await t.query("INSERT INTO contact_matters (contact_id, matter_id, note, added_by) VALUES ($1,$2,$3,$4) ON CONFLICT (contact_id, matter_id) DO UPDATE SET note = $3", [id, m.id, str(fd, "note", 200), u.id]);
    await audit({ userId: u.id, actor: u.email, action: "contact.linked", entityType: "contact", entityId: id, matterId: m.id }, t);
  });
  redirect(`/portal/contacts/${id}?msg=saved`);
}

export async function archiveContact(fd: FormData) {
  const u = await requirePermission("contacts.edit");
  const id = String(fd.get("id") || "");
  if (!isUuid(id) || !(await one("SELECT 1 FROM contacts WHERE id = $1", [id]))) redirect("/portal/contacts");
  await tx(async (t) => {
    await t.query("UPDATE contacts SET archived_at = now() WHERE id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: "contact.archived", entityType: "contact", entityId: id }, t);
  });
  redirect("/portal/contacts?msg=removed");
}
