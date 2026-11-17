"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { canRestore } from "@/lib/portal/permissions";
import { ownerAccess } from "@/lib/portal/documents";
import { isUuid } from "@/lib/portal/format";
import { OFFICE_FOLDERS, type OfficeFolder } from "@/lib/portal/intake";

const withMsg = (url: string, msg: string) => `${url}${url.includes("?") ? "&" : "?"}msg=${msg}`;
const backTo = (fd: FormData, fallback: string) => {
  const b = String(fd.get("back") || "");
  return b.startsWith("/portal/") ? b : fallback;
};

async function docFor(id: string) {
  return one<{ id: string; owner_type: string; owner_id: string; series_id: string; title: string; matter_id: string | null; uploaded_by: string | null }>(
    "SELECT id, owner_type, owner_id, series_id, title, matter_id, uploaded_by FROM documents WHERE id = $1 AND deleted_at IS NULL", [id]);
}

/**
 * Delete a document (all its versions). It disappears everywhere at once:
 * lists, folders, search, the assistant. The Managing Partner or the IT
 * officer can bring it back for 60 days; after that its file is erased.
 */
export async function removeDocument(fd: FormData) {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  const d = isUuid(id) ? await docFor(id) : null;
  if (!d) redirect("/portal");
  const a = await ownerAccess(u, d.owner_type, d.owner_id);
  const back = backTo(fd, a.back);
  // Office files: whoever saved it, or a partner. Matter and register files: not front desk.
  const allowed = a.ok && (
    d.owner_type === "office" ? d.uploaded_by === u.id || u.role === "admin" || u.role === "partner"
      : d.owner_type === "personal" || d.owner_type === "inbox" ? true
        : u.role !== "front_desk");
  if (!allowed) redirect(withMsg(back, "denied"));
  await tx(async (t) => {
    await t.query("UPDATE documents SET deleted_at = now(), deleted_by = $2 WHERE series_id = $1 AND deleted_at IS NULL", [d.series_id, u.id]);
    if (d.matter_id) await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), d.matter_id, `Document deleted: ${d.title}`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "document.deleted", entityType: "document", entityId: d.id, matterId: d.matter_id, detail: { title: d.title, where: d.owner_type } }, t);
  });
  redirect(withMsg(back, "removed"));
}

/** Move an office file to another office folder. */
export async function moveOfficeFile(fd: FormData) {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  const to = String(fd.get("folder") || "") as OfficeFolder;
  const d = isUuid(id) ? await docFor(id) : null;
  if (!d || d.owner_type !== "office" || !(to in OFFICE_FOLDERS)) redirect("/portal/files");
  if (d.uploaded_by !== u.id && u.role !== "admin" && u.role !== "partner") redirect("/portal/files?msg=denied");
  await tx(async (t) => {
    await t.query("UPDATE documents SET office_folder = $2 WHERE series_id = $1", [d.series_id, to]);
    await audit({ userId: u.id, actor: u.email, action: "document.moved", entityType: "document", entityId: d.id, detail: { to } }, t);
  });
  redirect(`/portal/files?folder=${to}&msg=saved`);
}

/** Bring a deleted document back (Managing Partner or IT officer, within 60 days). */
export async function restoreDocument(fd: FormData) {
  const u = await requireUser();
  if (!canRestore(u)) redirect("/portal?denied=1");
  const id = String(fd.get("id") || "");
  const d = isUuid(id) ? await one<{ id: string; series_id: string; title: string; matter_id: string | null; deleted_at: string }>(
    "SELECT id, series_id, title, matter_id, deleted_at FROM documents WHERE id = $1 AND deleted_at IS NOT NULL AND purged_at IS NULL AND deleted_at > now() - interval '60 days'", [id]) : null;
  if (!d) redirect("/portal/deleted?msg=invalid");
  await tx(async (t) => {
    // Bring back every version deleted with it
    await t.query("UPDATE documents SET deleted_at = NULL, deleted_by = NULL WHERE series_id = $1 AND deleted_at = $2 AND purged_at IS NULL", [d.series_id, d.deleted_at]);
    if (d.matter_id) await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), d.matter_id, `Document restored: ${d.title}`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "document.restored", entityType: "document", entityId: d.id, matterId: d.matter_id, detail: { title: d.title } }, t);
  });
  redirect(`/portal/deleted?msg=restored&q=${encodeURIComponent(String(fd.get("q") || ""))}`);
}
