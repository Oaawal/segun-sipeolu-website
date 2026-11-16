import { fmtDay } from "@/lib/portal/format";
import { naira } from "@/lib/portal/money";
import { FIRM } from "@/lib/portal/vocab";

export interface InvoiceDocData {
  number: string | null; status: string; issued_on: string | null; due_on: string | null; vat_rate_bp: number;
  subtotal_kobo: number; vat_kobo: number; total_kobo: number; paid_kobo: number; notes: string | null;
  client_name: string; client_address: string | null; matter_number: string; matter_title: string;
}

/** The invoice as the client sees it: on screen, printed or saved as PDF. */
export function InvoiceDocument({ inv, lines, settings }: {
  inv: InvoiceDocData;
  lines: { id: string; kind: string; description: string; quantity: string | number; unit_kobo: number; amount_kobo: number; vatable: boolean }[];
  settings: { bank: string; tin: string; footer: string };
}) {
  const fees = lines.filter((l) => l.kind !== "expense");
  const exps = lines.filter((l) => l.kind === "expense");
  const due = Number(inv.total_kobo) - Number(inv.paid_kobo);
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 text-stone-800 shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-gold pb-6">
        <div>
          <div className="font-serif text-2xl font-semibold text-maroon-dark">{FIRM.name}</div>
          <div className="mt-1 text-xs leading-relaxed text-stone-500">Barristers, Solicitors &amp; Notaries Public<br />Ikeja, Lagos{settings.tin ? <><br />TIN: {settings.tin}</> : null}</div>
        </div>
        <div className="text-right">
          <div className="font-serif text-3xl font-semibold uppercase tracking-wider text-maroon">{inv.status === "draft" ? "Draft" : "Invoice"}</div>
          <div className="mt-1 text-sm font-semibold">{inv.number || "Not yet issued"}</div>
          {inv.issued_on && <div className="text-xs text-stone-500">Date: {fmtDay(inv.issued_on)}</div>}
          {inv.due_on && <div className="text-xs text-stone-500">Due: {fmtDay(inv.due_on)}</div>}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-6 py-6 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Bill to</div>
          <div className="mt-1 font-semibold">{inv.client_name}</div>
          {inv.client_address && <div className="whitespace-pre-line text-sm text-stone-600">{inv.client_address}</div>}
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Matter</div>
          <div className="mt-1 font-semibold">{inv.matter_title}</div>
          <div className="text-sm text-stone-600">Our ref: {inv.matter_number}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-stone-300 text-left text-[11px] uppercase tracking-wider text-stone-500"><th className="py-2 pr-3">Description</th><th className="px-3 py-2 text-right">Qty / hrs</th><th className="px-3 py-2 text-right">Rate</th><th className="py-2 pl-3 text-right">Amount</th></tr></thead>
          <tbody>
            {fees.length > 0 && <tr><td colSpan={4} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-maroon">Professional fees</td></tr>}
            {fees.map((l) => (
              <tr key={l.id} className="border-b border-stone-100 align-top">
                <td className="py-2 pr-3">{l.description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{l.kind === "time" ? Number(l.quantity).toFixed(2) : Number(l.quantity)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{naira(l.unit_kobo, { symbol: false })}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{naira(l.amount_kobo, { symbol: false })}</td>
              </tr>
            ))}
            {exps.length > 0 && <tr><td colSpan={4} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-maroon">Disbursements (at cost, no VAT)</td></tr>}
            {exps.map((l) => (
              <tr key={l.id} className="border-b border-stone-100 align-top">
                <td className="py-2 pr-3">{l.description}</td><td /><td />
                <td className="py-2 pl-3 text-right tabular-nums">{naira(l.amount_kobo, { symbol: false })}</td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-stone-400">No lines yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <dl className="w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-stone-500">Subtotal</dt><dd className="tabular-nums">{naira(inv.subtotal_kobo)}</dd></div>
          {inv.vat_rate_bp > 0 && <div className="flex justify-between"><dt className="text-stone-500">VAT at {inv.vat_rate_bp / 100}% on fees</dt><dd className="tabular-nums">{naira(inv.vat_kobo)}</dd></div>}
          <div className="flex justify-between border-t border-stone-300 pt-1 font-semibold"><dt>Total</dt><dd className="tabular-nums">{naira(inv.total_kobo)}</dd></div>
          {Number(inv.paid_kobo) > 0 && <div className="flex justify-between text-green"><dt>Paid</dt><dd className="tabular-nums">−{naira(inv.paid_kobo)}</dd></div>}
          {inv.status !== "draft" && inv.status !== "void" && <div className="flex justify-between rounded-lg bg-maroon px-3 py-2 font-semibold text-white"><dt>Balance due</dt><dd className="tabular-nums">{naira(due)}</dd></div>}
        </dl>
      </div>
      {inv.status === "void" && <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm font-semibold text-red-700">This invoice has been cancelled.</div>}
      {inv.notes && <p className="mt-6 whitespace-pre-line text-sm text-stone-600">{inv.notes}</p>}
      {(settings.bank || settings.footer) && (
        <footer className="mt-8 border-t border-stone-200 pt-4 text-xs leading-relaxed text-stone-500">
          {settings.bank && <div className="whitespace-pre-line"><strong className="text-stone-700">Pay by bank transfer:</strong> {settings.bank}{inv.number ? ` · Quote ${inv.number} as the reference.` : ""}</div>}
          {settings.footer && <div className="mt-2 whitespace-pre-line">{settings.footer}</div>}
        </footer>
      )}
    </article>
  );
}
