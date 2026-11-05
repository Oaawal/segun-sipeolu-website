"use server";

import { redirect } from "next/navigation";
import { q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { putFile } from "@/lib/portal/storage";
import { extractFields } from "@/lib/portal/templates";
import { starterTemplates } from "@/lib/portal/starter-templates";
import { isUuid, str } from "@/lib/portal/format";
import { TEMPLATE_CATEGORIES } from "@/lib/portal/vocab";

export async function installStarters() {
  const u = await requirePermission("templates.manage");
  const existing = new Set((await q<{ title: string }>("SELECT title FROM templates")).map((r) => r.title));
  let added = 0;
  for (const s of await starterTemplates()) {
    if (existing.has(s.title)) continue;
    const stored = await putFile(Buffer.from(s.bytes));
    const id = crypto.randomUUID();
    await tx(async (t) => {
      await t.query("INSERT INTO templates (id, title, category, description, file_name, size_bytes, sha256, storage_key, fields, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [id, s.title, s.category, s.description, s.file_name, s.bytes.length, stored.sha256, stored.key, JSON.stringify(extractFields(s.bytes)), u.id]);
      await audit({ userId: u.id, actor: u.email, action: "template.added", entityType: "template", entityId: id, detail: { starter: true } }, t);
    });
    added++;
  }
  redirect(`/portal/templates?msg=${added ? "created" : "saved"}`);
}

export async function updateTemplate(fd: FormData) {
  const u = await requirePermission("templates.manage");
  const id = String(fd.get("id") || "");
  if (!isUuid(id)) redirect("/portal/templates");
  const category = Object.prototype.hasOwnProperty.call(TEMPLATE_CATEGORIES, String(fd.get("category"))) ? String(fd.get("category")) : "other";
  await tx(async (t) => {
    await t.query("UPDATE templates SET title = $2, category = $3, description = $4, active = $5, updated_at = now() WHERE id = $1",
      [id, str(fd, "title", 150) || "Untitled template", category, str(fd, "description", 500), fd.get("active") !== "0"]);
    await audit({ userId: u.id, actor: u.email, action: "template.updated", entityType: "template", entityId: id }, t);
  });
  redirect(`/portal/templates/${id}?msg=saved`);
}
