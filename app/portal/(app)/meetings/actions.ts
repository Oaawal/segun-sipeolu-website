"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { one, q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { canSeeMatter } from "@/lib/portal/permissions";
import { matterFacts } from "@/lib/portal/guards";
import { loadMeeting } from "@/lib/portal/data";
import { dateField, isUuid, isYmd, oneOf, str, today } from "@/lib/portal/format";
import { MEETING_KINDS } from "@/lib/portal/vocab";
import { captionsToText } from "@/lib/portal/transcribe";
import { minutesEnabled, type Minutes } from "@/lib/portal/minutes";
import { summariseMeeting } from "@/lib/portal/meeting-pipeline";

async function meetingFor(id: unknown) {
  const u = await requirePermission("meetings.use");
  const m = isUuid(id) ? await loadMeeting(u, id) : null;
  if (!m) redirect("/portal/meetings?msg=denied");
  return { u, m };
}

export async function createMeeting(fd: FormData) {
  const u = await requirePermission("meetings.use");
  const title = str(fd, "title", 200);
  if (!title) redirect("/portal/meetings/new?msg=invalid");
  let matterId: string | null = null;
  if (fd.get("matter_id")) {
    const m = await matterFacts(u, fd.get("matter_id"));
    if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) redirect("/portal/meetings/new?msg=denied");
    matterId = m.id;
  }
  const id = crypto.randomUUID();
  await tx(async (t) => {
    await t.query(
      "INSERT INTO meetings (id, matter_id, title, held_on, kind, participants, consent_confirmed, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [id, matterId, title, dateField(fd, "held_on") || today(), oneOf(fd, "kind", MEETING_KINDS, "client"), str(fd, "participants", 1000), fd.get("consent") === "1", u.id],
    );
    await audit({ userId: u.id, actor: u.email, action: "meeting.created", entityType: "meeting", entityId: id, matterId }, t);
  });
  redirect(`/portal/meetings/${id}`);
}

export async function confirmConsent(fd: FormData) {
  const { u, m } = await meetingFor(fd.get("id"));
  await q("UPDATE meetings SET consent_confirmed = TRUE, updated_at = now() WHERE id = $1", [m.id]);
  await audit({ userId: u.id, actor: u.email, action: "meeting.consent_confirmed", entityType: "meeting", entityId: m.id, matterId: m.matter_id });
  redirect(`/portal/meetings/${m.id}`);
}

/** Paste a transcript, or upload a caption/text file exported from Zoom, Teams or Google Meet. */
export async function saveTranscript(fd: FormData) {
  const { u, m } = await meetingFor(fd.get("id"));
  let text = String(fd.get("transcript") || "").trim();
  const file = fd.get("file") as File | null;
  const fromFile = !text && !!file && file.size > 0;
  if (fromFile) {
    if (file!.size > 5 * 1024 * 1024 || !/\.(vtt|srt|txt)$/i.test(file!.name)) redirect(`/portal/meetings/${m.id}?msg=upload_failed`);
    const raw = await file!.text();
    text = /\.(vtt|srt)$/i.test(file!.name) ? captionsToText(raw) : raw.trim();
  }
  if (!text) redirect(`/portal/meetings/${m.id}?msg=invalid`);
  await q("UPDATE meetings SET transcript = $2, transcript_source = $3, status = 'transcribed', error = NULL, updated_at = now() WHERE id = $1", [m.id, text.slice(0, 400_000), fromFile ? "upload" : "paste"]);
  await audit({ userId: u.id, actor: u.email, action: "meeting.transcript_added", entityType: "meeting", entityId: m.id, matterId: m.matter_id, detail: { characters: text.length } });
  if (minutesEnabled()) {
    await q("UPDATE meetings SET status = 'summarising' WHERE id = $1", [m.id]);
    after(() => summariseMeeting(m.id, { id: u.id, email: u.email }));
    redirect(`/portal/meetings/${m.id}?msg=processing`);
  }
  redirect(`/portal/meetings/${m.id}?msg=saved`);
}

export async function regenerateMinutes(fd: FormData) {
  const { u, m } = await meetingFor(fd.get("id"));
  if (!m.transcript || !minutesEnabled()) redirect(`/portal/meetings/${m.id}?msg=invalid`);
  await q("UPDATE meetings SET status = 'summarising', error = NULL WHERE id = $1", [m.id]);
  after(() => summariseMeeting(m.id, { id: u.id, email: u.email }));
  redirect(`/portal/meetings/${m.id}?msg=processing`);
}

