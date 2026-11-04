import { CalendarPlus, Gavel } from "lucide-react";
import type { HearingRow } from "@/lib/portal/data";
import { COURTS, HEARING_BUSINESS, HEARING_STATUS } from "@/lib/portal/vocab";
import { addDays, daysUntil, dueLabel, fmtDay, today } from "@/lib/portal/format";
import { addHearing, recordOutcome } from "@/app/portal/(app)/diary/actions";
import { Badge, Check, Field, Select, TextArea, btn, type Tone } from "./ui";

type Staff = { id: string; full_name: string; role: string }[];

const STATUS_TONE: Record<string, Tone> = { scheduled: "blue", held: "green", adjourned: "gold", vacated: "grey", concluded: "maroon" };

export function HearingForm({ matter, staff, back }: { matter: { id: string; court: string | null; judge: string | null; suit_number: string | null }; staff: Staff; back: string }) {
  return (
    <form action={addHearing} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="matter_id" value={matter.id} />
      <input type="hidden" name="back" value={back} />
      <Field label="Date" name="sitting_on" type="date" required defaultValue={addDays(today(), 7)} />
      <Field label="Time" name="sitting_time" type="time" defaultValue="09:00" />
      <Field label="Court" name="court" required list="courts-list" defaultValue={matter.court || ""} className="sm:col-span-2" />
      <datalist id="courts-list">{COURTS.map((c) => <option key={c} value={c} />)}</datalist>
      <Field label="Business" name="business" required list="business-list" placeholder="e.g. Hearing of motion" />
      <datalist id="business-list">{HEARING_BUSINESS.map((c) => <option key={c} value={c} />)}</datalist>
      <Select label="Counsel to appear" name="appearing" options={staff.filter((s) => s.role !== "front_desk").map((s) => [s.id, s.full_name])} blank="Not decided" />
      <Field label="Judge" name="judge" defaultValue={matter.judge || ""} />
      <Field label="Suit number" name="suit_number" defaultValue={matter.suit_number || ""} />
      <div className="sm:col-span-2"><button className={btn.primary}><CalendarPlus className="h-4 w-4" />Add to diary</button></div>
    </form>
  );
}

export function OutcomeForm({ h, staff, back }: { h: HearingRow; staff: Staff; back: string }) {
  return (
    <details className="group mt-3 rounded-xl border border-stone-200 bg-cream/40 open:bg-white">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-semibold text-maroon [&::-webkit-details-marker]:hidden">Record what happened →</summary>
      <form action={recordOutcome} className="grid gap-4 border-t border-stone-200 p-4 sm:grid-cols-2">
        <input type="hidden" name="hearing_id" value={h.id} />
        <input type="hidden" name="back" value={back} />
        <Select label="Result" name="status" options={Object.entries(HEARING_STATUS).filter(([k]) => k !== "scheduled")} defaultValue="adjourned" />
        <div />
        <TextArea label="What happened" name="outcome" rows={3} className="sm:col-span-2" placeholder="e.g. Motion moved and argued. Ruling reserved. Defence counsel absent; costs of ₦20,000 awarded." />
        <div className="sm:col-span-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Next date (if adjourned)</div>
        <Field label="Adjourned to" name="next_date" type="date" />
        <Field label="Time" name="next_time" type="time" defaultValue={h.sitting_time || "09:00"} />
        <Field label="For" name="next_business" list="business-list-2" placeholder="e.g. Ruling" />
        <datalist id="business-list-2">{HEARING_BUSINESS.map((c) => <option key={c} value={c} />)}</datalist>
        <Select label="Counsel to appear" name="next_appearing" options={staff.filter((s) => s.role !== "front_desk").map((s) => [s.id, s.full_name])} blank="Same as before" />
        <div className="sm:col-span-2"><Check name="prep_task" defaultChecked label="Add a preparation deadline 3 days before the next date" /></div>
        <div className="sm:col-span-2"><button className={btn.primary}><Gavel className="h-4 w-4" />Save result</button></div>
      </form>
    </details>
  );
}

export function HearingCard({ h, staff, back, canEdit, showMatter, hideOutcome }: { h: HearingRow; staff: Staff; back: string; canEdit: boolean; showMatter?: boolean; hideOutcome?: boolean }) {
  const d = daysUntil(h.sitting_on);
  return (
    <div className="border-t border-stone-100 px-5 py-4 first:border-t-0">
      <div className="flex items-start gap-4">
        <div className="w-16 flex-none rounded-xl bg-maroon-dark py-2 text-center text-white">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gold">{fmtDay(h.sitting_on, { month: "short" }).split(" ")[0]}</div>
          <div className="font-serif text-2xl font-semibold leading-none">{fmtDay(h.sitting_on, { day: "numeric" }).split(" ")[0]}</div>
          <div className="mt-0.5 text-[10px] text-white/60">{h.sitting_time || ""}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-stone-800">{h.business}</span>
            <Badge tone={STATUS_TONE[h.status]}>{HEARING_STATUS[h.status as keyof typeof HEARING_STATUS]}</Badge>
            {h.status === "scheduled" && d !== null && d >= 0 && d <= 7 && <Badge tone={d <= 1 ? "red" : "amber"}>{dueLabel(h.sitting_on)}</Badge>}
            {h.status === "scheduled" && d !== null && d < 0 && <Badge tone="red">Result not recorded</Badge>}
          </div>
          {showMatter && (hideOutcome
            ? <div className="mt-0.5 truncate text-sm font-medium text-stone-700">{h.matter_title} · {h.matter_number}</div>
            : <a href={`/portal/matters/${h.matter_id}?tab=diary`} className="mt-0.5 block truncate text-sm font-medium text-maroon hover:underline">{h.matter_title} · {h.matter_number}</a>)}
          <div className="mt-0.5 text-sm text-stone-500">{h.court}{h.judge ? ` · ${h.judge}` : ""}{h.suit_number ? ` · ${h.suit_number}` : ""}</div>
          <div className="mt-0.5 text-sm text-stone-500">Counsel: {h.appearing_name || <span className="font-medium text-amber-700">not assigned</span>}</div>
          {h.outcome && !hideOutcome && <div className="mt-2 whitespace-pre-line rounded-lg bg-cream px-3 py-2 text-sm text-stone-700">{h.outcome}</div>}
          {canEdit && h.status === "scheduled" && <OutcomeForm h={h} staff={staff} back={back} />}
        </div>
      </div>
    </div>
  );
}
