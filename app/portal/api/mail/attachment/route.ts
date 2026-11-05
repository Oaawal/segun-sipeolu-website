import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { getMessage, mailAccount, safeFileName } from "@/lib/portal/mail";
import { downloadHeaders } from "@/lib/portal/storage";
import { audit } from "@/lib/portal/audit";

export const runtime = "nodejs";

/** Download one attachment. Always as a download, never displayed, since email attachments are untrusted. */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || !u.mfa_passed || !can(u, "mail.use")) return NextResponse.redirect(new URL("/portal/login", req.url));
  const a = await mailAccount(u.id);
  const sp = req.nextUrl.searchParams;
  const uid = Number(sp.get("uid")), i = Number(sp.get("i"));
  if (!a || !Number.isInteger(uid) || !Number.isInteger(i)) return new NextResponse("Not found", { status: 404 });
  const m = await getMessage(a, sp.get("folder") || "INBOX", uid).catch(() => null);
  const att = m?.mail.attachments?.[i];
  if (!att) return new NextResponse("Not found", { status: 404 });
  await audit({ userId: u.id, actor: u.email, action: "mail.attachment_downloaded", entityType: "user", entityId: u.id });
  return new NextResponse(new Uint8Array(att.content), { headers: downloadHeaders(safeFileName(att.filename, "attachment"), true) });
}
