import Link from "next/link";
import { Check as CheckIcon, Plus } from "lucide-react";
import type { TaskRow } from "@/lib/portal/data";
import { daysUntil, dueLabel, today } from "@/lib/portal/format";
import { createTask, toggleTask } from "@/app/portal/(app)/tasks/actions";
import { Badge, DueBadge, Empty, Field, Select, btn } from "./ui";

export function TaskList({ tasks, back, showMatter = true }: { tasks: TaskRow[]; back: string; showMatter?: boolean }) {
  if (!tasks.length) return <Empty title="No tasks here" />;
  return (
    <div>
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 border-t border-stone-100 px-5 py-3 first:border-t-0">
          <form action={toggleTask}>
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="back" value={back} />
            <button aria-label={t.status === "done" ? "Reopen task" : "Mark task done"} className={`grid h-6 w-6 place-items-center rounded-full border-2 transition ${t.status === "done" ? "border-green bg-green text-white" : "border-stone-300 text-transparent hover:border-green hover:text-green"}`}>
              <CheckIcon className="h-3.5 w-3.5" />
            </button>
          </form>
          <span className={`h-2 w-2 flex-none rounded-full ${t.priority === "high" ? "bg-red-500" : t.priority === "low" ? "bg-stone-300" : "bg-gold"}`} title={`${t.priority} priority`} />
          <div className="min-w-0 flex-1">
            <div className={`truncate font-medium ${t.status === "done" ? "text-stone-400 line-through" : "text-stone-800"}`}>
              {t.kind === "deadline" && <Badge tone="red">Deadline</Badge>} {t.title}
            </div>
            <div className="truncate text-xs text-stone-500">
              {showMatter && (t.matter_id ? <Link href={`/portal/matters/${t.matter_id}?tab=tasks`} className="hover:text-maroon">{t.matter_number}</Link> : "No matter")}
              {showMatter && " · "}{t.assignee_name || "Unassigned"}{t.source?.startsWith("meeting:") ? " · from meeting minutes" : t.source?.startsWith("service:") ? " · from service register" : t.source?.startsWith("hearing:") ? " · from court diary" : ""}
            </div>
          </div>
          {t.status === "open" && <DueBadge days={daysUntil(t.due_on)} label={dueLabel(t.due_on)} />}
        </div>
      ))}
    </div>
  );
}

export function TaskForm({ back, matterId, matters, staff, me, canAssign }: { back: string; matterId?: string; matters?: { id: string; number: string; title: string }[]; staff: { id: string; full_name: string; role: string }[]; me: string; canAssign: boolean }) {
  return (
    <form action={createTask} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="back" value={back} />
      {matterId && <input type="hidden" name="matter_id" value={matterId} />}
      <Field label="What needs doing" name="title" required className="sm:col-span-2" placeholder="e.g. File reply to statement of defence" />
      <Field label="Due" name="due_on" type="date" defaultValue={today()} />
      <Select label="Type" name="kind" options={{ task: "Task", deadline: "Deadline (legal consequence if missed)" }} defaultValue="task" />
      {canAssign && <Select label="For" name="assigned_to" options={staff.filter((s) => s.role !== "front_desk" || s.id === me).map((s) => [s.id, s.full_name])} defaultValue={me} />}
      <Select label="Priority" name="priority" options={{ normal: "Normal", high: "High", low: "Low" }} defaultValue="normal" />
      {!matterId && matters && <Select label="Matter" name="matter_id" options={matters.map((m) => [m.id, `${m.number} · ${m.title}`])} blank="No matter" className="sm:col-span-2" />}
      <div className="sm:col-span-2"><button className={btn.primary}><Plus className="h-4 w-4" />Add task</button></div>
    </form>
  );
}
