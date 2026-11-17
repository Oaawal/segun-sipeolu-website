import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { canSeeTemplate } from "@/lib/portal/template-access";
import { getFile, downloadHeaders } from "@/lib/portal/storage";
import { isUuid } from "@/lib/portal/format";

export const runtime = "nodejs";

/** The template or reference document itself, for those allowed to see it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  if (!can(u, "templates.view")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const t = isUuid(id) ? await one<{ id: string; title: string; file_name: string; storage_key: string; sha256: string; visible_to: string | null }>("SELECT id, title, file_name, storage_key, sha256, visible_to FROM templates WHERE id = $1", [id]) : null;
  if (!t || !canSeeTemplate(u, t.visible_to)) return new NextResponse("Not found", { status: 404 });
  await audit({ userId: u.id, actor: u.email, action: "template.downloaded", entityType: "template", entityId: t.id, detail: { title: t.title } });
  return new NextResponse(new Uint8Array(await getFile(t.storage_key, t.sha256)), { headers: downloadHeaders(t.file_name, true) });
}
