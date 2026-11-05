"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { dateField, isUuid, oneOf, str } from "@/lib/portal/format";
import { ASSET_KINDS } from "@/lib/portal/vocab";

async function staff(v: FormDataEntryValue | null) {
  const id = String(v || "");
  return isUuid(id) && (await one("SELECT 1 FROM users WHERE id = $1", [id])) ? id : null;
}

export async function saveAsset(fd: FormData) {
  const u = await requirePermission("office.manage");
  const id = String(fd.get("id") || "");
  const name = str(fd, "name", 160);
  if (!name) redirect("/portal/office?msg=invalid");
  const v = [oneOf(fd, "kind", ASSET_KINDS, "other"), name, str(fd, "make_model", 160), str(fd, "serial", 120), await staff(fd.get("assigned_to")), str(fd, "location", 120),
    dateField(fd, "purchased_on"), str(fd, "cost", 40), str(fd, "supplier", 160), dateField(fd, "warranty_until"), dateField(fd, "renews_on"),
    oneOf(fd, "status", { in_use: 1, spare: 1, repair: 1, retired: 1, lost: 1 }, "in_use"), str(fd, "notes", 2000)];
  const nid = isUuid(id) ? id : crypto.randomUUID();
  await tx(async (t) => {
    if (isUuid(id)) await t.query("UPDATE assets SET kind=$2, name=$3, make_model=$4, serial=$5, assigned_to=$6, location=$7, purchased_on=$8, cost=$9, supplier=$10, warranty_until=$11, renews_on=$12, status=$13, notes=$14, updated_at=now() WHERE id=$1", [id, ...v]);
    else await t.query("INSERT INTO assets (id, kind, name, make_model, serial, assigned_to, location, purchased_on, cost, supplier, warranty_until, renews_on, status, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)", [nid, ...v, u.id]);
    await audit({ userId: u.id, actor: u.email, action: isUuid(id) ? "asset.updated" : "asset.created", entityType: "asset", entityId: nid, detail: { name, assigned_to: v[4] } }, t);
  });
  redirect(`/portal/office?msg=saved${isUuid(id) ? `&edit=${id}` : ""}`);
}

export async function saveSystem(fd: FormData) {
  const u = await requirePermission("office.manage");
  const name = str(fd, "name", 120);
  if (!name) redirect("/portal/office?tab=access&msg=invalid");
  const id = crypto.randomUUID();
  await tx(async (t) => {
    await t.query("INSERT INTO systems (id, name, url, owner_note, created_by) VALUES ($1,$2,$3,$4,$5)", [id, name, str(fd, "url", 300), str(fd, "owner_note", 500), u.id]);
    await audit({ userId: u.id, actor: u.email, action: "system_access.system_added", entityType: "system", entityId: id, detail: { name } }, t);
  });
  redirect("/portal/office?tab=access&msg=saved");
}

export async function grantAccess(fd: FormData) {
  const u = await requirePermission("office.manage");
  const sid = String(fd.get("system_id") || "");
  const uid = await staff(fd.get("user_id"));
  if (!isUuid(sid) || !uid) redirect("/portal/office?tab=access&msg=invalid");
  const level = oneOf(fd, "level", { user: 1, admin: 1, signatory: 1 }, "user");
  await tx(async (t) => {
    await t.query(`INSERT INTO system_access (system_id, user_id, level, note) VALUES ($1,$2,$3,$4)
                   ON CONFLICT (system_id, user_id) DO UPDATE SET level = $3, note = $4, granted_on = CURRENT_DATE, revoked_on = NULL`, [sid, uid, level, str(fd, "note", 200)]);
    await audit({ userId: u.id, actor: u.email, action: "system_access.granted", entityType: "system", entityId: sid, detail: { user: uid, level } }, t);
  });
  redirect(`/portal/office?tab=access&msg=saved`);
}

export async function revokeAccess(fd: FormData) {
  const u = await requirePermission("office.manage");
  const sid = String(fd.get("system_id") || "");
  const uid = String(fd.get("user_id") || "");
  const back = String(fd.get("back") || "") === "people" ? `/portal/office?tab=people&person=${uid}` : "/portal/office?tab=access";
  if (!isUuid(sid) || !isUuid(uid)) redirect(back);
  await tx(async (t) => {
    await t.query("UPDATE system_access SET revoked_on = CURRENT_DATE WHERE system_id = $1 AND user_id = $2 AND revoked_on IS NULL", [sid, uid]);
    await audit({ userId: u.id, actor: u.email, action: "system_access.revoked", entityType: "system", entityId: sid, detail: { user: uid } }, t);
  });
  redirect(`${back}&msg=saved`);
}

export async function returnAsset(fd: FormData) {
  const u = await requirePermission("office.manage");
  const id = String(fd.get("id") || "");
  const uid = String(fd.get("user_id") || "");
  if (!isUuid(id)) redirect("/portal/office");
  await tx(async (t) => {
    await t.query("UPDATE assets SET assigned_to = NULL, status = 'spare', updated_at = now() WHERE id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: "asset.returned", entityType: "asset", entityId: id, detail: { from: uid } }, t);
  });
  redirect(`/portal/office?tab=people&person=${uid}&msg=saved`);
}
