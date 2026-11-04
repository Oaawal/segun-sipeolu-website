import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { listDocuments, loadService, pickableMatters, staffList } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { daysUntil, dueLabel, fmtDateTime, fmtDay, isUuid } from "@/lib/portal/format";
import { SERVICE_KINDS, SERVICE_METHODS } from "@/lib/portal/vocab";
import { Badge, Card, DueBadge, Field, Flash, PageHeader, Select, TextArea, btn } from "@/components/portal/ui";
import { DocumentList, UploadForm } from "@/components/portal/Documents";
import { updateEntry } from "../actions";

export const metadata = { title: "Register entry" };

export default async function Entry({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const e = await loadService(u, id);
  if (!e) notFound();
  await audit({ userId: u.id, actor: u.email, action: "service.viewed", entityType: "service", entityId: e.id, matterId: e.matter_id });
  const [docs, staff, matters] = await Promise.all([listDocuments("service", e.id), staffList(), can(u, "service.edit") ? pickableMatters(u) : Promise.resolve([])]);
  const rows: [string, React.ReactNode][] = [
    ["Number", <strong key="n">{e.number}</strong>],
    ["What", SERVICE_KINDS[e.kind as keyof typeof SERVICE_KINDS]],
    [e.direction === "in" ? "Served by" : "Served on", e.party],
    ["How", SERVICE_METHODS[e.method as keyof typeof SERVICE_METHODS]],
    [e.direction === "in" ? "Received" : "Served", `${fmtDay(e.served_on)}${e.served_at ? ` at ${e.served_at}` : ""}`],
    [e.direction === "in" ? "Delivered by" : "Served by", e.served_by || "—"],
    [e.direction === "in" ? "Signed for by" : "Acknowledged by", e.received_by || "—"],
    ["Proof", e.proof || "—"],
    ["Matter", e.matter_id && u.role !== "front_desk" ? <Link key="m" href={`/portal/matters/${e.matter_id}`} className="font-semibold text-maroon hover:underline">{e.matter_number} · {e.matter_title}</Link> : e.matter_number || "Not linked"],
    ["Responsible", e.handler_name || "—"],
    ["Logged", `${fmtDateTime(e.created_at)} by ${e.creator_name || "—"}`],
  ];
  return (
    <>
      <PageHeader
        back={{ href: "/portal/register", label: "Service register" }}
        title={<span className="flex items-center gap-2">{e.direction === "in" ? <ArrowDownLeft className="h-6 w-6 text-maroon" /> : <ArrowUpRight className="h-6 w-6 text-green" />}{e.title}</span>}
        sub={<span className="flex flex-wrap items-center gap-2">{e.direction === "in" ? "Served on the firm" : "Served by the firm"} · {e.number} {e.status === "open" && e.response_due ? <DueBadge days={daysUntil(e.response_due)} label={`Response ${dueLabel(e.response_due).toLowerCase()}`} /> : <Badge tone={e.status === "open" ? "blue" : "green"}>{e.status}</Badge>}</span>}
      />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Record of service">
            <dl className="grid grid-cols-[minmax(110px,35%)_1fr] gap-x-4 gap-y-2.5 text-sm">
              {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-stone-500">{k}</dt><dd className="min-w-0 break-words text-stone-800">{v}</dd></div>))}
            </dl>
            {e.notes && <div className="mt-4 whitespace-pre-line rounded-lg bg-cream p-3 text-sm">{e.notes}</div>}
          </Card>
          <Card title="Scans and attachments" pad={false}>
            <DocumentList docs={docs} ownerType="service" ownerId={e.id} canRemove={u.role !== "front_desk"} canUpload />
            <div className="border-t border-stone-100 p-5"><UploadForm ownerType="service" ownerId={e.id} /></div>
          </Card>
        </div>
        {can(u, "service.edit") && (
          <Card title="Action">
            <form action={updateEntry} className="space-y-4">
              <input type="hidden" name="id" value={e.id} />
              <Select label="Status" name="status" options={{ open: "Open: needs action", actioned: "Actioned: responded or complied", filed: "Filed: no action needed" }} defaultValue={e.status} />
              <Field label="Response due" name="response_due" type="date" defaultValue={e.response_due || ""} />
              <Select label="Responsible" name="handled_by" options={staff.filter((s) => s.role !== "front_desk").map((s) => [s.id, s.full_name])} blank="Nobody" defaultValue={e.handled_by || ""} />
              <Select label="Matter" name="matter_id" options={matters.map((m) => [m.id, `${m.number} · ${m.title}`])} blank={e.matter_id ? "Keep current" : "Not linked"} defaultValue={e.matter_id && matters.some((m) => m.id === e.matter_id) ? e.matter_id : ""} />
              <Field label="Proof" name="proof" defaultValue={e.proof || ""} />
              <TextArea label="Notes" name="notes" defaultValue={e.notes || ""} rows={3} />
              <button className={btn.primary}>Save</button>
              <p className="text-xs text-stone-500">Marking it actioned or filed also closes its deadline task.</p>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
