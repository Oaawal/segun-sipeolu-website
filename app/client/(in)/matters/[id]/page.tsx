import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText, Gavel, Paperclip, Send } from "lucide-react";
import { requireClient, clientMatter } from "@/lib/portal/client-auth";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { fmtDateTime, fmtDay, fmtSize, isUuid } from "@/lib/portal/format";
import { MATTER_STATUS } from "@/lib/portal/vocab";
import { Badge, Card, Empty, Note, Row, btn, inputCls } from "@/components/portal/ui";
import { clientPost } from "../../../actions";

export const metadata = { title: "Matter" };

export default async function ClientMatterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const c = await requireClient();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const m = await clientMatter(c, id);
  if (!m) notFound();
  const [hearings, docs, messages, sigs] = await Promise.all([
    q<{ id: string; sitting_on: string; sitting_time: string | null; court: string; business: string; status: string }>(
      "SELECT id, sitting_on, sitting_time, court, business, status FROM hearings WHERE matter_id = $1 ORDER BY sitting_on DESC LIMIT 30", [m.id]),
    q<{ id: string; title: string; file_name: string; size_bytes: number; uploaded_at: string; from_client: boolean }>(
      "SELECT id, title, file_name, size_bytes, uploaded_at, from_client FROM documents WHERE matter_id = $1 AND owner_type = 'matter' AND shared_with_client AND deleted_at IS NULL ORDER BY uploaded_at DESC", [m.id]),
    q<{ id: string; from_client: boolean; body: string; created_at: string; author: string | null; document_id: string | null }>(
      `SELECT x.id, x.from_client, x.body, x.created_at, COALESCE(cu.full_name, u.full_name) AS author, x.document_id
       FROM client_messages x LEFT JOIN client_users cu ON cu.id = x.client_user_id LEFT JOIN users u ON u.id = x.staff_user_id WHERE x.matter_id = $1 ORDER BY x.created_at`, [m.id]),
    q<{ id: string; status: string; title: string; created_at: string }>(
      "SELECT s.id, s.status, d.title, s.created_at FROM signature_requests s JOIN documents d ON d.id = s.document_id WHERE s.matter_id = $1 AND s.status = 'sent' AND s.expires_at > now() AND lower(s.signer_email) = lower($2)", [m.id, c.email]),
  ]);
  await q("UPDATE client_messages SET read_at = now() WHERE matter_id = $1 AND NOT from_client AND read_at IS NULL", [m.id]);
  await audit({ actor: `client:${c.email}`, action: "client.matter_viewed", entityType: "matter", entityId: m.id, matterId: m.id });
  const upcoming = hearings.filter((h) => h.status === "scheduled" && h.sitting_on >= new Date().toISOString().slice(0, 10)).reverse();
  return (
    <>
      <Link href="/client" className="text-sm text-stone-500 hover:text-maroon">← Your matters</Link>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-maroon-dark">{m.title}</h1>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">{m.number}<Badge tone={m.status === "closed" ? "grey" : "green"}>{MATTER_STATUS[m.status as keyof typeof MATTER_STATUS]}</Badge>{m.partner_name && <span>· Partner: {m.partner_name}</span>}</div>
      {sp.msg === "sent" && <div className="mt-4"><Note tone="ok">Sent. Your lawyer has been told.</Note></div>}
      {sp.msg === "file" && <div className="mt-4"><Note tone="danger">That file could not be sent. Check its type and size.</Note></div>}
      {sigs.length > 0 && <div className="mt-4"><Note tone="warn">A document is waiting for your signature: {sigs.map((s) => s.title).join(", ")}. Use the signing link we emailed you.</Note></div>}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Messages">
            {messages.length === 0 ? <p className="text-sm text-stone-500">No messages yet. Write to your lawyer below.</p> : (
              <ol className="space-y-3">
                {messages.map((x) => (
                  <li key={x.id} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${x.from_client ? "ml-auto bg-maroon text-white" : "bg-cream text-stone-800"}`}>
                    <div className="whitespace-pre-line">{x.body}</div>
                    {x.document_id && <a href={`/client/files/${x.document_id}`} className={`mt-1 flex items-center gap-1 text-xs font-semibold ${x.from_client ? "text-gold" : "text-maroon"}`}><Paperclip className="h-3 w-3" />Attached document</a>}
                    <div className={`mt-1 text-[11px] ${x.from_client ? "text-white/60" : "text-stone-400"}`}>{x.author || (x.from_client ? "You" : "The firm")} · {fmtDateTime(x.created_at)}</div>
                  </li>
                ))}
              </ol>
            )}
            <form action={clientPost} className="mt-5 space-y-3 border-t border-stone-100 pt-4">
              <input type="hidden" name="matter_id" value={m.id} />
              <textarea name="body" rows={3} className={inputCls} placeholder="Write to your lawyer…" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600"><Paperclip className="h-4 w-4" /><input type="file" name="file" className="max-w-[220px] text-xs" /></label>
                <button className={btn.primary}><Send className="h-4 w-4" />Send</button>
              </div>
            </form>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Court dates" pad={false}>
            {hearings.length === 0 ? <Empty icon={<Gavel className="h-8 w-8" />} title="No court dates" /> : (
              <>
                {upcoming.map((h) => <Row key={h.id}><Gavel className="h-4 w-4 flex-none text-maroon" /><div className="min-w-0 flex-1"><div className="font-medium">{fmtDay(h.sitting_on, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}{h.sitting_time ? ` · ${h.sitting_time}` : ""}</div><div className="text-xs text-stone-500">{h.business} · {h.court}</div></div><Badge tone="blue">Coming up</Badge></Row>)}
                {hearings.filter((h) => !upcoming.includes(h)).slice(0, 8).map((h) => <Row key={h.id}><div className="min-w-0 flex-1"><div className="text-sm text-stone-700">{fmtDay(h.sitting_on)} · {h.business}</div><div className="text-xs text-stone-400">{h.court}</div></div></Row>)}
              </>
            )}
          </Card>
          <Card title="Documents" pad={false}>
            {docs.length === 0 ? <Empty icon={<FileText className="h-8 w-8" />} title="No documents shared yet" /> : docs.map((d) => (
              <Row key={d.id}>
                <FileText className="h-4 w-4 flex-none text-maroon" />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{d.title}</div><div className="text-xs text-stone-500">{d.from_client ? "From you" : "From the firm"} · {fmtDay(d.uploaded_at)} · {fmtSize(Number(d.size_bytes))}</div></div>
                <a href={`/client/files/${d.id}?download=1`} aria-label="Download" className="p-1 text-stone-400 hover:text-maroon"><Download className="h-4 w-4" /></a>
              </Row>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
