import { NextResponse, type NextRequest } from "next/server";
import { tokenUser, unauthorized } from "@/lib/portal/api-auth";
import { listDocuments } from "@/lib/portal/data";
import { ownerAccess } from "@/lib/portal/documents";
import { isUuid } from "@/lib/portal/format";

export const runtime = "nodejs";

/** Word documents already on a matter, so a save can become a new version of one of them. */
export async function GET(req: NextRequest) {
  const u = await tokenUser(req);
  if (!u) return unauthorized();
  const matter = req.nextUrl.searchParams.get("matter") || "";
  if (!isUuid(matter) || !(await ownerAccess(u, "matter", matter)).ok) return NextResponse.json({ error: "No access to that matter" }, { status: 403 });
  const docs = await listDocuments("matter", matter);
  return NextResponse.json(docs.filter((d) => /\.docx?$/i.test(d.file_name)).map((d) => ({ series_id: d.series_id, title: d.title, version: d.version, uploaded_at: d.uploaded_at })));
}
