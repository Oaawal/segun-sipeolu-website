import { requirePermission } from "@/lib/portal/auth";
import { pickableMatters } from "@/lib/portal/data";
import { today } from "@/lib/portal/format";
import { MEETING_KINDS } from "@/lib/portal/vocab";
import { Card, Check, Field, Flash, Note, PageHeader, Select, btn } from "@/components/portal/ui";
import { createMeeting } from "../actions";

export const metadata = { title: "New meeting" };

export default async function NewMeeting({ searchParams }: { searchParams: Promise<{ matter?: string; msg?: string }> }) {
  const u = await requirePermission("meetings.use");
  const sp = await searchParams;
  const matters = await pickableMatters(u);
  return (
    <>
      <PageHeader title="New meeting" back={{ href: "/portal/meetings", label: "Meetings" }} />
      <Flash msg={sp.msg} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <form action={createMeeting} className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" name="title" required className="sm:col-span-2" placeholder="e.g. Strategy meeting with Mr Adeyemi" />
            <Field label="Date" name="held_on" type="date" defaultValue={today()} />
            <Select label="Type" name="kind" options={MEETING_KINDS} defaultValue="client" />
            <Select label="Matter" name="matter_id" options={matters.map((m) => [m.id, `${m.number} · ${m.title}`])} blank="Not linked to a matter" defaultValue={sp.matter || ""} className="sm:col-span-2" />
            <Field label="Who is attending" name="participants" className="sm:col-span-2" placeholder="e.g. Barr. Sipeolu, Mr Tunde Adeyemi (client), Mrs Bisi Adeyemi" hint="Helps the minutes use the right names." />
            <div className="sm:col-span-2 rounded-xl border border-gold/40 bg-gold/10 p-4">
              <Check name="consent" label={<>Everyone in the meeting has been told it is being recorded and transcribed, and agreed. <span className="text-stone-500">(Required before recording, under the NDPA and professional confidentiality.)</span></>} />
            </div>
            <div className="sm:col-span-2"><button className={btn.primary}>Create meeting</button></div>
          </form>
        </Card>
        <div className="space-y-4">
          <Note tone="info">Three ways to get a transcript: record in the browser, upload a recording, or paste or upload a transcript from Zoom, Teams or Google Meet.</Note>
          <Note tone="lock">Recordings are encrypted and stored with the matter. AI-drafted minutes must be checked against the transcript by a lawyer before anyone relies on them.</Note>
        </div>
      </div>
    </>
  );
}
