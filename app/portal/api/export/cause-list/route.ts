import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { diary } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { buildDocx, docxResponseHeaders } from "@/lib/portal/word-export";
import { fmtDay, isYmd, today } from "@/lib/portal/format";

export const runtime = "nodejs";

/** The day's cause list as a Word document. */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  const day = isYmd(req.nextUrl.searchParams.get("day")) ? req.nextUrl.searchParams.get("day")! : today();
  const rows = await diary(u, day, day, { mine: !can(u, "diary.view_all") });
  const buf = await buildDocx({
    title: "Daily cause list",
    subtitle: fmtDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    blocks: [rows.length
      ? { type: "table", head: ["Time", "Court", "Matter", "Suit no.", "Business", "Counsel"], rows: rows.map((h) => [h.sitting_time || "—", `${h.court}${h.judge ? `\n${h.judge}` : ""}`, h.matter_title, h.suit_number || h.matter_number, h.business, h.appearing_name || "—"]) }
      : { type: "para", text: "No matters listed for this day.", muted: true }],
  });
  await audit({ userId: u.id, actor: u.email, action: "diary.exported", detail: { day } });
  return new NextResponse(new Uint8Array(buf), { headers: docxResponseHeaders(`Cause list ${day}.docx`) });
}
