import { ListChecks, Plus } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { MATTER_TYPES } from "@/lib/portal/vocab";
import { parseSteps, stepsToText } from "@/lib/portal/workflows";
import { Badge, Card, Empty, Field, Flash, Note, PageHeader, Select, TextArea, btn } from "@/components/portal/ui";
import { addStarterWorkflows, archiveWorkflow, saveWorkflow } from "./actions";

export const metadata = { title: "Checklists" };

const HINT = "One step per line: Title | days after start | high/low | deadline | partner. Only the title is required. e.g.\nFile memorandum of appearance | 5 days | high | deadline";

export default async function Checklists({ searchParams }: { searchParams: Promise<{ msg?: string; edit?: string }> }) {
  const u = await requirePermission("tasks.assign_others");
  const sp = await searchParams;
  const manage = can(u, "workflows.manage");
  const rows = await q<{ id: string; name: string; matter_type: string | null; description: string | null; steps: string }>("SELECT id, name, matter_type, description, steps FROM workflows WHERE active ORDER BY name");
  const editing = rows.find((r) => r.id === sp.edit);
  return (
    <>
      <PageHeader title="Matter checklists" sub="The firm's standard steps for each kind of work. Choose one when opening a matter, or apply it from a matter's Tasks tab." />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {rows.length === 0 && (
            <Card><Empty icon={<ListChecks className="h-8 w-8" />} title="No checklists yet" text="Start from five common ones (litigation, property, incorporation, debt recovery) and adapt them." action={manage ? <form action={addStarterWorkflows}><button className={btn.primary}>Add the starter checklists</button></form> : undefined} /></Card>
          )}
          {rows.map((w) => {
            const steps = parseSteps(w.steps);
            return (
              <Card key={w.id} title={<span className="flex items-center gap-2 normal-case tracking-normal"><span className="text-base font-semibold text-stone-800">{w.name}</span>{w.matter_type && <Badge>{MATTER_TYPES[w.matter_type as keyof typeof MATTER_TYPES]}</Badge>}</span>}
                action={manage ? <span className="flex gap-2"><a href={`/portal/checklists?edit=${w.id}`} className={btn.small}>Edit</a><form action={archiveWorkflow}><input type="hidden" name="id" value={w.id} /><button className={btn.small}>Remove</button></form></span> : undefined}>
                {w.description && <p className="mb-3 text-sm text-stone-500">{w.description}</p>}
                <ol className="space-y-1.5 text-sm">
                  {steps.map((s, i) => (
                    <li key={i} className="flex gap-3"><span className="w-16 flex-none text-right text-xs tabular-nums text-stone-400">{s.days !== null ? `day ${s.days}` : ""}</span><span className="flex-1">{s.title}</span>{s.kind === "deadline" && <Badge tone="red">Deadline</Badge>}{s.priority === "high" && <Badge tone="amber">High</Badge>}{s.who === "partner" && <Badge tone="maroon">Partner</Badge>}</li>
                  ))}
                </ol>
              </Card>
            );
          })}
        </div>
        {manage && (
          <Card title={editing ? `Edit: ${editing.name}` : "New checklist"}>
            <form action={saveWorkflow} className="space-y-3">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <Field label="Name" name="name" required defaultValue={editing?.name} placeholder="e.g. Probate: letters of administration" />
              <Select label="For matter type" name="matter_type" options={MATTER_TYPES} blank="Any" defaultValue={editing?.matter_type || ""} />
              <Field label="Description" name="description" defaultValue={editing?.description || ""} />
              <TextArea label="Steps" name="steps" required rows={12} defaultValue={editing ? stepsToText(parseSteps(editing.steps)) : ""} placeholder={HINT} />
              <button className={btn.primary}><Plus className="h-4 w-4" />{editing ? "Save changes" : "Add checklist"}</button>
            </form>
            <div className="mt-4"><Note tone="warn">Periods in checklists are planning aids. Court deadlines must still be checked against the rules that apply; use the deadline calculator for those.</Note></div>
          </Card>
        )}
      </div>
    </>
  );
}
