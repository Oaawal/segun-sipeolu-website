import "server-only";
import { one, q } from "./db";
import { audit } from "./audit";
import { getFile } from "./storage";
import { transcribeAudio } from "./transcribe";
import { generateMinutes, minutesEnabled, MINUTES_MODEL, MinutesRefused } from "./minutes";
import { MEETING_KINDS } from "./vocab";

/** Transcribe a stored recording, then generate minutes. Runs after the upload response is sent. */
export async function processRecording(meetingId: string, documentId: string, actor: { id: string; email: string }) {
  try {
    const d = await one<{ storage_key: string; sha256: string; mime_type: string | null }>("SELECT storage_key, sha256, mime_type FROM documents WHERE id = $1", [documentId]);
    if (!d) throw new Error("Recording not found");
    const audio = await getFile(d.storage_key, d.sha256);
    const transcript = await transcribeAudio(audio, d.mime_type || "audio/webm");
    await q("UPDATE meetings SET transcript = $2, transcript_source = 'recording', status = 'transcribed', error = NULL, updated_at = now() WHERE id = $1", [meetingId, transcript]);
    await audit({ userId: actor.id, actor: actor.email, action: "meeting.transcribed", entityType: "meeting", entityId: meetingId, detail: { characters: transcript.length }, ip: null });
    if (minutesEnabled()) await summariseMeeting(meetingId, actor);
  } catch (err) {
    console.error("[portal] transcription failed:", err);
    await q("UPDATE meetings SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [meetingId, String((err as Error).message).slice(0, 500)]);
  }
}

export async function summariseMeeting(meetingId: string, actor: { id: string; email: string }) {
  const m = await one<{ title: string; held_on: string; kind: keyof typeof MEETING_KINDS; participants: string | null; transcript: string | null; matter: string | null }>(
    `SELECT mt.title, mt.held_on, mt.kind, mt.participants, mt.transcript, CASE WHEN m.id IS NULL THEN NULL ELSE m.number || ' ' || m.title END AS matter
     FROM meetings mt LEFT JOIN matters m ON m.id = mt.matter_id WHERE mt.id = $1`,
    [meetingId],
  );
  if (!m?.transcript) return;
  await q("UPDATE meetings SET status = 'summarising', error = NULL, updated_at = now() WHERE id = $1", [meetingId]);
  try {
    const minutes = await generateMinutes({ transcript: m.transcript, title: m.title, heldOn: m.held_on, kind: MEETING_KINDS[m.kind], participants: m.participants, matter: m.matter });
    await q("UPDATE meetings SET minutes = $2, minutes_model = $3, status = 'ready', updated_at = now() WHERE id = $1", [meetingId, JSON.stringify(minutes), MINUTES_MODEL]);
    await audit({ userId: actor.id, actor: actor.email, action: "meeting.minutes_generated", entityType: "meeting", entityId: meetingId, detail: { model: MINUTES_MODEL, actions: minutes.action_items.length }, ip: null });
  } catch (err) {
    console.error("[portal] minutes failed:", err);
    const msg = err instanceof MinutesRefused ? err.message : `Minutes could not be generated: ${String((err as Error).message).slice(0, 300)}`;
    await q("UPDATE meetings SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [meetingId, msg]);
  }
}
