import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { loadMeeting } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { buildDocx, docxResponseHeaders } from "@/lib/portal/word-export";
import { fmtDay, isUuid } from "@/lib/portal/format";
import { MEETING_KINDS } from "@/lib/portal/vocab";
import type { Minutes } from "@/lib/portal/minutes";

export const runtime = "nodejs";

/** Meeting minutes as an editable Word document. Add ?transcript=1 to include the transcript. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  if (!can(u, "meetings.use")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const m = isUuid(id) ? await loadMeeting(u, id) : null;
  if (!m?.minutes) return new NextResponse("Not found", { status: 404 });
  const x = JSON.parse(m.minutes) as Minutes;
  const withTranscript = req.nextUrl.searchParams.get("transcript") === "1";
  const buf = await buildDocx({
    title: `Minutes: ${m.title}`,
    subtitle: `${fmtDay(m.held_on, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${MEETING_KINDS[m.kind as keyof typeof MEETING_KINDS]}${m.matter_number ? ` · ${m.matter_number} ${m.matter_title}` : ""}`,
    blocks: [
      { type: "kv", rows: [["Present", x.attendees.join(", ") || m.participants || "—"], ["Status", x.reviewed_by ? `Checked by ${x.reviewed_by}` : "AI draft, not yet checked"]] },
      { type: "heading", text: "Summary" }, { type: "para", text: x.summary },
      { type: "heading", text: "Decisions" }, { type: "bullets", items: x.decisions },
      { type: "heading", text: "Key points" }, { type: "bullets", items: x.key_points },
      { type: "heading", text: "Action items" },
      x.action_items.length ? { type: "table", head: ["Action", "Owner", "Due"], rows: x.action_items.map((a) => [a.task, a.owner || "—", a.due_date ? fmtDay(a.due_date) : "—"]) } : { type: "para", text: "None.", muted: true },
      { type: "heading", text: "Deadlines" }, { type: "bullets", items: x.deadlines.map((d) => `${d.what}${d.date ? `: ${fmtDay(d.date)}` : ""}`) },
      { type: "heading", text: "Open questions" }, { type: "bullets", items: x.open_questions },
      { type: "heading", text: "Risks" }, { type: "bullets", items: x.risks },
      ...(withTranscript && m.transcript ? [{ type: "heading" as const, text: "Transcript" }, { type: "para" as const, text: m.transcript }] : []),
    ],
  });
  await audit({ userId: u.id, actor: u.email, action: "meeting.exported", entityType: "meeting", entityId: m.id, matterId: m.matter_id, detail: { transcript: withTranscript } });
  return new NextResponse(new Uint8Array(buf), { headers: docxResponseHeaders(`Minutes ${m.title} ${m.held_on}.docx`) });
}
