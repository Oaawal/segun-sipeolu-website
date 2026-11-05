import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { getMessage, mailAccount } from "@/lib/portal/mail";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * An email's body, for the frame on the message page. Emails are untrusted:
 * the frame is sandboxed (no scripts, its own origin) and this response
 * carries a strict Content-Security-Policy, so nothing in an email can run
 * code, submit forms or reach the portal. Pictures from the internet stay
 * blocked unless the reader chooses to show them. Served outside /portal so
 * the portal's "never frame" header does not apply to this one frame.
 */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || !u.mfa_passed || !can(u, "mail.use")) return new NextResponse("Sign in again.", { status: 401 });
  const a = await mailAccount(u.id);
  const uid = Number(req.nextUrl.searchParams.get("uid"));
  if (!a || !Number.isInteger(uid)) return new NextResponse("Not found", { status: 404 });
  const m = await getMessage(a, req.nextUrl.searchParams.get("folder") || "INBOX", uid).catch(() => null);
  if (!m) return new NextResponse("Not found", { status: 404 });
  let html = m.mail.html || `<pre style="white-space:pre-wrap;font:14px/1.55 -apple-system,Segoe UI,sans-serif">${esc(m.mail.text || "")}</pre>`;
  // Inline pictures (cid:) become data: URLs so they show without any network request
  for (const att of m.mail.attachments || []) {
    if (att.cid && /^image\//.test(att.contentType)) html = html.split(`cid:${att.cid}`).join(`data:${att.contentType};base64,${att.content.toString("base64")}`);
  }
  const images = req.nextUrl.searchParams.get("images") === "1";
  const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:18px 20px;font:14px/1.55 -apple-system,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;word-wrap:break-word}img{max-width:100%;height:auto}blockquote{margin:0 0 0 .8ex;border-left:2px solid #ddd;padding-left:1ex;color:#555}</style></head><body>${html}</body></html>`;
  return new NextResponse(page, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy": `default-src 'none'; img-src data:${images ? " https:" : ""}; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; sandbox allow-popups allow-popups-to-escape-sandbox`,
    },
  });
}
