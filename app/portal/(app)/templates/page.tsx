import { FileSignature, Sparkles, Upload } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { ago } from "@/lib/portal/format";
import { TEMPLATE_CATEGORIES } from "@/lib/portal/vocab";
import { KNOWN_FIELDS } from "@/lib/portal/templates";
import { Badge, Card, Empty, Field, Flash, Note, PageHeader, Row, Select, btn } from "@/components/portal/ui";
import { installStarters } from "./actions";

export const metadata = { title: "Templates" };

export default async function Templates({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const u = await requirePermission("templates.use");
  const sp = await searchParams;
  const rows = await q<{ id: string; title: string; category: keyof typeof TEMPLATE_CATEGORIES; description: string | null; active: boolean; updated_at: string; uses: number }>(
    `SELECT t.id, t.title, t.category, t.description, t.active, t.updated_at,
            (SELECT COUNT(*) FROM audit_log a WHERE a.action = 'template.generated' AND a.entity_id = t.id::text) AS uses
     FROM templates t ORDER BY t.active DESC, t.category, t.title`);
  const manage = can(u, "templates.manage");
  return (
    <>
      <PageHeader title="Precedents & templates" sub="The firm's standard documents, filled in from a matter in one click and opened in Word" />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card pad={false}>
          {rows.length === 0 ? (
            <Empty icon={<FileSignature className="h-8 w-8" />} title="No templates yet" text="Upload the firm's own precedents, or start with three ready-made ones." action={manage ? <form action={installStarters} className="mt-2"><button className={btn.primary}><Sparkles className="h-4 w-4" />Add starter templates</button></form> : undefined} />
          ) : rows.map((t) => (
            <Row key={t.id} href={`/portal/templates/${t.id}`} className={t.active ? "" : "opacity-50"}>
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-maroon/10 text-maroon"><FileSignature className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold text-stone-800">{t.title}</div><div className="truncate text-sm text-stone-500">{t.description || TEMPLATE_CATEGORIES[t.category]}</div></div>
              <div className="hidden flex-col items-end gap-1 sm:flex"><Badge>{TEMPLATE_CATEGORIES[t.category]}</Badge><span className="text-xs text-stone-400">{t.uses ? `Used ${t.uses}×` : `Updated ${ago(t.updated_at)}`}</span></div>
            </Row>
          ))}
        </Card>
        <div className="space-y-6">
          {manage && (
            <Card title="Add a template">
              <form action="/portal/api/templates" method="post" encType="multipart/form-data" className="space-y-3">
                <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Word document (.docx) <span className="text-maroon">*</span></span>
                  <input type="file" name="file" accept=".docx" required className="block w-full rounded-lg border border-dashed border-stone-300 bg-cream/40 px-3 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-maroon file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" /></label>
                <Field label="Title" name="title" placeholder="e.g. Notice of change of counsel" />
                <Select label="Category" name="category" options={TEMPLATE_CATEGORIES} defaultValue="letter" />
                <Field label="What it is for" name="description" />
                <button className={btn.primary}><Upload className="h-4 w-4" />Add template</button>
              </form>
              {rows.length > 0 && <form action={installStarters} className="mt-3"><button className={btn.small}><Sparkles className="h-3.5 w-3.5" />Add any missing starter templates</button></form>}
            </Card>
          )}
          <Card title="Fields you can use in Word">
            <p className="mb-3 text-sm text-stone-600">Type these into the Word document, braces included. Each is filled from the matter when generating. Anything else in braces, such as <code className="rounded bg-cream px-1">{"{{amount}}"}</code>, becomes a box to fill in.</p>
            <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
              {Object.entries(KNOWN_FIELDS).map(([k, v]) => <div key={k} className="contents"><dt><code className="select-all rounded bg-cream px-1 text-maroon-dark">{`{{${k}}}`}</code></dt><dd className="text-stone-500">{v}</dd></div>)}
            </dl>
          </Card>
          <Note tone="info">The starter templates are a starting point: have a lawyer review the wording, then replace them with the firm&apos;s own precedents.</Note>
        </div>
      </div>
    </>
  );
}
