import Link from "next/link";
import { Clock, Play, Receipt, Square, Trash2 } from "lucide-react";
import { Badge, Check, Empty, Field, Row, Select, TextArea, btn } from "./ui";
import { Elapsed } from "./Elapsed";
import { fmtDay, today } from "@/lib/portal/format";
import { EXPENSE_KINDS, hoursLabel, INVOICE_STATUS, naira } from "@/lib/portal/money";
import { addExpense, addTime, deleteExpense, deleteTime, startTimer, stopTimer } from "@/app/portal/(app)/billing/actions";

type MatterOpt = { id: string; number: string; title: string };

function MatterPicker({ matters, fixed }: { matters?: MatterOpt[]; fixed?: string }) {
  if (fixed) return <input type="hidden" name="matter_id" value={fixed} />;
  return <Select label="Matter" name="matter_id" required options={(matters || []).map((m) => [m.id, `${m.number} · ${m.title}`])} blank="Choose a matter" />;
}

export function TimerCard({ timer, matters, fixedMatter, back }: { timer: { matter_id: string; description: string | null; started_at: string; number: string; title: string } | null; matters?: MatterOpt[]; fixedMatter?: string; back: string }) {
  if (timer) {
    return (
      <div className="rounded-2xl bg-gradient-to-r from-maroon-dark to-maroon p-5 text-white">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-gold" /></span>
          <div className="text-xs font-semibold uppercase tracking-wider text-gold">Timer running</div>
        </div>
        <div className="mt-2 font-serif text-3xl tabular-nums"><Elapsed since={timer.started_at} /></div>
        <div className="mt-1 truncate text-sm text-white/75">{timer.number} · {timer.title}</div>
        <form action={stopTimer} className="mt-4 space-y-3">
          <input type="hidden" name="back" value={back} />
          <input name="description" defaultValue={timer.description || ""} placeholder="What did you do?" className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/50 focus:border-gold focus:outline-none" />
          <div className="flex flex-wrap gap-2">
            <button className={btn.gold}><Square className="h-4 w-4" />Stop and record</button>
            <button name="discard" value="1" className="rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:text-white">Discard</button>
          </div>
        </form>
      </div>
    );
  }
  return (
    <form action={startTimer} className="space-y-3">
      <input type="hidden" name="back" value={back} />
      <MatterPicker matters={matters} fixed={fixedMatter} />
      <Field label="Working on" name="description" placeholder="e.g. Drafting statement of defence" />
      <button className={btn.primary}><Play className="h-4 w-4" />Start timer</button>
      <p className="text-xs text-stone-500">Rounded up to 6-minute units when you stop it.</p>
    </form>
  );
}

export function TimeForm({ matters, fixedMatter, back }: { matters?: MatterOpt[]; fixedMatter?: string; back: string }) {
  return (
    <form action={addTime} className="space-y-3">
      <input type="hidden" name="back" value={back} />
      <MatterPicker matters={matters} fixed={fixedMatter} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" name="worked_on" type="date" defaultValue={today()} max={today()} />
        <Field label="Time spent" name="duration" required placeholder="1:30 or 90m" inputMode="text" />
      </div>
      <TextArea label="What you did" name="description" required rows={3} placeholder="e.g. Attended court for mention; matter adjourned to 4 Dec" />
      <Check name="billable" value="0" label="Not billable (internal or written off)" />
      <button className={btn.primary}><Clock className="h-4 w-4" />Record time</button>
    </form>
  );
}

export function ExpenseForm({ matters, fixedMatter, back }: { matters?: MatterOpt[]; fixedMatter?: string; back: string }) {
  return (
    <form action={addExpense} className="space-y-3">
      <input type="hidden" name="back" value={back} />
      <MatterPicker matters={matters} fixed={fixedMatter} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" name="incurred_on" type="date" defaultValue={today()} />
        <Field label="Amount (₦)" name="amount" required inputMode="decimal" placeholder="25,000" />
      </div>
      <Select label="Kind" name="kind" options={EXPENSE_KINDS} defaultValue="filing_fees" />
      <Field label="Description" name="description" required placeholder="e.g. Filing fees, motion on notice" />
      <Check name="billable" value="0" label="Not to be charged to the client" />
      <button className={btn.primary}><Receipt className="h-4 w-4" />Record disbursement</button>
    </form>
  );
}

