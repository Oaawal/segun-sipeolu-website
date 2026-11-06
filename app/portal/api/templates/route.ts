import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { putFile, deleteFile, cleanName, MAX_FILE_BYTES } from "@/lib/portal/storage";
import { extractFields } from "@/lib/portal/templates";
import { isUuid } from "@/lib/portal/format";
import { readUploads } from "@/lib/portal/uploads";
import { TEMPLATE_CATEGORIES } from "@/lib/portal/vocab";

export const runtime = "nodejs";

const back = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, req.url), 303);

/** Add a Word template, or replace the file of an existing one (id). */
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
  if (!file || !file.size || file.size > MAX_FILE_BYTES || !/\.docx$/i.test(file.name)) return back(req, `${to}?msg=template_bad`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let fields: string[];
  try { fields = extractFields(bytes); } catch { return back(req, `${to}?msg=template_bad`); }
  const stored = await putFile(Buffer.from(bytes));
  try {
    if (isUuid(id)) {
      const old = await one<{ storage_key: string }>("SELECT storage_key FROM templates WHERE id = $1", [id]);
      if (!old) return back(req, "/portal/templates");
      await tx(async (t) => {
        await t.query("UPDATE templates SET file_name=$2, size_bytes=$3, sha256=$4, storage_key=$5, fields=$6, updated_at=now() WHERE id=$1", [id, cleanName(file.name), bytes.length, stored.sha256, stored.key, JSON.stringify(fields)]);
        await audit({ userId: u.id, actor: u.email, action: "template.replaced", entityType: "template", entityId: id, detail: { sha256: stored.sha256 } }, t);
      });
      return back(req, `${to}?msg=saved`);
    }
    const nid = crypto.randomUUID();
    const category = Object.prototype.hasOwnProperty.call(TEMPLATE_CATEGORIES, String(fd.get("category"))) ? String(fd.get("category")) : "other";
    await tx(async (t) => {
      await t.query("INSERT INTO templates (id, title, category, description, file_name, size_bytes, sha256, storage_key, fields, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [nid, String(fd.get("title") || "").trim().slice(0, 150) || file.name.replace(/\.docx$/i, ""), category, String(fd.get("description") || "").trim().slice(0, 500) || null,
          cleanName(file.name), bytes.length, stored.sha256, stored.key, JSON.stringify(fields), u.id]);
      await audit({ userId: u.id, actor: u.email, action: "template.added", entityType: "template", entityId: nid, detail: { fields: fields.length } }, t);
    });
    return back(req, `/portal/templates/${nid}?msg=created`);
  } catch (err) {
    await deleteFile(stored.key).catch(() => {});
    throw err;
  }
}
