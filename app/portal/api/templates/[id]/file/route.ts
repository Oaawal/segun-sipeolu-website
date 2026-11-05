import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one } from "@/lib/portal/db";
import { getFile, downloadHeaders } from "@/lib/portal/storage";
import { isUuid } from "@/lib/portal/format";

export const runtime = "nodejs";

/** The blank template, to edit in Word and upload again. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  if (!can(u, "templates.use")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const t = isUuid(id) ? await one<{ file_name: string; storage_key: string; sha256: string }>("SELECT file_name, storage_key, sha256 FROM templates WHERE id = $1", [id]) : null;
  if (!t) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(await getFile(t.storage_key, t.sha256)), { headers: downloadHeaders(t.file_name, true) });
}
