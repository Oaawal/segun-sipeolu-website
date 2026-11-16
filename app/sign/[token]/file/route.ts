import { NextResponse, type NextRequest } from "next/server";
import { signRequestByToken } from "@/lib/portal/signatures";
import { downloadHeaders, getFile } from "@/lib/portal/storage";
import { audit } from "@/lib/portal/audit";

export const runtime = "nodejs";

/** The exact file the signer is asked to sign, while the request is open (or after signing, as a copy). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await signRequestByToken(token);
  if (!r || !["sent", "signed"].includes(r.status)) return new NextResponse("Not found", { status: 404 });
  let bytes: Buffer;
  try { bytes = await getFile(r.storage_key, r.doc_sha256); } catch { return new NextResponse("This document has changed and cannot be signed. Please contact the firm.", { status: 409 }); }
  await audit({ actor: `signer:${r.signer_email}`, action: "signature.document_opened", entityType: "document", entityId: r.document_id, matterId: r.matter_id });
  return new NextResponse(new Uint8Array(bytes), { headers: downloadHeaders(r.file_name, true) });
}
