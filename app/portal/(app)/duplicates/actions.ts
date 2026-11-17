"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission, requireUser } from "@/lib/portal/auth";
import { ownerAccess } from "@/lib/portal/documents";
import { isUuid } from "@/lib/portal/format";
import { purgeIfUnused, scanAllForDuplicates } from "@/lib/portal/dedupe";

/** The flagged copy, if this person may decide on it: they saved it, or they run the system, and they can open it. */
async function flagged(fd: FormData) {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  const d = isUuid(id) ? await one<{ id: string; owner_type: string; owner_id: string; title: string; matter_id: string | null; uploaded_by: string | null; match: string; duplicate_of: string }>(
    `SELECT d.id, d.owner_type, d.owner_id, d.title, d.matter_id, d.uploaded_by, x.match, x.duplicate_of
     FROM document_duplicates x JOIN documents d ON d.id = x.document_id WHERE x.document_id = $1 AND x.status = 'open'`, [id]) : null;
  if (!d) redirect("/portal/duplicates");
  const access = await ownerAccess(u, d.owner_type, d.owner_id);
  if (!access.ok || (d.uploaded_by !== u.id && u.role !== "admin")) redirect("/portal/duplicates?msg=denied");
  return { u, d };
}

export async function removeDuplicate(fd: FormData) {
  const { u, d } = await flagged(fd);
  await tx(async (t) => {
    await t.query("UPDATE documents SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL", [d.id, u.id]);
    await t.query("UPDATE document_duplicates SET status = 'removed', reviewed_by = $2, reviewed_at = now() WHERE document_id = $1", [d.id, u.id]);
    if (d.matter_id) await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), d.matter_id, `Duplicate copy removed: ${d.title} (the original is kept)`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "document.duplicate_removed", entityType: "document", entityId: d.id, matterId: d.matter_id, detail: { title: d.title, match: d.match, original: d.duplicate_of } }, t);
  });
  // A same-file copy already shares the original's storage; a same-words copy has its own, which is freed now
  await purgeIfUnused(d.id).catch(() => false);
  redirect("/portal/duplicates?msg=duplicate_removed");
}

export async function keepDuplicate(fd: FormData) {
  const { u, d } = await flagged(fd);
  await tx(async (t) => {
    await t.query("UPDATE document_duplicates SET status = 'kept', reviewed_by = $2, reviewed_at = now() WHERE document_id = $1", [d.id, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "document.duplicate_kept", entityType: "document", entityId: d.id, matterId: d.matter_id, detail: { original: d.duplicate_of } }, t);
  });
  redirect("/portal/duplicates?msg=duplicate_kept");
}

export async function scanDuplicates() {
  const u = await requirePermission("system.manage");
  const r = await scanAllForDuplicates();
  await audit({ userId: u.id, actor: u.email, action: "system.duplicates_scanned", detail: r });
  redirect("/portal/duplicates?msg=duplicates_scanned");
}
