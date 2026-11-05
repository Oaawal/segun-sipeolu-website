import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can, canSeeMatter } from "@/lib/portal/permissions";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { matterFacts } from "@/lib/portal/guards";
import { getFile, putFile, deleteFile } from "@/lib/portal/storage";
import { contextValues, fillDocx } from "@/lib/portal/templates";
import { docxResponseHeaders } from "@/lib/portal/word-export";
import { isUuid, today } from "@/lib/portal/format";

export const runtime = "nodejs";

/**
 * Fill a template for a matter: the result is saved on the matter as a new
 * document (so there is a record of what was produced) and downloaded to
 * open in Word.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return new NextResponse("Forbidden", { status: 403 });
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url), 303);
  if (!can(u, "templates.use")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const t = isUuid(id) ? await one<{ id: string; title: string; category: string; storage_key: string; sha256: string }>("SELECT id, title, category, storage_key, sha256 FROM templates WHERE id = $1 AND active", [id]) : null;
  if (!t) return new NextResponse("Not found", { status: 404 });
  const fd = await req.formData();
  const m = await matterFacts(u, fd.get("matter_id"));
  if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) return NextResponse.redirect(new URL(`/portal/templates/${id}?msg=denied`, req.url), 303);
  const serviceId = String(fd.get("service_id") || "");
  const me = await one<{ title: string | null }>("SELECT title FROM users WHERE id = $1", [u.id]);
  const values = await contextValues({ matterId: m.id, serviceId: isUuid(serviceId) ? serviceId : null, user: { full_name: u.full_name, title: me?.title ?? null } });
  // Boxes filled in on the form (fields the portal cannot know, e.g. {{amount}})
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("f_") && typeof v === "string" && v.trim()) values[k.slice(2)] = v.trim().slice(0, 4000);
  }
  const filled = fillDocx(new Uint8Array(await getFile(t.storage_key, t.sha256)), values);
  const title = `${t.title} · ${m.number}`;
  const fileName = `${t.title} ${m.number.replace(/\//g, "-")} ${today()}.docx`;
  const stored = await putFile(Buffer.from(filled));
  const docId = crypto.randomUUID();
  try {
    await tx(async (x) => {
      await x.query(
        `INSERT INTO documents (id, owner_type, owner_id, matter_id, series_id, version, title, category, file_name, mime_type, size_bytes, sha256, storage_key, uploaded_by, source)
         VALUES ($1,'matter',$2,$2,$1,1,$3,$4,$5,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',$6,$7,$8,$9,'template')`,
        [docId, m.id, title, t.category === "court" ? "pleading" : t.category === "letter" || t.category === "engagement" ? "correspondence" : "other", fileName, filled.length, stored.sha256, stored.key, u.id],
      );
      await x.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, `Document generated from the template "${t.title}"`, u.id]);
      await audit({ userId: u.id, actor: u.email, action: "template.generated", entityType: "template", entityId: t.id, matterId: m.id, detail: { document: docId } }, x);
    });
  } catch (err) {
    await deleteFile(stored.key).catch(() => {});
    throw err;
  }
  return new NextResponse(new Uint8Array(filled), { headers: docxResponseHeaders(fileName) });
}
