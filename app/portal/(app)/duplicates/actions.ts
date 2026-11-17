"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { isUuid } from "@/lib/portal/format";
import { purgeIfUnused, reviewableSql, scanAllForDuplicates } from "@/lib/portal/dedupe";

/** The flagged copy, if it is in this reviewer's queue (litigation team; walls and private inboxes respected). */
async function flagged(fd: FormData) {
  const u = await requirePermission("documents.review_duplicates");
  const id = String(fd.get("id") || "");
  const d = isUuid(id) ? await one<{ id: string; title: string; matter_id: string | null; match: string; duplicate_of: string }>(
    `SELECT d.id, d.title, d.matter_id, x.match, x.duplicate_of
     FROM document_duplicates x JOIN documents d ON d.id = x.document_id
     WHERE x.document_id = $2 AND x.status = 'open' AND d.deleted_at IS NULL AND ${reviewableSql()}`, [u.id, id]) : null;
  if (!d) redirect("/portal/duplicates");
  return { u, d };
}

export async function removeDuplicate(fd: FormData) {
  const { u, d } = await flagged(fd);
  await tx(async (t) => {
    await t.query("UPDATE documents SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL", [d.id, u.id]);
    await t.query("UPDATE document_duplicates SET status = 'removed', reviewed_by = $2, reviewed_at = now() WHERE document_id = $1", [d.id, u.id]);
    if (d.matter_id) await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), d.matter_id, `Duplicate copy removed by the litigation team: ${d.title} (the original is kept)`, u.id]);
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
  const u = await requirePermission("documents.review_duplicates");
  const r = await scanAllForDuplicates();
  await audit({ userId: u.id, actor: u.email, action: "documents.duplicates_scanned", detail: r });
  redirect("/portal/duplicates?msg=duplicates_scanned");
}
