import Link from "next/link";
import { BookOpen, FileSignature, Lock, Search, Sparkles, Upload } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can, ROLES } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { ago, fmtSize } from "@/lib/portal/format";
import { TEMPLATE_CATEGORIES } from "@/lib/portal/vocab";
import { KNOWN_FIELDS } from "@/lib/portal/templates";
import { templateVisibleSql, visibilityLabel } from "@/lib/portal/template-access";
import { Badge, Card, Chips, Empty, Field, Flash, Note, PageHeader, Row, Select, btn, inputCls } from "@/components/portal/ui";
import { installStarters } from "./actions";
import { directUploads } from "@/lib/portal/storage";
import { FileField } from "@/components/portal/FileField";
import { VisibilityField } from "./VisibilityField";

export const metadata = { title: "Templates" };

export default async function Templates({ searchParams }: { searchParams: Promise<{ msg?: string; cat?: string; q?: string }> }) {
  const u = await requirePermission("templates.view");
  const sp = await searchParams;
  const cat = sp.cat && sp.cat in TEMPLATE_CATEGORIES ? sp.cat : "";
  const term = (sp.q || "").trim().slice(0, 80);
  const params: unknown[] = [];
  const where = [templateVisibleSql(u)];
  if (!can(u, "templates.manage")) where.push("t.active");
  if (cat) { params.push(cat); where.push(`t.category = $${params.length}`); }
  if (term) { params.push(`%${term.replace(/[%_\\]/g, (c) => "\\" + c)}%`); where.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length} OR t.file_name ILIKE $${params.length})`); }
  const rows = await q<{ id: string; title: string; category: keyof typeof TEMPLATE_CATEGORIES; description: string | null; active: boolean; updated_at: string; uses: number; kind: string; file_name: string; size_bytes: number; visible_to: string | null }>(
    `SELECT t.id, t.title, t.category, t.description, t.active, t.updated_at, t.kind, t.file_name, t.size_bytes, t.visible_to,
            (SELECT COUNT(*) FROM audit_log a WHERE a.action = 'template.generated' AND a.entity_id = t.id::text) AS uses
     FROM templates t WHERE ${where.join(" AND ")} ORDER BY t.active DESC, t.category, t.title`, params);
  const counts = await q<{ category: string; n: number }>(`SELECT t.category, COUNT(*)::int AS n FROM templates t WHERE ${templateVisibleSql(u)} AND t.active GROUP BY t.category`);
  const manage = can(u, "templates.manage");
  return (
    <>
      <PageHeader title="Templates & precedents" sub="The documents the firm uses time to time: fill-in templates to generate for a matter, and reference documents to preview and download." />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <form className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            {cat && <input type="hidden" name="cat" value={cat} />}
            <input name="q" type="search" defaultValue={term} placeholder="Find a template or document" className={`${inputCls} pl-9`} />
          </form>
          <Chips active={cat || "all"} items={[{ key: "all", label: "All", href: `/portal/templates${term ? `?q=${encodeURIComponent(term)}` : ""}`, n: counts.reduce((s, c) => s + c.n, 0) },
            ...Object.entries(TEMPLATE_CATEGORIES).filter(([k]) => counts.some((c) => c.category === k)).map(([k, l]) => ({ key: k, label: l, href: `/portal/templates?cat=${k}${term ? `&q=${encodeURIComponent(term)}` : ""}`, n: counts.find((c) => c.category === k)?.n }))]} />
          <Card pad={false}>
            {rows.length === 0 ? (
              <Empty icon={<FileSignature className="h-8 w-8" />} title={term || cat ? "Nothing matches" : "No templates yet"} text={term || cat ? undefined : "Add the firm's own documents, or start with the ready-made ones."}
                action={manage && !term && !cat ? <form action={installStarters} className="mt-2"><button className={btn.primary}><Sparkles className="h-4 w-4" />Add starter templates</button></form> : undefined} />
            ) : rows.map((t) => (
              <Row key={t.id} href={`/portal/templates/${t.id}`} className={t.active ? "" : "opacity-50"}>
                <span className={`grid h-9 w-9 flex-none place-items-center rounded-xl ${t.kind === "fillable" ? "bg-maroon/10 text-maroon" : "bg-sky-50 text-sky-700"}`}>{t.kind === "fillable" ? <FileSignature className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-stone-800">{t.title}</div>
                  <div className="truncate text-sm text-stone-500">{t.description || TEMPLATE_CATEGORIES[t.category]}</div>
                </div>
                <div className="hidden flex-col items-end gap-1 sm:flex">
                  <span className="flex gap-1">{t.visible_to && <Badge tone="maroon"><Lock className="h-3 w-3" />{visibilityLabel(t.visible_to)}</Badge>}<Badge tone={t.kind === "fillable" ? "gold" : "blue"}>{t.kind === "fillable" ? "Fill-in template" : "Reference"}</Badge></span>
                  <span className="text-xs text-stone-400">{t.file_name.split(".").pop()?.toUpperCase()} · {fmtSize(Number(t.size_bytes))} · {t.uses ? `used ${t.uses}×` : `updated ${ago(t.updated_at)}`}</span>
                </div>
              </Row>
            ))}
          </Card>
        </div>
        <div className="space-y-6">
          {manage && (
            <Card title="Add a document">
              <form action="/portal/api/templates" method="post" encType="multipart/form-data" className="space-y-3">
                <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">File <span className="text-maroon">*</span></span>
                  <FileField name="file" required direct={directUploads()} className="block w-full rounded-lg border border-dashed border-stone-300 bg-cream/40 px-3 py-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-maroon file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" /></label>
                <p className="text-xs text-stone-500">Any document: Word, PDF, Excel, PowerPoint, pictures. A Word file with <code className="rounded bg-cream px-1">{"{{fields}}"}</code> becomes a fill-in template; anything else is kept as a reference document.</p>
                <Field label="Title" name="title" placeholder="e.g. Notice of change of counsel" />
                <Select label="Category" name="category" options={TEMPLATE_CATEGORIES} defaultValue="letter" />
                <Field label="What it is for" name="description" />
                <VisibilityField roles={Object.entries(ROLES).filter(([k]) => k !== "admin").map(([k, v]) => [k, v.label])} />
                <button className={btn.primary}><Upload className="h-4 w-4" />Add</button>
              </form>
              {rows.length > 0 && <form action={installStarters} className="mt-3"><button className={btn.small}><Sparkles className="h-3.5 w-3.5" />Add any missing starter templates</button></form>}
            </Card>
          )}
          {can(u, "templates.use") && (
            <details className="rounded-2xl border border-stone-200 bg-white p-5">
              <summary className="cursor-pointer text-sm font-semibold text-stone-700">Fields you can use in Word templates</summary>
              <p className="my-3 text-sm text-stone-600">Type these into the Word document, braces included. Each is filled from the matter when generating. Anything else in braces, such as <code className="rounded bg-cream px-1">{"{{amount}}"}</code>, becomes a box to fill in.</p>
              <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                {Object.entries(KNOWN_FIELDS).map(([k, v]) => <div key={k} className="contents"><dt><code className="select-all rounded bg-cream px-1 text-maroon-dark">{`{{${k}}}`}</code></dt><dd className="text-stone-500">{v}</dd></div>)}
              </dl>
            </details>
          )}
          <Note tone="info">Starter templates are a starting point: have a lawyer review the wording, then replace them with the firm&apos;s own. <Link href="/portal/search" className="font-semibold underline">Search</Link> finds matter documents.</Note>
        </div>
      </div>
    </>
  );
}
