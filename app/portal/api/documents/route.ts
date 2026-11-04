import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { tx, one } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { ownerAccess } from "@/lib/portal/documents";
import { putFile, deleteFile, uploadProblem, cleanName, mimeFor } from "@/lib/portal/storage";
import { isUuid } from "@/lib/portal/format";
import { DOC_CATEGORIES } from "@/lib/portal/vocab";

export const runtime = "nodejs";

function back(req: NextRequest, path: string, msg: string) {
  return NextResponse.redirect(new URL(`${path}${path.includes("?") ? "&" : "?"}msg=${msg}`, req.url), 303);
}

/** Upload a document (or a new version of one) to a matter, register entry or meeting. */
export async function POST(req: NextRequest) {
  // Same-origin form posts only (blocks cross-site request forgery)
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return new NextResponse("Forbidden", { status: 403 });
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url), 303);
  const fd = await req.formData();
  const ownerType = String(fd.get("owner_type") || "");
  const ownerId = String(fd.get("owner_id") || "");
  if (!["matter", "service", "meeting"].includes(ownerType) || !isUuid(ownerId)) return new NextResponse("Bad request", { status: 400 });
  const access = await ownerAccess(u, ownerType, ownerId);
  if (!access.ok || (u.role === "front_desk" && ownerType !== "service")) return back(req, "/portal", "denied");

  const file = fd.get("file") as File | null;
  if (uploadProblem(file)) return back(req, access.back, "upload_failed");
  const f = file!;
  const name = cleanName(f.name);
  const series = String(fd.get("series_id") || "");
  const prev = isUuid(series) ? await one<{ version: number; title: string; category: string | null }>(
    "SELECT MAX(version) AS version, MAX(title) AS title, MAX(category) AS category FROM documents WHERE series_id = $1 AND owner_type = $2 AND owner_id = $3", [series, ownerType, ownerId]) : null;
  const isVersion = !!prev?.version;
  const title = String(fd.get("title") || "").trim().slice(0, 200) || prev?.title || name;
  const category = Object.prototype.hasOwnProperty.call(DOC_CATEGORIES, String(fd.get("category"))) ? String(fd.get("category")) : prev?.category || "other";
  const stored = await putFile(Buffer.from(await f.arrayBuffer()));
  const id = crypto.randomUUID();
  try {
    await tx(async (t) => {
      await t.query(
        `INSERT INTO documents (id, owner_type, owner_id, matter_id, series_id, version, title, category, file_name, mime_type, size_bytes, sha256, storage_key, privileged, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [id, ownerType, ownerId, access.matterId, isVersion ? series : id, isVersion ? prev!.version + 1 : 1, title, category, name, mimeFor(name), f.size, stored.sha256, stored.key, fd.get("privileged") === "1", u.id],
      );
      if (access.matterId) {
        await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)",
          [crypto.randomUUID(), access.matterId, `${isVersion ? `New version (v${prev!.version + 1}) of` : "Document added:"} ${title}`, u.id]);
      }
      await audit({ userId: u.id, actor: u.email, action: isVersion ? "document.new_version" : "document.uploaded", entityType: "document", entityId: id, matterId: access.matterId, detail: { title, sha256: stored.sha256, size: f.size } }, t);
    });
  } catch (err) {
    await deleteFile(stored.key).catch(() => {});
    throw err;
  }
  return back(req, access.back, "uploaded");
}
