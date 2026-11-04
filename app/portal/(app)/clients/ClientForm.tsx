import { CLIENT_KINDS } from "@/lib/portal/vocab";
import { Check, Field, Select, TextArea, btn } from "@/components/portal/ui";
import { saveClient } from "../matters/actions";

type C = { id?: string; kind?: string; name?: string; rc_number?: string | null; email?: string | null; phone?: string | null; address?: string | null; contact_person?: string | null; source?: string | null; notes?: string | null; kyc_verified?: boolean };

export function ClientForm({ c = {}, next, disabled }: { c?: C; next?: string; disabled?: boolean }) {
  return (
    <form action={saveClient}>
      <fieldset disabled={disabled} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {c.id && <input type="hidden" name="id" value={c.id} />}
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Name (person or organisation)" name="name" required defaultValue={c.name} className="sm:col-span-2" />
        <Select label="Type" name="kind" options={CLIENT_KINDS} defaultValue={c.kind || "individual"} />
        <Field label="RC / registration number" name="rc_number" defaultValue={c.rc_number || ""} placeholder="For companies" />
        <Field label="Email" name="email" type="email" defaultValue={c.email || ""} />
        <Field label="Phone" name="phone" defaultValue={c.phone || ""} inputMode="tel" />
        <Field label="Contact person" name="contact_person" defaultValue={c.contact_person || ""} placeholder="For organisations" />
        <Field label="How they came to us" name="source" defaultValue={c.source || ""} list="client-sources" placeholder="Referral, walk-in, website…" />
        <datalist id="client-sources"><option value="Referral" /><option value="Walk-in" /><option value="Website" /><option value="Existing client" /><option value="Phone" /></datalist>
        <TextArea label="Address" name="address" defaultValue={c.address || ""} rows={2} className="sm:col-span-2" />
        <TextArea label="Notes" name="notes" defaultValue={c.notes || ""} rows={3} className="sm:col-span-2" />
        <div className="sm:col-span-2"><Check name="kyc_verified" label="Identity / KYC documents have been checked" defaultChecked={c.kyc_verified} /></div>
        {!disabled && <div className="sm:col-span-2"><button className={btn.primary}>{c.id ? "Save changes" : next === "matter" ? "Save and open a matter" : "Save client"}</button></div>}
      </fieldset>
    </form>
  );
}
