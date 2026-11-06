import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, FileDown, ListChecks, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { loadMeeting, staffList } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { fmtDateTime, fmtDay, isUuid } from "@/lib/portal/format";
import { MEETING_KINDS, MEETING_STATUS } from "@/lib/portal/vocab";
import { transcriptionEnabled } from "@/lib/portal/transcribe";
import { minutesEnabled, type Minutes } from "@/lib/portal/minutes";
import { Badge, Card, Field, Flash, Note, PageHeader, TextArea, btn, inputCls } from "@/components/portal/ui";
import { Recorder } from "@/components/portal/Recorder";
import { FileField } from "@/components/portal/FileField";
import { s3Enabled } from "@/lib/portal/storage";
import { confirmConsent, createTasksFromMinutes, markReviewed, regenerateMinutes, renameSpeakers, saveTranscript } from "../actions";

export const metadata = { title: "Meeting" };

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-stone-400">{empty}</p>;
  return <ul className="list-disc space-y-1.5 pl-5 text-sm text-stone-700 marker:text-gold">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const u = await requirePermission("meetings.use");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const m = await loadMeeting(u, id);
  if (!m) notFound();
  await audit({ userId: u.id, actor: u.email, action: "meeting.viewed", entityType: "meeting", entityId: m.id, matterId: m.matter_id });
  const staff = await staffList();
  const minutes: Minutes | null = m.minutes ? JSON.parse(m.minutes) : null;
  const busy = m.status === "transcribing" || m.status === "summarising";
  const speakers = [...new Set([...(m.transcript || "").matchAll(/\bSpeaker (\d{1,2})\b/g)].map((x) => Number(x[1])))].sort((a, b) => a - b).slice(0, 12);
  const [label, tone] = MEETING_STATUS[m.status] || ["", "grey"];
  // Suggest a team member for each action item from the owner named in the minutes
  const guess = (owner: string | null) => {
    if (!owner) return u.id;
    const o = owner.toLowerCase();
    return staff.find((s) => s.full_name.toLowerCase().split(/\s+/).some((w) => w.length > 2 && o.includes(w)))?.id || u.id;
  };

  return (
    <>
      {busy && <meta httpEquiv="refresh" content="6" />}
      <PageHeader
        back={{ href: "/portal/meetings", label: "Meetings" }}
        title={m.title}
        sub={<span className="flex flex-wrap items-center gap-2">{fmtDay(m.held_on)} · {MEETING_KINDS[m.kind as keyof typeof MEETING_KINDS]}{m.matter_id && <> · <Link href={`/portal/matters/${m.matter_id}?tab=meetings`} className="font-semibold text-maroon hover:underline">{m.matter_number}</Link></>} <Badge tone={tone}>{label}</Badge></span>}
        actions={minutes && <a href={`/portal/api/export/meeting/${m.id}`} className={btn.ghost}><FileDown className="h-4 w-4" />Word (.docx)</a>}
      />
      <Flash msg={sp.msg} />

      {busy && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-5 py-4 text-sm text-stone-800">
          <Loader2 className="h-5 w-5 animate-spin text-maroon" />
          {m.status === "transcribing" ? "Transcribing the recording and identifying speakers. A one-hour meeting usually takes under two minutes." : "Writing the minutes from the transcript…"} This page refreshes by itself.
        </div>
      )}
      {m.status === "failed" && m.error && <div className="mb-6"><Note tone="danger">{m.error}</Note></div>}

      {!m.consent_confirmed && (
        <Card className="mb-6">
          <Note tone="warn">Before recording, everyone present must be told the meeting is being recorded and transcribed, and agree.</Note>
          <form action={confirmConsent} className="mt-4"><input type="hidden" name="id" value={m.id} /><button className={btn.primary}>Everyone has agreed to recording</button></form>
        </Card>
      )}

      {!m.transcript && !busy && (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-stone-500">Record or upload audio</h2>
            {!transcriptionEnabled() ? <Note tone="info">Audio transcription is not switched on yet. The administrator adds a speech-to-text key (DEEPGRAM_API_KEY) on the server. Meanwhile, paste or upload a transcript.</Note>
              : m.consent_confirmed ? <Recorder meetingId={m.id} direct={s3Enabled()} /> : <Note tone="lock">Confirm consent above to enable recording.</Note>}
          </div>
          <Card title="Or add a transcript">
            <form action={saveTranscript} className="space-y-3" encType="multipart/form-data">
              <input type="hidden" name="id" value={m.id} />
              <TextArea label="Paste the transcript" name="transcript" rows={6} placeholder="Paste from Zoom, Teams, Google Meet, Otter or your own notes" />
              <label className="block text-sm"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">…or upload a caption or text file (.vtt, .srt, .txt)</span><FileField name="file" accept=".vtt,.srt,.txt" direct={s3Enabled()} className={inputCls} /></label>
              <button className={btn.primary}>{minutesEnabled() ? <><Sparkles className="h-4 w-4" />Save and write minutes</> : "Save transcript"}</button>
            </form>
          </Card>
        </div>
      )}

      {minutes && (
        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card title="Summary" action={minutes.reviewed_by ? <Badge tone="green"><CheckCircle2 className="h-3 w-3" />Checked by {minutes.reviewed_by}</Badge> : <Badge tone="amber">AI draft: not yet checked</Badge>}>
              <p className="whitespace-pre-line leading-relaxed text-stone-800">{minutes.summary}</p>
              {minutes.attendees.length > 0 && <p className="mt-3 text-sm text-stone-500">Present: {minutes.attendees.join(", ")}</p>}
            </Card>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card title="Decisions"><List items={minutes.decisions} empty="No decisions recorded." /></Card>
              <Card title="Key points"><List items={minutes.key_points} empty="None." /></Card>
            </div>
            <Card title={`Action items (${minutes.action_items.length})`}>
              {minutes.action_items.length === 0 ? <p className="text-sm text-stone-400">No action items.</p> : (
                <form action={createTasksFromMinutes} className="space-y-3">
                  <input type="hidden" name="id" value={m.id} />
                  {minutes.action_items.map((a, i) => (
                    <div key={i} className="rounded-xl border border-stone-200 p-3">
                      <label className="flex items-start gap-2.5 text-sm font-medium text-stone-800">
                        <input type="checkbox" name="item" value={i} defaultChecked className="mt-0.5 h-4 w-4 accent-maroon" />
                        <span>{a.task} {a.priority === "high" && <Badge tone="red">High</Badge>}<span className="block text-xs font-normal text-stone-500">Named owner: {a.owner || "not stated"}</span></span>
                      </label>
                      <div className="mt-2 grid grid-cols-1 gap-2 pl-6 sm:grid-cols-2">
                        <select name={`owner_${i}`} defaultValue={guess(a.owner)} className={inputCls} aria-label="Assign to">{staff.filter((s) => s.role !== "front_desk").map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
                        <input type="date" name={`due_${i}`} defaultValue={a.due_date || ""} className={inputCls} aria-label="Due date" />
                      </div>
                    </div>
                  ))}
                  <button className={btn.primary}><ListChecks className="h-4 w-4" />Create tasks from ticked items</button>
                </form>
              )}
            </Card>
            {minutes.follow_up_email && (
              <Card title="Draft follow-up email to the client">
                <textarea readOnly rows={10} defaultValue={minutes.follow_up_email} className={`${inputCls} font-[inherit] leading-relaxed`} />
                <p className="mt-2 text-xs text-stone-500">Check and adapt before sending from your own email.</p>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <Card title="Deadlines mentioned">
              {minutes.deadlines.length === 0 ? <p className="text-sm text-stone-400">None.</p> : (
                <ul className="space-y-2 text-sm">{minutes.deadlines.map((d, i) => <li key={i} className="flex justify-between gap-3"><span>{d.what}</span><Badge tone={d.date ? "red" : "grey"}>{d.date ? fmtDay(d.date) : "No date"}</Badge></li>)}</ul>
              )}
            </Card>
            <Card title="Open questions"><List items={minutes.open_questions} empty="None." /></Card>
            <Card title="Risks"><List items={minutes.risks} empty="None noted." /></Card>
            <Card title="Check and approve">
              <form action={markReviewed} className="space-y-3">
                <input type="hidden" name="id" value={m.id} />
                <TextArea label="Corrected summary (optional)" name="summary" rows={4} defaultValue={minutes.summary} />
                <button className={btn.primary}><CheckCircle2 className="h-4 w-4" />I have checked these minutes</button>
                <p className="text-xs text-stone-500">Approved minutes are added to the matter&apos;s notes as an attendance note.{minutes.reviewed_at ? ` Last approved ${fmtDateTime(minutes.reviewed_at)}.` : ""}</p>
              </form>
              {minutesEnabled() && m.transcript && (
                <form action={regenerateMinutes} className="mt-4 border-t border-stone-100 pt-4"><input type="hidden" name="id" value={m.id} /><button className={btn.small}><RefreshCw className="h-3.5 w-3.5" />Write the minutes again</button></form>
              )}
            </Card>
          </div>
        </div>
      )}

      {m.transcript && !minutes && !busy && minutesEnabled() && (
        <Card className="mb-6"><form action={regenerateMinutes} className="flex flex-wrap items-center justify-between gap-3"><input type="hidden" name="id" value={m.id} /><span className="text-sm text-stone-700">The transcript is ready.</span><button className={btn.primary}><Sparkles className="h-4 w-4" />Write the minutes</button></form></Card>
      )}
      {m.transcript && !minutesEnabled() && <div className="mb-6"><Note tone="info">AI minutes are not switched on yet: the administrator adds an Anthropic API key (ANTHROPIC_API_KEY) on the server.</Note></div>}

      {m.transcript && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card title="Transcript">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-maroon">Show the full transcript ({m.transcript.split(/\s+/).length.toLocaleString()} words, from {m.transcript_source})</summary>
              <div className="mt-4 max-h-[70vh] overflow-y-auto whitespace-pre-line rounded-lg bg-cream/60 p-4 text-sm leading-relaxed text-stone-800">{m.transcript}</div>
            </details>
          </Card>
          {speakers.length > 0 && (
            <Card title="Name the speakers">
              <form action={renameSpeakers} className="space-y-3">
                <input type="hidden" name="id" value={m.id} />
                {speakers.map((n) => <Field key={n} label={`Speaker ${n}`} name={`speaker_${n}`} placeholder="e.g. Barr. Sipeolu" />)}
                <button className={btn.ghost}>Replace names everywhere</button>
              </form>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
