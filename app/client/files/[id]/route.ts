import { NextResponse, type NextRequest } from "next/server";
import { currentClient, clientMatterSql } from "@/lib/portal/client-auth";
import { one } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { downloadHeaders, getFile } from "@/lib/portal/storage";
import { isUuid } from "@/lib/portal/format";

export const runtime = "nodejs";

/** A document the firm shared with this client (or the client sent), on a matter shared with them. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await currentClient();
  if (!c || !c.mfa_passed) return NextResponse.redirect(new URL("/client/login", req.url));
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const d = await one<{ id: string; matter_id: string; file_name: string; storage_key: string; sha256: string; title: string }>(
    `SELECT d.id, d.matter_id, d.file_name, d.storage_key, d.sha256, d.title FROM documents d JOIN matters m ON m.id = d.matter_id
     WHERE d.id = $2 AND d.owner_type = 'matter' AND d.shared_with_client AND d.deleted_at IS NULL AND ${clientMatterSql()}`, [c.client_id, id]);
  if (!d) return new NextResponse("Not found", { status: 404 });
  let bytes: Buffer;
  try { bytes = await getFile(d.storage_key, d.sha256); } catch { return new NextResponse("This file could not be opened. Please contact the firm.", { status: 409 }); }
  await audit({ actor: `client:${c.email}`, action: "client.document_opened", entityType: "document", entityId: d.id, matterId: d.matter_id, detail: { title: d.title } });
  return new NextResponse(new Uint8Array(bytes), { headers: downloadHeaders(d.file_name, req.nextUrl.searchParams.get("download") === "1") });
}
