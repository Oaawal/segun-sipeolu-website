import Link from "next/link";
import { Mic, Plus } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { listMeetings } from "@/lib/portal/data";
import { fmtDay } from "@/lib/portal/format";
import { MEETING_KINDS, MEETING_STATUS as STATUS } from "@/lib/portal/vocab";
import { Badge, Card, Empty, Flash, PageHeader, Row  , btn } from "@/components/portal/ui";

export const metadata = { title: "Meetings & minutes" };

export default async function Meetings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const u = await requirePermission("meetings.use");
  const sp = await searchParams;
  const rows = await listMeetings(u);
  return (
    <>
      <PageHeader title="Meetings & minutes" sub="Record a meeting, get a transcript with speakers, and AI-drafted minutes with action items" actions={<Link href="/portal/meetings/new" className={btn.primary}><Plus className="h-4 w-4" />New meeting</Link>} />
      <Flash msg={sp.msg} />
      <Card pad={false}>
        {rows.length === 0 ? <Empty icon={<Mic className="h-8 w-8" />} title="No meetings yet" text="Start one before a client meeting, record it on your phone or laptop, and the minutes will be waiting when you finish." /> : rows.map((m) => (
          <Row key={m.id} href={`/portal/meetings/${m.id}`}>
            <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-maroon/10 text-maroon"><Mic className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-stone-800">{m.title}</div>
              <div className="truncate text-sm text-stone-500">{fmtDay(m.held_on)} · {MEETING_KINDS[m.kind as keyof typeof MEETING_KINDS]}{m.matter_number ? ` · ${m.matter_number}` : ""}</div>
            </div>
            <Badge tone={STATUS[m.status]?.[1]}>{STATUS[m.status]?.[0]}</Badge>
          </Row>
        ))}
      </Card>
    </>
  );
}
