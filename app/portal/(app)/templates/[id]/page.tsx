import { notFound } from "next/navigation";
import { Download, FileSignature, Upload, Wand2 } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one, q } from "@/lib/portal/db";
import { pickableMatters } from "@/lib/portal/data";
import { matterFacts } from "@/lib/portal/guards";
import { canSeeMatter } from "@/lib/portal/permissions";
import { fmtDay, isUuid } from "@/lib/portal/format";
import { KNOWN_FIELDS } from "@/lib/portal/templates";
import { TEMPLATE_CATEGORIES } from "@/lib/portal/vocab";
import { Card, Field, Flash, Note, PageHeader, Select, TextArea, btn, inputCls } from "@/components/portal/ui";
import { updateTemplate } from "../actions";
import { s3Enabled } from "@/lib/portal/storage";
import { FileField } from "@/components/portal/FileField";

export const metadata = { title: "Template" };

const LONG = /facts|description|body|details|terms|reasons|address/;

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; matter?: string }> }) {
  const u = await requirePermission("templates.use");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const t = await one<{ id: string; title: string; category: keyof typeof TEMPLATE_CATEGORIES; description: string | null; fields: string | null; active: boolean; file_name: string; updated_at: string }>("SELECT * FROM templates WHERE id = $1", [id]);
  if (!t) notFound();
  const fields: string[] = JSON.parse(t.fields || "[]");
  const custom = fields.filter((f) => !KNOWN_FIELDS[f]);
  const usesService = fields.some((f) => f.startsWith("service."));
  const matters = await pickableMatters(u);
  const m = sp.matter ? await matterFacts(u, sp.matter) : null;
  const chosen = m && canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member }) ? m : null;
  const service = chosen && usesService ? await q<{ id: string; number: string; title: string; served_on: string }>("SELECT id, number, title, served_on FROM service_register WHERE matter_id = $1 AND direction = 'out' ORDER BY served_on DESC", [chosen.id]) : [];
  return (
    <>
      <PageHeader back={{ href: "/portal/templates", label: "Templates" }} title={<span className="flex items-center gap-3"><FileSignature className="h-7 w-7 text-maroon" />{t.title}</span>} sub={t.description || TEMPLATE_CATEGORIES[t.category]}
        actions={<a href={`/portal/api/templates/${t.id}/file`} className={btn.ghost}><Download className="h-4 w-4" />Blank template</a>} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title="Generate for a matter">
          {!t.active ? <Note tone="warn">This template is switched off.</Note> : !chosen ? (
            <form className="flex flex-wrap items-end gap-2">
              <label className="min-w-[240px] flex-1"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Matter</span>
                <select name="matter" required className={inputCls} defaultValue=""><option value="" disabled>Choose a matter…</option>{matters.map((x) => <option key={x.id} value={x.id}>{x.number} · {x.title}</option>)}</select></label>
              <button className={btn.primary}>Continue</button>
            </form>
          ) : (
            <form action={`/portal/api/templates/${t.id}/generate`} method="post" className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="matter_id" value={chosen.id} />
              <div className="sm:col-span-2 rounded-xl bg-cream px-4 py-3 text-sm"><span className="text-stone-500">Matter:</span> <strong>{chosen.number} · {chosen.title}</strong> <a href={`/portal/templates/${t.id}`} className="ml-2 text-xs font-semibold text-maroon">Change</a></div>
              {usesService && (
                <Select label="Service record (for the affidavit)" name="service_id" options={service.map((s) => [s.id, `${s.number} · ${s.title} · ${fmtDay(s.served_on)}`])} blank={service.length ? "Choose…" : "No outward service logged on this matter"} className="sm:col-span-2" />
              )}
              {custom.map((f) => LONG.test(f)
                ? <TextArea key={f} label={f.replace(/[._]/g, " ")} name={`f_${f}`} rows={3} className="sm:col-span-2" />
                : <Field key={f} label={f.replace(/[._]/g, " ")} name={`f_${f}`} />)}
              <div className="sm:col-span-2"><button className={btn.primary}><Wand2 className="h-4 w-4" />Generate Word document</button></div>
              <p className="sm:col-span-2 text-xs text-stone-500">The document downloads to open in Word, and a copy is saved on the matter. Fields left empty show as [field] so you can spot them.</p>
            </form>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Fields in this template">
            <div className="flex flex-wrap gap-1.5">{fields.length ? fields.map((f) => <code key={f} className={`rounded px-1.5 py-0.5 text-xs ${KNOWN_FIELDS[f] ? "bg-green/10 text-green" : "bg-gold/20 text-[#7a5a14]"}`}>{f}</code>) : <span className="text-sm text-stone-400">None found.</span>}</div>
            <p className="mt-3 text-xs text-stone-500">Green: filled automatically. Gold: typed in when generating.</p>
          </Card>
          {can(u, "templates.manage") && (
            <Card title="Manage">
              <form action={updateTemplate} className="space-y-3">
                <input type="hidden" name="id" value={t.id} />
                <Field label="Title" name="title" defaultValue={t.title} />
                <Select label="Category" name="category" options={TEMPLATE_CATEGORIES} defaultValue={t.category} />
                <Field label="What it is for" name="description" defaultValue={t.description || ""} />
                <Select label="Status" name="active" options={[["1", "In use"], ["0", "Switched off"]]} defaultValue={t.active ? "1" : "0"} />
                <button className={btn.small}>Save</button>
              </form>
              <form action="/portal/api/templates" method="post" encType="multipart/form-data" className="mt-4 space-y-2 border-t border-stone-100 pt-4">
                <input type="hidden" name="id" value={t.id} />
                <label className="block text-[13px] font-semibold text-stone-700">Replace with an updated .docx</label>
                <FileField name="file" accept=".docx" required direct={s3Enabled()} className="block w-full text-sm" />
                <button className={btn.small}><Upload className="h-3.5 w-3.5" />Replace</button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
