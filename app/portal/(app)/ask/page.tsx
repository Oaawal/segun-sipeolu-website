import Link from "next/link";
import { Bot, FileText, Sparkles } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { one, q } from "@/lib/portal/db";
import { isUuid, fmtDateTime } from "@/lib/portal/format";
import { assistantEnabled, type Answer } from "@/lib/portal/assistant";
import { Card, Note, PageHeader, Row, btn, inputCls } from "@/components/portal/ui";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { ask } from "./actions";

export const metadata = { title: "Ask" };

const STARTERS = [
  "Brief me for today: court, deadlines and anything overdue.",
  "Which of my matters have a court date in the next two weeks, and what is each sitting for?",
  "What responses to served documents are due this week?",
  "What happened at the last sitting in ",
];

export default async function AskPage({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const u = await requirePermission("assistant.use");
  const sp = await searchParams;
  const current = isUuid(sp.id) ? await one<{ question: string; answer: string; sources: string; created_at: string }>("SELECT question, answer, sources, created_at FROM assistant_log WHERE id = $1 AND user_id = $2", [sp.id, u.id]) : null;
  const history = await q<{ id: string; question: string; created_at: string }>("SELECT id, question, created_at FROM assistant_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 12", [u.id]);
  const a = current ? (JSON.parse(current.answer) as Answer) : null;
  const src = current ? (JSON.parse(current.sources) as { used: { key: string; label: string; href: string; kind: string }[] }).used : [];
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><Sparkles className="h-6 w-6 text-gold" />Ask the portal</span>} sub="Questions about your matters, court dates, deadlines and documents, answered from the firm's records you can open, with the sources." />
      {!assistantEnabled() && <div className="mb-6"><Note tone="warn">The assistant is off. The Managing Partner switches it on by adding ANTHROPIC_API_KEY to the server settings.</Note></div>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <ActionForm action={ask} className="space-y-3">
              <textarea name="question" rows={3} required maxLength={1000} defaultValue={sp.q || ""} placeholder="e.g. What did the court order at the last sitting in Adeyemi v Lagos Homes?" className={inputCls} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SubmitButton className={btn.primary} pending="Reading the records…"><Bot className="h-4 w-4" />Ask</SubmitButton>
                <span className="text-xs text-stone-500">Takes up to a minute. Questions are recorded.</span>
              </div>
            </ActionForm>
            {!current && (
              <div className="mt-5 flex flex-wrap gap-2">
                {STARTERS.map((s) => <Link key={s} href={`/portal/ask?q=${encodeURIComponent(s)}`} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700 hover:border-maroon/40">{s.endsWith(" ") ? `${s}…` : s}</Link>)}
              </div>
            )}
          </Card>
          {current && a && (
            <Card title={current.question}>
              <div className="space-y-3 text-[15px] leading-relaxed text-stone-800">
                {a.answer.split(/\n{2,}/).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>)}
              </div>
              {src.length > 0 && (
                <div className="mt-6 border-t border-stone-100 pt-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Sources</div>
                  <ul className="space-y-1.5">{src.map((s) => <li key={s.key} className="flex items-center gap-2 text-sm"><span className="rounded bg-maroon/10 px-1.5 text-xs font-bold text-maroon">{s.key}</span><FileText className="h-3.5 w-3.5 text-stone-400" /><Link href={s.href} className="truncate text-maroon hover:underline">{s.label}</Link></li>)}</ul>
                </div>
              )}
              {a.follow_ups.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{a.follow_ups.slice(0, 3).map((f) => <Link key={f} href={`/portal/ask?q=${encodeURIComponent(f)}`} className="rounded-full bg-cream px-3 py-1.5 text-xs text-stone-700 hover:bg-gold/20">{f}</Link>)}</div>}
              <p className="mt-5 text-xs text-stone-500">Written by AI from the records above on {fmtDateTime(current.created_at)}. Check the sources before you rely on it or send it to anyone.</p>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Your recent questions" pad={false}>
            {history.length === 0 ? <p className="p-5 text-sm text-stone-500">None yet.</p> : history.map((h) => <Row key={h.id} href={`/portal/ask?id=${h.id}`}><div className="min-w-0 flex-1"><div className="truncate text-sm">{h.question}</div><div className="text-xs text-stone-400">{fmtDateTime(h.created_at)}</div></div></Row>)}
          </Card>
          <Note tone="lock">The assistant sees only what you could open yourself: never a walled-off matter you are not on. Records are sent to Anthropic&apos;s API to write the answer and are not used to train models.</Note>
        </div>
      </div>
    </>
  );
}
