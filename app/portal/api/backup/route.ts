import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { audit } from "@/lib/portal/audit";
import { isUuid } from "@/lib/portal/format";
import { buildBackup, readBackup } from "@/lib/portal/backup";

export const runtime = "nodejs";

/** Download a stored backup (?id=) or a fresh one, for the Managing Partner. */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  if (!can(u, "system.manage")) return new NextResponse("Forbidden", { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  let body: Buffer | string;
  let stamp: string;
  if (isUuid(id)) {
    const b = await readBackup(id);
    if (!b) return new NextResponse("Not found", { status: 404 });
    body = b.json;
    stamp = new Date(b.created_at).toISOString();
  } else {
    body = (await buildBackup(u.email)).json;
    stamp = new Date().toISOString();
  }
  await audit({ userId: u.id, actor: u.email, action: "system.backup_downloaded", detail: { stored: isUuid(id) ? id : null } });
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ssa-portal-backup-${stamp.slice(0, 16).replace(/[:T]/g, "-")}.json"`, "Cache-Control": "no-store" },
  });
}
