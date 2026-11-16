import { requirePermission } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { billingSettings } from "@/lib/portal/billing";
import { paystackEnabled } from "@/lib/portal/paystack";
import { siteUrl } from "@/lib/portal/client-mail";
import { ROLES, type Role } from "@/lib/portal/permissions";
import { Card, Field, Flash, Note, PageHeader, Select, TextArea, btn } from "@/components/portal/ui";
import { saveBillingSettings } from "../actions";

export const metadata = { title: "Billing settings" };

export default async function BillingSettings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requirePermission("billing.settings");
  const sp = await searchParams;
  const [s, staff] = await Promise.all([
    billingSettings(),
    q<{ id: string; full_name: string; role: Role; title: string | null; hourly_rate_kobo: number | null }>("SELECT id, full_name, role, title, hourly_rate_kobo FROM users WHERE active AND role <> 'front_desk' ORDER BY full_name"),
  ]);
  return (
    <>
      <PageHeader back={{ href: "/portal/billing", label: "Time & billing" }} title="Rates & invoice settings" sub="What goes on every invoice, and each fee earner's hourly rate." />
      <Flash msg={sp.msg} />
      <form action={saveBillingSettings} className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="On every invoice">
          <div className="space-y-4">
            <TextArea label="Bank details for transfers" name="billing.bank" rows={3} defaultValue={s["billing.bank"]} placeholder="e.g. Zenith Bank · Segun Sipeolu & Associates · 1234567890" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Days to pay" name="billing.terms_days" type="number" min={0} max={120} defaultValue={s["billing.terms_days"]} />
              <Select label="Charge VAT (7.5%)" name="billing.vat_registered" options={{ yes: "Yes", no: "No" }} defaultValue={s["billing.vat_registered"]} />
            </div>
            <Field label="Firm's TIN / VAT number" name="billing.tin" defaultValue={s["billing.tin"]} />
            <TextArea label="Note at the foot" name="billing.footer" rows={3} defaultValue={s["billing.footer"]} placeholder="e.g. Thank you for your instructions. Queries on this invoice within 14 days, please." />
          </div>
        </Card>
        <Card title="Hourly rates (₦ per hour)">
          <div className="space-y-3">
            {staff.map((p) => (
              <label key={p.id} className="flex items-center gap-3">
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{p.full_name}</span><span className="block text-xs text-stone-500">{p.title || ROLES[p.role].label}</span></span>
                <input name={`rate_${p.id}`} inputMode="decimal" defaultValue={p.hourly_rate_kobo ? (p.hourly_rate_kobo / 100).toFixed(2) : ""} placeholder="0.00" className="w-36 rounded-lg border border-stone-300 px-3 py-2 text-right text-sm tabular-nums" />
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-stone-500">A new rate applies to time recorded from now on. Time already recorded keeps the rate it was recorded at.</p>
        </Card>
        <div className="space-y-4 xl:col-span-2">
          <Note tone={paystackEnabled() ? "ok" : "info"}>
            {paystackEnabled()
              ? <>Online payments are on (Paystack). Set the webhook in your Paystack dashboard to <strong>{siteUrl()}/portal/api/paystack/webhook</strong> so payments are recorded even if the client closes the page.</>
              : <>Online card payments are off. Add <strong>PAYSTACK_SECRET_KEY</strong> to the server settings to let clients pay invoices by card, transfer or USSD.</>}
          </Note>
          <button className={btn.primary}>Save settings</button>
        </div>
      </form>
    </>
  );
}
