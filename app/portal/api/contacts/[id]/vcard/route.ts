import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { isUuid } from "@/lib/portal/format";

export const runtime = "nodejs";

const esc = (s: string | null) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);

/** One contact, or the whole directory (id "all"), as vCard for phones and Outlook. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  if (!can(u, "contacts.view")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  if (id !== "all" && !isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const rows = await q<{ id: string; name: string; organisation: string | null; role: string | null; email: string | null; phone: string | null; phone_alt: string | null; address: string | null; website: string | null; notes: string | null }>(
    `SELECT * FROM contacts WHERE archived_at IS NULL ${id === "all" ? "" : "AND id = $1"} ORDER BY lower(name)`, id === "all" ? [] : [id]);
  if (!rows.length) return new NextResponse("Not found", { status: 404 });
  const cards = rows.map((c) => [
    "BEGIN:VCARD", "VERSION:3.0", `FN:${esc(c.name)}`, `N:${esc(c.name)};;;;`,
    c.organisation && `ORG:${esc(c.organisation)}`, c.role && `TITLE:${esc(c.role)}`,
    c.phone && `TEL;TYPE=WORK,VOICE:${esc(c.phone)}`, c.phone_alt && `TEL;TYPE=CELL:${esc(c.phone_alt)}`,
    c.email && `EMAIL;TYPE=WORK:${esc(c.email)}`, c.address && `ADR;TYPE=WORK:;;${esc(c.address)};;;;`,
    c.website && `URL:${esc(c.website)}`, "CATEGORIES:SOS&A", "END:VCARD",
  ].filter(Boolean).join("\r\n")).join("\r\n");
  await audit({ userId: u.id, actor: u.email, action: "contact.exported", detail: { count: rows.length } });
  return new NextResponse(cards + "\r\n", { headers: { "Content-Type": "text/vcard; charset=utf-8", "Content-Disposition": `attachment; filename="${id === "all" ? "SOSA contacts" : rows[0].name.replace(/[^A-Za-z0-9 .-]/g, "")}.vcf"`, "Cache-Control": "no-store" } });
}
