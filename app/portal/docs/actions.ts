"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { ownerAccess } from "@/lib/portal/documents";
import { isUuid } from "@/lib/portal/format";

/** Take a document off the list. The file and its record stay (and the action is logged), so nothing is lost by mistake. */
export async function removeDocument(fd: FormData) {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  if (!isUuid(id)) redirect("/portal");
  const d = await one<{ id: string; owner_type: string; owner_id: string; series_id: string; title: string; matter_id: string | null }>("SELECT id, owner_type, owner_id, series_id, title, matter_id FROM documents WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!d) redirect("/portal");
  const a = await ownerAccess(u, d.owner_type, d.owner_id);
  if (!a.ok || u.role === "front_desk") redirect(`${a.back}${a.back.includes("?") ? "&" : "?"}msg=denied`);
  await tx(async (t) => {
    await t.query("UPDATE documents SET deleted_at = now(), deleted_by = $2 WHERE series_id = $1 AND deleted_at IS NULL", [d.series_id, u.id]);
    if (d.matter_id) await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), d.matter_id, `Document removed from the list: ${d.title}`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "document.removed", entityType: "document", entityId: d.id, matterId: d.matter_id, detail: { title: d.title } }, t);
  });
  redirect(`${a.back}${a.back.includes("?") ? "&" : "?"}msg=removed`);
}
