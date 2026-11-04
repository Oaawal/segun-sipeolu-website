import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { listService, listTasks, loadMatter, matterHearings, matterTeam } from "@/lib/portal/data";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { buildDocx, docxResponseHeaders } from "@/lib/portal/word-export";
import { fmtDay, fmtDateTime, isUuid } from "@/lib/portal/format";
import { HEARING_STATUS, MATTER_STATUS, MATTER_TYPES, PARTY_ROLES } from "@/lib/portal/vocab";

export const runtime = "nodejs";

/** Matter summary as an editable Word document. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const m = await loadMatter(u, id, { log: false });
  if (!m || m === "denied") return new NextResponse("Not found", { status: 404 });
  const [team, hearings, tasks, service, parties, notes] = await Promise.all([
    matterTeam(m.id), matterHearings(m.id), listTasks(u, { view: "open", matterId: m.id }), listService(u, { matterId: m.id }),
    q<{ name: string; role: string }>("SELECT name, role FROM parties WHERE matter_id = $1 ORDER BY created_at", [m.id]),
    q<{ body: string; created_at: string; kind: string; full_name: string | null }>("SELECT n.body, n.created_at, n.kind, u.full_name FROM matter_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.matter_id = $1 AND n.kind != 'system' ORDER BY n.created_at DESC LIMIT 20", [m.id]),
  ]);
  const buf = await buildDocx({
    title: m.title,
    subtitle: `${m.number} · Matter summary as at ${fmtDay(new Date().toISOString())}`,
    blocks: [
      { type: "kv", rows: [["Client", m.client_name], ["Type", MATTER_TYPES[m.matter_type as keyof typeof MATTER_TYPES]], ["Practice area", m.practice_area], ["Status", MATTER_STATUS[m.status as keyof typeof MATTER_STATUS]], ["Responsible partner", m.partner_name || "—"], ["Court", m.court || "—"], ["Suit number", m.suit_number || "—"], ["Judge", m.judge || "—"], ["Opened", fmtDay(m.opened_on)], ["Team", team.map((t) => t.full_name).join(", ")]] },
      ...(m.description ? [{ type: "heading" as const, text: "Instructions" }, { type: "para" as const, text: m.description }] : []),
      { type: "heading", text: "Parties" },
      { type: "bullets", items: [`${m.client_name}: our client`, ...parties.map((p) => `${p.name}: ${PARTY_ROLES[p.role as keyof typeof PARTY_ROLES] || p.role}`)] },
      { type: "heading", text: "Court history" },
      hearings.length ? { type: "table", head: ["Date", "Business", "Result", "Notes"], rows: [...hearings].reverse().map((h) => [fmtDay(h.sitting_on), h.business, HEARING_STATUS[h.status as keyof typeof HEARING_STATUS], h.outcome || ""]) } : { type: "para", text: "No court dates.", muted: true },
      { type: "heading", text: "Open tasks and deadlines" },
      { type: "bullets", items: tasks.map((t) => `${t.title}${t.due_on ? ` (due ${fmtDay(t.due_on)})` : ""}${t.assignee_name ? `: ${t.assignee_name}` : ""}`) },
      { type: "heading", text: "Service register" },
      service.length ? { type: "table", head: ["No.", "Direction", "Document", "Date", "Response due"], rows: service.map((s) => [s.number, s.direction === "in" ? "Served on us" : "We served", s.title, fmtDay(s.served_on), s.response_due ? fmtDay(s.response_due) : "—"]) } : { type: "para", text: "Nothing logged.", muted: true },
      { type: "heading", text: "Recent file notes" },
      ...(notes.length ? notes.flatMap((n) => [{ type: "para" as const, text: `${fmtDateTime(n.created_at)} · ${n.full_name || ""}`, muted: true }, { type: "para" as const, text: n.body }]) : [{ type: "para" as const, text: "No notes.", muted: true }]),
    ],
  });
  await audit({ userId: u.id, actor: u.email, action: "matter.exported", entityType: "matter", entityId: m.id, matterId: m.id, detail: { format: "docx" } });
  return new NextResponse(new Uint8Array(buf), { headers: docxResponseHeaders(`${m.number.replace(/\//g, "-")} summary.docx`) });
}
