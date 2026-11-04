import { NextResponse, type NextRequest } from "next/server";
import { tokenUser, unauthorized } from "@/lib/portal/api-auth";
import { ownerAccess } from "@/lib/portal/documents";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { putFile, deleteFile, MAX_FILE_BYTES } from "@/lib/portal/storage";
import { isUuid } from "@/lib/portal/format";
import { DOC_CATEGORIES } from "@/lib/portal/vocab";

export const runtime = "nodejs";

/**
 * Save the open Word document into a matter. With series_id it becomes the
 * next version of that document; otherwise it starts a new document.
 * Body: multipart form with file, matter_id, title, category, series_id?, note?
 */
export async function POST(req: NextRequest) {
  const u = await tokenUser(req);
  if (!u) return unauthorized();
  const fd = await req.formData();
  const matterId = String(fd.get("matter_id") || "");
  if (!isUuid(matterId)) return NextResponse.json({ error: "Choose a matter" }, { status: 400 });
  const access = await ownerAccess(u, "matter", matterId);
  if (!access.ok) {
    await audit({ userId: u.id, actor: u.email, action: "document.access_denied", entityType: "matter", entityId: matterId, detail: { via: "word" }, ip: null });
    return NextResponse.json({ error: "You do not have access to that matter" }, { status: 403 });
  }
  const file = fd.get("file") as File | null;
  if (!file || !file.size) return NextResponse.json({ error: "The document is empty" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "The document is too large" }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  // A .docx is a ZIP: check the signature so nothing else slips in through this route
  if (bytes.subarray(0, 2).toString() !== "PK") return NextResponse.json({ error: "That is not a Word document" }, { status: 400 });

  const series = String(fd.get("series_id") || "");
  const prev = isUuid(series)
    ? await one<{ version: number; title: string; category: string | null }>("SELECT MAX(version) AS version, MAX(title) AS title, MAX(category) AS category FROM documents WHERE series_id = $1 AND owner_type = 'matter' AND owner_id = $2 AND deleted_at IS NULL", [series, matterId])
    : null;
  const isVersion = !!prev?.version;
  const title = String(fd.get("title") || "").trim().slice(0, 200) || prev?.title || "Untitled document";
  const category = Object.prototype.hasOwnProperty.call(DOC_CATEGORIES, String(fd.get("category"))) ? String(fd.get("category")) : prev?.category || "other";
  const note = String(fd.get("note") || "").trim().slice(0, 500);
  const name = `${title.replace(/[\\/:*?"<>|\r\n]+/g, "-").slice(0, 150)}.docx`;
  const stored = await putFile(bytes);
  const id = crypto.randomUUID();
  const version = isVersion ? prev!.version + 1 : 1;
  try {
    await tx(async (t) => {
      await t.query(
        `INSERT INTO documents (id, owner_type, owner_id, matter_id, series_id, version, title, category, file_name, mime_type, size_bytes, sha256, storage_key, uploaded_by)
         VALUES ($1,'matter',$2,$2,$3,$4,$5,$6,$7,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',$8,$9,$10,$11)`,
        [id, matterId, isVersion ? series : id, version, title, category, name, bytes.length, stored.sha256, stored.key, u.id],
      );
      await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)",
        [crypto.randomUUID(), matterId, `Saved from Word: ${title} (v${version})${note ? `: ${note}` : ""}`, u.id]);
      await audit({ userId: u.id, actor: u.email, action: isVersion ? "document.new_version" : "document.uploaded", entityType: "document", entityId: id, matterId, detail: { title, version, via: "word", sha256: stored.sha256 }, ip: null }, t);
    });
  } catch (err) {
    await deleteFile(stored.key).catch(() => {});
    throw err;
  }
  return NextResponse.json({ ok: true, document_id: id, series_id: isVersion ? series : id, version, title, sha256: stored.sha256 });
}
