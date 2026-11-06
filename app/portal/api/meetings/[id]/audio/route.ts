import { NextResponse, after, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { loadMeeting } from "@/lib/portal/data";
import { tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { putFile, uploadProblem, cleanName, mimeFor, ext } from "@/lib/portal/storage";
import { transcriptionEnabled } from "@/lib/portal/transcribe";
import { processRecording } from "@/lib/portal/meeting-pipeline";
import { isUuid } from "@/lib/portal/format";
import { readUploads } from "@/lib/portal/uploads";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Receive a meeting recording (recorded in the browser or uploaded), store it
 * encrypted with the meeting, and start transcription after responding.
 * Answers JSON for the in-browser recorder and redirects for plain forms.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return new NextResponse("Forbidden", { status: 403 });
  const u = await currentUser();
  if (!u || !u.mfa_passed || !can(u, "meetings.use")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const m = await loadMeeting(u, id);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const wantsJson = (req.headers.get("accept") || "").includes("application/json");
  const reply = (msg: string, status = 200) =>
    wantsJson
      ? NextResponse.json(status === 200 ? { ok: true, msg } : { error: msg }, { status })
      : NextResponse.redirect(new URL(`/portal/meetings/${id}?msg=${status === 200 ? msg : "upload_failed"}`, req.url), 303);

  if (!m.consent_confirmed) return reply("Confirm that everyone was told the meeting is recorded.", 400);
  if (!transcriptionEnabled()) return reply("Transcription is not set up on this server yet (DEEPGRAM_API_KEY).", 400);
  const fd = await req.formData();
  const file = (await readUploads(u.id, fd, "audio"))[0] ?? null;
  const problem = uploadProblem(file, { audioOnly: true });
  if (problem) return reply(problem, 400);
  const f = file!;
  const name = cleanName(f.name || `recording.${ext(f.name) || "webm"}`);
  const stored = await putFile(Buffer.from(await f.arrayBuffer()));
  const docId = crypto.randomUUID();
  await tx(async (t) => {
    await t.query(
      `INSERT INTO documents (id, owner_type, owner_id, matter_id, series_id, version, title, category, file_name, mime_type, size_bytes, sha256, storage_key, privileged, uploaded_by)
       VALUES ($1,'meeting',$2,$3,$1,1,$4,'other',$5,$6,$7,$8,$9,TRUE,$10)`,
      [docId, id, m.matter_id, `Recording: ${m.title}`, name, f.type || mimeFor(name), f.size, stored.sha256, stored.key, u.id],
    );
    await t.query("UPDATE meetings SET audio_document_id = $2, status = 'transcribing', error = NULL, updated_at = now() WHERE id = $1", [id, docId]);
    await audit({ userId: u.id, actor: u.email, action: "meeting.recording_added", entityType: "meeting", entityId: id, matterId: m.matter_id, detail: { size: f.size, sha256: stored.sha256 } }, t);
  });
  after(() => processRecording(id, docId, { id: u.id, email: u.email }));
  return reply("processing");
}
