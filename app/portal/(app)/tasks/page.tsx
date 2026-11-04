import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { listTasks, pickableMatters, staffList } from "@/lib/portal/data";
import { Card, Chips, Flash, PageHeader } from "@/components/portal/ui";
import { TaskForm, TaskList } from "@/components/portal/Tasks";

export const metadata = { title: "Tasks" };

const VIEWS = [
  { key: "mine", label: "Mine" }, { key: "open", label: "All open" }, { key: "overdue", label: "Overdue" }, { key: "deadlines", label: "Deadlines" }, { key: "done", label: "Done" },
];

export default async function Tasks({ searchParams }: { searchParams: Promise<{ view?: string; msg?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? sp.view! : "mine";
  const [tasks, matters, staff] = await Promise.all([listTasks(u, { view }), pickableMatters(u), staffList()]);
  return (
    <>
      <PageHeader title="Tasks & deadlines" sub="Tasks from the court diary, the service register and meeting minutes all arrive here" />
      <Flash msg={sp.msg} />
      <Chips active={view} items={VIEWS.map((v) => ({ ...v, href: `/portal/tasks?view=${v.key}` }))} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card pad={false}><TaskList tasks={tasks} back={`/portal/tasks?view=${view}`} /></Card>
        <Card title="Add a task"><TaskForm back={`/portal/tasks?view=${view}`} matters={matters} staff={staff} me={u.id} canAssign={can(u, "tasks.assign_others")} /></Card>
      </div>
    </>
  );
}