export function TimeList({ rows, back, me, canManage, showMatter = false }: {
  rows: { id: string; worked_on: string; minutes: number; description: string; rate_kobo: number; billable: boolean; invoice_id: string | null; full_name: string; user_id: string; matter_number?: string; matter_id: string }[];
  back: string; me: string; canManage: boolean; showMatter?: boolean;
}) {
  if (!rows.length) return <Empty icon={<Clock className="h-8 w-8" />} title="No time recorded" text="Record time as you work, or start the timer." />;
  return (
    <>
      {rows.map((r) => (
        <Row key={r.id}>
          <div className="w-14 flex-none text-right font-semibold tabular-nums text-maroon-dark">{hoursLabel(r.minutes)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-stone-800">{r.description}</div>
            <div className="text-xs text-stone-500">
              {fmtDay(r.worked_on)} · {r.full_name}
              {showMatter && r.matter_number ? <> · <Link href={`/portal/matters/${r.matter_id}?tab=billing`} className="hover:text-maroon">{r.matter_number}</Link></> : null}
              {r.billable ? (Number(r.rate_kobo) ? ` · ${naira(Math.round((r.minutes * Number(r.rate_kobo)) / 60))}` : " · no rate set") : ""}
            </div>
          </div>
          {!r.billable && <Badge>Not billable</Badge>}
          {r.invoice_id && <Badge tone="green">Billed</Badge>}
          {!r.invoice_id && (r.user_id === me || canManage) && (
            <form action={deleteTime}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><button aria-label="Delete entry" className="p-1 text-stone-300 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></form>
          )}
        </Row>
      ))}
    </>
  );
}

export function ExpenseList({ rows, back, canManage, me }: { rows: { id: string; incurred_on: string; kind: string; description: string; amount_kobo: number; billable: boolean; invoice_id: string | null; created_by: string; full_name: string | null }[]; back: string; canManage: boolean; me: string }) {
  if (!rows.length) return <Empty icon={<Receipt className="h-8 w-8" />} title="No disbursements" />;
  return (
    <>
      {rows.map((r) => (
        <Row key={r.id}>
          <div className="w-24 flex-none text-right font-semibold tabular-nums text-maroon-dark">{naira(r.amount_kobo)}</div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-stone-800">{r.description}</div>
            <div className="text-xs text-stone-500">{fmtDay(r.incurred_on)} · {EXPENSE_KINDS[r.kind as keyof typeof EXPENSE_KINDS] || r.kind}{r.full_name ? ` · ${r.full_name}` : ""}</div>
          </div>
          {!r.billable && <Badge>Not charged</Badge>}
          {r.invoice_id && <Badge tone="green">Billed</Badge>}
          {!r.invoice_id && (r.created_by === me || canManage) && (
            <form action={deleteExpense}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} /><button aria-label="Delete disbursement" className="p-1 text-stone-300 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></form>
          )}
        </Row>
      ))}
    </>
  );
}

export function InvoiceRows({ rows, showMatter = true }: { rows: { id: string; number: string | null; status: string; total_kobo: number; paid_kobo: number; issued_on: string | null; due_on: string | null; matter_number: string; client_name: string; created_at: string }[]; showMatter?: boolean }) {
  if (!rows.length) return <Empty icon={<Receipt className="h-8 w-8" />} title="No invoices" />;
  return (
    <>
      {rows.map((i) => {
        const overdue = ["issued", "part_paid"].includes(i.status) && i.due_on && i.due_on < today();
        const [label, tone] = INVOICE_STATUS[i.status] || [i.status, "grey"];
        return (
          <Row key={i.id} href={`/portal/billing/invoices/${i.id}`}>
            <Receipt className="h-4 w-4 flex-none text-maroon" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{i.number || "Draft invoice"}{showMatter ? <span className="font-normal text-stone-500"> · {i.client_name}</span> : null}</div>
              <div className="text-xs text-stone-500">{showMatter ? `${i.matter_number} · ` : ""}{i.issued_on ? `Issued ${fmtDay(i.issued_on)}` : `Started ${fmtDay(String(i.created_at).slice(0, 10))}`}{i.due_on && ["issued", "part_paid"].includes(i.status) ? ` · due ${fmtDay(i.due_on)}` : ""}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular-nums">{naira(i.total_kobo)}</div>
              {Number(i.paid_kobo) > 0 && i.status !== "paid" && <div className="text-xs text-stone-500">{naira(Number(i.total_kobo) - Number(i.paid_kobo))} due</div>}
            </div>
            <Badge tone={overdue ? "red" : tone}>{overdue ? "Overdue" : label}</Badge>
          </Row>
        );
      })}
    </>
  );
}
