import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { putFile, deleteFile, cleanName, mimeFor, uploadProblem } from "@/lib/portal/storage";
import { extractFields } from "@/lib/portal/templates";
import { visibilityFromForm } from "@/lib/portal/template-access";
import { isUuid } from "@/lib/portal/format";
import { readUploads } from "@/lib/portal/uploads";
import { TEMPLATE_CATEGORIES } from "@/lib/portal/vocab";

export const runtime = "nodejs";

const back = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, req.url), 303);

/**
 * Add a template or reference document, or replace the file of an existing
 * one (id). A Word file with {{fields}} becomes a fill-in template that can
 * be generated for a matter; anything else (PDF, Word, Excel, pictures...)
 * is kept as a reference document to preview and download.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return new NextResponse("Forbidden", { status: 403 });
  const u = await currentUser();
  if (!u || !u.mfa_passed) return back(req, "/portal/login");
  if (!can(u, "templates.manage")) return back(req, "/portal/templates?msg=denied");
  const fd = await req.formData();
  const file = (await readUploads(u.id, fd, "file"))[0] ?? null;
  const id = String(fd.get("id") || "");
  const to = isUuid(id) ? `/portal/templates/${id}` : "/portal/templates";
  if (!file || uploadProblem(file)) return back(req, `${to}?msg=template_bad`);
  const name = cleanName(file.name.split(/[\\/]/).pop() || "document");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let fields: string[] = [];
  if (/\.docx$/i.test(name)) {
    try { fields = extractFields(bytes); } catch { return back(req, `${to}?msg=template_bad`); }
  }
  const kind = fields.length ? "fillable" : "reference";
  const stored = await putFile(Buffer.from(bytes));
  try {
    if (isUuid(id)) {
      if (!(await one("SELECT 1 FROM templates WHERE id = $1", [id]))) return back(req, "/portal/templates");
      await tx(async (t) => {
        await t.query("UPDATE templates SET file_name=$2, size_bytes=$3, sha256=$4, storage_key=$5, fields=$6, kind=$7, mime_type=$8, updated_at=now() WHERE id=$1",
          [id, name, bytes.length, stored.sha256, stored.key, JSON.stringify(fields), kind, mimeFor(name)]);
        await audit({ userId: u.id, actor: u.email, action: "template.replaced", entityType: "template", entityId: id, detail: { sha256: stored.sha256 } }, t);
      });
      return back(req, `${to}?msg=saved`);
    }
    const nid = crypto.randomUUID();
    const category = Object.prototype.hasOwnProperty.call(TEMPLATE_CATEGORIES, String(fd.get("category"))) ? String(fd.get("category")) : "other";
    await tx(async (t) => {
      await t.query("INSERT INTO templates (id, title, category, description, file_name, size_bytes, sha256, storage_key, fields, kind, mime_type, visible_to, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [nid, String(fd.get("title") || "").trim().slice(0, 150) || name.replace(/\.[a-z0-9]+$/i, ""), category, String(fd.get("description") || "").trim().slice(0, 500) || null,
          name, bytes.length, stored.sha256, stored.key, JSON.stringify(fields), kind, mimeFor(name), visibilityFromForm(fd), u.id]);
      await audit({ userId: u.id, actor: u.email, action: "template.added", entityType: "template", entityId: nid, detail: { kind, fields: fields.length } }, t);
    });
    return back(req, `/portal/templates/${nid}?msg=created`);
  } catch (err) {
    await deleteFile(stored.key).catch(() => {});
    throw err;
  }
}
