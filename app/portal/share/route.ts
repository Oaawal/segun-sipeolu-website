import { NextResponse, type NextRequest } from "next/server";
import { currentUser, requestMeta } from "@/lib/portal/auth";
import { saveIncoming } from "@/lib/portal/intake";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Share target for the installed portal app: on an Android phone, "Share →
 * SOS&A Portal" from WhatsApp, Gmail, Files or the camera sends the files
 * here, and they land in the person's own inbox to be filed.
 */
export async function POST(req: NextRequest) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login?share=1", req.url), 303);
  const fd = await req.formData();
  const files = fd.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && f.size > 0);
  const { ip } = await requestMeta();
  let saved = 0, failed = 0;
  for (const f of files.slice(0, 20)) {
    const r = await saveIncoming(u, f, { destination: { kind: "inbox" }, source: "phone_share", ip });
    if ("error" in r) failed++; else saved++;
  }
  const msg = !files.length ? "share_nofile" : failed ? "share_partial" : "shared";
  return NextResponse.redirect(new URL(`/portal/inbox?msg=${msg}&n=${saved}`, req.url), 303);
}

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/portal/inbox", req.url));
}
