"use server";

import { redirect } from "next/navigation";
import { q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { canSeeMatter } from "@/lib/portal/permissions";
import { matterFacts } from "@/lib/portal/guards";
import { isUuid } from "@/lib/portal/format";
import { DOC_CATEGORIES } from "@/lib/portal/vocab";

/** Move ticked inbox files onto a matter. Only the owner's own inbox, only matters they can open. */
export async function fileDocuments(fd: FormData) {
  const u = await requireUser();
  const ids = fd.getAll("doc").map(String).filter(isUuid).slice(0, 200);
  const m = await matterFacts(u, fd.get("matter_id"));
  if (!ids.length || !m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member }) || u.role === "front_desk") redirect("/portal/inbox?msg=invalid");
  const category = Object.prototype.hasOwnProperty.call(DOC_CATEGORIES, String(fd.get("category"))) ? String(fd.get("category")) : null;
  await tx(async (t) => {
    const moved = (await t.query<{ id: string; title: string }>(
      `UPDATE documents SET owner_type = 'matter', owner_id = $2, matter_id = $2, category = COALESCE($4, category)
       WHERE id = ANY($1::uuid[]) AND owner_type = 'inbox' AND owner_id = $3 AND deleted_at IS NULL RETURNING id, title`,
      [ids, m.id, u.id, category],
    )).rows;
    if (moved.length) {
      await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)",
        [crypto.randomUUID(), m.id, `Filed from ${u.full_name}'s inbox: ${moved.map((d) => d.title).join(", ").slice(0, 900)}`, u.id]);
      await audit({ userId: u.id, actor: u.email, action: "document.filed", entityType: "matter", entityId: m.id, matterId: m.id, detail: { documents: moved.map((d) => d.id) } }, t);
    }
  });
  redirect(`/portal/inbox?msg=filed&to=${m.id}`);
}

export async function removeFromInbox(fd: FormData) {
  const u = await requireUser();
  const ids = fd.getAll("doc").map(String).filter(isUuid).slice(0, 200);
  if (!ids.length) redirect("/portal/inbox");
  const rows = await q<{ id: string }>(
    "UPDATE documents SET deleted_at = now(), deleted_by = $2 WHERE id = ANY($1::uuid[]) AND owner_type = 'inbox' AND owner_id = $2 AND deleted_at IS NULL RETURNING id",
    [ids, u.id],
  );
  await audit({ userId: u.id, actor: u.email, action: "document.removed", entityType: "inbox", entityId: u.id, detail: { documents: rows.map((r) => r.id) } });
  redirect("/portal/inbox?msg=removed");
}
