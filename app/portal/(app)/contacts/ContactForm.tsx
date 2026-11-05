import { CONTACT_KINDS } from "@/lib/portal/vocab";
import { Field, Select, TextArea, btn } from "@/components/portal/ui";
import { saveContact } from "./actions";

type C = { id?: string; name?: string; organisation?: string | null; kind?: string; role?: string | null; email?: string | null; phone?: string | null; phone_alt?: string | null; address?: string | null; website?: string | null; notes?: string | null };

export function ContactForm({ c = {}, matters, disabled }: { c?: C; matters?: { id: string; number: string; title: string }[]; disabled?: boolean }) {
  return (
    <form action={saveContact}>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        {c.id && <input type="hidden" name="id" value={c.id} />}
        <Field label="Name" name="name" required defaultValue={c.name} placeholder="e.g. Mr Bayo Adeleke, or Registry, High Court Ikeja" />
        <Field label="Organisation" name="organisation" defaultValue={c.organisation || ""} />
        <Select label="Type" name="kind" options={CONTACT_KINDS} defaultValue={c.kind || "other"} />
        <Field label="Role / position" name="role" defaultValue={c.role || ""} placeholder="e.g. Registrar, Counsel to defendant" />
        <Field label="Phone" name="phone" defaultValue={c.phone || ""} inputMode="tel" />
        <Field label="Other phone" name="phone_alt" defaultValue={c.phone_alt || ""} inputMode="tel" />
        <Field label="Email" name="email" type="email" defaultValue={c.email || ""} />
        <Field label="Website" name="website" defaultValue={c.website || ""} />
        <TextArea label="Address" name="address" rows={2} defaultValue={c.address || ""} className="sm:col-span-2" />
        <TextArea label="Notes" name="notes" rows={3} defaultValue={c.notes || ""} className="sm:col-span-2" placeholder="e.g. Best reached before 10am; prefers WhatsApp" />
        {matters && matters.length > 0 && <Select label="Link to a matter (optional)" name="matter_id" options={matters.map((m) => [m.id, `${m.number} · ${m.title}`])} blank="No matter" className="sm:col-span-2" />}
        {!disabled && <div className="sm:col-span-2"><button className={btn.primary}>{c.id ? "Save changes" : "Add contact"}</button></div>}
      </fieldset>
    </form>
  );
}