/** Replace "Speaker 1" etc. with real names throughout the transcript and minutes. */
export async function renameSpeakers(fd: FormData) {
  const { u, m } = await meetingFor(fd.get("id"));
  let transcript = m.transcript || "";
  let minutes = m.minutes || "";
  const changed: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const name = String(fd.get(`speaker_${i}`) || "").trim().slice(0, 80).replace(/[\r\n"\\]/g, " ");
    if (!name) continue;
    const re = new RegExp(`\\bSpeaker ${i}\\b`, "g");
    transcript = transcript.replace(re, name);
    minutes = minutes.replace(re, name);
    changed.push(String(i));
  }
  if (changed.length) {
    await q("UPDATE meetings SET transcript = $2, minutes = $3, updated_at = now() WHERE id = $1", [m.id, transcript, minutes || null]);
    await audit({ userId: u.id, actor: u.email, action: "meeting.speakers_named", entityType: "meeting", entityId: m.id, matterId: m.matter_id, detail: { speakers: changed } });
  }
  redirect(`/portal/meetings/${m.id}?msg=speakers`);
}

/** Turn ticked action items into tasks, assigned to the chosen people. */
export async function createTasksFromMinutes(fd: FormData) {
  const { u, m } = await meetingFor(fd.get("id"));
  if (!m.minutes) redirect(`/portal/meetings/${m.id}`);
  const minutes = JSON.parse(m.minutes) as Minutes;
  const picked = fd.getAll("item").map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < minutes.action_items.length);
  if (!picked.length) redirect(`/portal/meetings/${m.id}?msg=invalid`);
  await tx(async (t) => {
    for (const i of picked) {
      const a = minutes.action_items[i];
      const who = String(fd.get(`owner_${i}`) || "");
      const assignee = isUuid(who) && (await t.query("SELECT 1 FROM users WHERE id = $1 AND active", [who])).rows.length ? who : u.id;
      const due = String(fd.get(`due_${i}`) || a.due_date || "");
      await t.query(
        "INSERT INTO tasks (id, title, detail, matter_id, assigned_to, due_on, kind, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,'task',$7,$8,$9)",
        [crypto.randomUUID(), a.task.slice(0, 250), `From the minutes of "${m.title}"${a.owner ? ` (owner named: ${a.owner})` : ""}`, m.matter_id, assignee, isYmd(due) ? due : null, a.priority, `meeting:${m.id}`, u.id],
      );
    }
    await audit({ userId: u.id, actor: u.email, action: "meeting.tasks_created", entityType: "meeting", entityId: m.id, matterId: m.matter_id, detail: { count: picked.length } }, t);
  });
  redirect(`/portal/meetings/${m.id}?msg=tasks_created`);
}

/** A person confirms they have checked the AI minutes against the transcript. */
export async function markReviewed(fd: FormData) {
  const { u, m } = await meetingFor(fd.get("id"));
  if (!m.minutes) redirect(`/portal/meetings/${m.id}`);
  const minutes = JSON.parse(m.minutes) as Minutes;
  const summary = str(fd, "summary", 6000);
  const next = { ...minutes, ...(summary ? { summary } : {}), reviewed_by: u.full_name, reviewed_at: new Date().toISOString() };
  await q("UPDATE meetings SET minutes = $2, updated_at = now() WHERE id = $1", [m.id, JSON.stringify(next)]);
  if (m.matter_id) {
    const exists = await one("SELECT 1 FROM matter_notes WHERE matter_id = $1 AND body LIKE $2", [m.matter_id, `Minutes reviewed: ${m.title.replace(/[%_\\]/g, (c) => "\\" + c)}%`]);
    if (!exists) await q("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'attendance',$3,$4)", [crypto.randomUUID(), m.matter_id, `Minutes reviewed: ${m.title}\n\n${next.summary}`, u.id]);
  }
  await audit({ userId: u.id, actor: u.email, action: "meeting.minutes_reviewed", entityType: "meeting", entityId: m.id, matterId: m.matter_id });
  redirect(`/portal/meetings/${m.id}?msg=saved`);
}
