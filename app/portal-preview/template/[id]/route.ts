import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { canSeeTemplate } from "@/lib/portal/template-access";
import { ext, getFile } from "@/lib/portal/storage";
import { extractText } from "@/lib/portal/fulltext";
import { isUuid } from "@/lib/portal/format";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const common = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "X-Frame-Options": "SAMEORIGIN",
};

function page(body: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    body{margin:0;background:#f4f1ed;font:15px/1.6 "Times New Roman",Georgia,serif;color:#1a1a1a}
    .doc{max-width:820px;margin:24px auto;background:#fff;padding:56px 64px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    @media (max-width:700px){.doc{margin:0;padding:24px 18px}}
    img{max-width:100%;height:auto} table{border-collapse:collapse;width:100%} td,th{border:1px solid #ccc;padding:4px 6px;vertical-align:top}
    pre{white-space:pre-wrap;font:13px/1.55 ui-monospace,Menlo,Consolas,monospace} .note{font:14px/1.5 -apple-system,"Segoe UI",sans-serif;color:#555;text-align:center;padding:48px 16px}
  </style></head><body>${body}</body></html>`;
  // A document is shown, never run: no scripts, no forms, nothing loaded from outside
  return new NextResponse(html, { headers: { ...common, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox" } });
}

/**
 * A preview of a template or reference document, for the frame on its page.
 * PDFs and pictures show as they are; Word documents are turned into a
 * readable page; Excel, PowerPoint, email and text files show their text.
 * Served outside /portal so the portal's "never frame" header does not apply.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed || !can(u, "templates.view")) return new NextResponse("Sign in again.", { status: 401 });
  const { id } = await params;
  const t = isUuid(id) ? await one<{ id: string; title: string; file_name: string; storage_key: string; sha256: string; visible_to: string | null }>("SELECT id, title, file_name, storage_key, sha256, visible_to FROM templates WHERE id = $1", [id]) : null;
  if (!t || !canSeeTemplate(u, t.visible_to)) return new NextResponse("Not found", { status: 404 });
  const bytes = await getFile(t.storage_key, t.sha256);
  await audit({ userId: u.id, actor: u.email, action: "template.previewed", entityType: "template", entityId: t.id, detail: { title: t.title } });
  const e = ext(t.file_name);
  if (e === "pdf") return new NextResponse(new Uint8Array(bytes), { headers: { ...common, "Content-Type": "application/pdf", "Content-Disposition": "inline", "Content-Security-Policy": "frame-ancestors 'self'" } });
  const img: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  if (img[e]) return page(`<div class="doc"><img alt="" src="data:${img[e]};base64,${bytes.toString("base64")}"></div>`);
  if (e === "docx" || e === "dotx") {
    try {
      const mammoth = await import("mammoth");
      const r = await mammoth.convertToHtml({ buffer: bytes });
      // {{fields}} stand out so people can see what gets filled in
      return page(`<div class="doc">${r.value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, '<mark style="background:#f6ebd3;border-radius:3px;padding:0 2px">{{$1}}</mark>')}</div>`);
    } catch { /* fall back to plain text */ }
  }
  try {
    const r = await extractText(bytes, t.file_name);
    if (r && r.method !== "ocr" && r.text.trim()) return page(`<div class="doc"><pre>${esc(r.text.slice(0, 300_000))}</pre></div>`);
  } catch { /* no preview */ }
  return page(`<div class="note">There is no preview for this kind of file (.${esc(e)}). Download it to open it.</div>`);
}
