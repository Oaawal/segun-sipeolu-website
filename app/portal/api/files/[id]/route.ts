import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { audit } from "@/lib/portal/audit";
import { docForDownload } from "@/lib/portal/documents";
import { downloadHeaders, getFile } from "@/lib/portal/storage";
import { isUuid } from "@/lib/portal/format";

export const runtime = "nodejs";

/** Serve a stored document after checking access and its integrity; every open is logged. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const d = await docForDownload(u, id);
  if (!d) return new NextResponse("Not found", { status: 404 });
  if (d === "denied") {
    await audit({ userId: u.id, actor: u.email, action: "document.access_denied", entityType: "document", entityId: id });
    return new NextResponse("You do not have access to this document.", { status: 403 });
  }
  let bytes: Buffer;
  try {
    bytes = await getFile(d.storage_key, d.sha256);
  } catch (err) {
    await audit({ userId: u.id, actor: u.email, action: "document.integrity_failed", entityType: "document", entityId: d.id, matterId: d.matter_id, detail: { error: String((err as Error).message) } });
    return new NextResponse("This file failed its integrity check and was not opened. The incident has been logged; tell the Managing Partner.", { status: 409 });
  }
  await audit({ userId: u.id, actor: u.email, action: "document.opened", entityType: "document", entityId: d.id, matterId: d.matter_id, detail: { title: d.title } });
  return new NextResponse(new Uint8Array(bytes), { headers: downloadHeaders(d.file_name, req.nextUrl.searchParams.get("download") === "1") });
}
