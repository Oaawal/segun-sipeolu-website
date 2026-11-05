import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FolderInput, Forward, ImageIcon, Paperclip, Reply, ReplyAll } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { addrText, getMessage, mailAccount } from "@/lib/portal/mail";
import { pickableMatters } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { fmtDateTime, fmtSize } from "@/lib/portal/format";
import { Card, Flash, Note, PageHeader, btn, inputCls } from "@/components/portal/ui";
import { fileMessage } from "../actions";

export const metadata = { title: "Email" };

export default async function MessagePage({ searchParams }: { searchParams: Promise<{ folder?: string; uid?: string; msg?: string; to?: string; images?: string }> }) {
  const u = await requirePermission("mail.use");
  const sp = await searchParams;
  const a = await mailAccount(u.id);
  if (!a) redirect("/portal/mail");
  const folder = sp.folder || "INBOX";
  const uid = Number(sp.uid);
  if (!Number.isInteger(uid)) redirect("/portal/mail");
  const m = await getMessage(a, folder, uid).catch(() => null);
  if (!m) return <Card><Note tone="warn">This email could not be opened. It may have been moved or deleted.</Note><Link href="/portal/mail" className={`${btn.ghost} mt-4`}>Back to mailbox</Link></Card>;
  await audit({ userId: u.id, actor: u.email, action: "mail.read", entityType: "user", entityId: u.id });
  const mail = m.mail;
  const atts = (mail.attachments || []).map((x, i) => ({ ...x, i })).filter((x) => !x.related);
  const matters = u.role === "front_desk" ? [] : await pickableMatters(u);
  const q = `folder=${encodeURIComponent(folder)}&uid=${uid}`;
  const remote = /<img[^>]+src=["']?https?:/i.test(mail.html || "");
  return (
    <>
      <PageHeader back={{ href: `/portal/mail?folder=${encodeURIComponent(folder)}`, label: "Mailbox" }} title={mail.subject || "(no subject)"}
        actions={<>
          <Link href={`/portal/mail/compose?mode=reply&${q}`} className={btn.ghost}><Reply className="h-4 w-4" />Reply</Link>
          <Link href={`/portal/mail/compose?mode=all&${q}`} className={btn.ghost}><ReplyAll className="h-4 w-4" />Reply all</Link>
          <Link href={`/portal/mail/compose?mode=forward&${q}`} className={btn.ghost}><Forward className="h-4 w-4" />Forward</Link>
        </>} />
      <Flash msg={sp.msg} />
      {sp.msg === "mail_filed" && sp.to && <div className="-mt-3 mb-5 text-sm"><Link href={`/portal/matters/${sp.to}?tab=documents`} className="font-semibold text-maroon underline">Open the matter</Link></div>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card pad={false}>
          <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-stone-100 px-5 py-4 text-sm">
            <dt className="text-stone-500">From</dt><dd className="break-words font-medium">{addrText(mail.from)}</dd>
            <dt className="text-stone-500">To</dt><dd className="break-words">{addrText(mail.to)}</dd>
            {mail.cc && <><dt className="text-stone-500">Cc</dt><dd className="break-words">{addrText(mail.cc)}</dd></>}
            <dt className="text-stone-500">Date</dt><dd>{mail.date ? fmtDateTime(mail.date.toISOString()) : "—"}</dd>
          </dl>
          {remote && !sp.images && <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-cream/60 px-5 py-2 text-xs text-stone-600"><span className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />Pictures from the internet are hidden, so the sender cannot tell you opened it.</span><Link href={`/portal/mail/message?${q}&images=1`} className="font-semibold text-maroon">Show</Link></div>}
          <iframe title="Email" sandbox="allow-popups allow-popups-to-escape-sandbox" src={`/portal-mail/body?${q}${sp.images ? "&images=1" : ""}`} className="h-[65vh] w-full rounded-b-2xl bg-white" />
        </Card>
        <div className="space-y-6">
          {atts.length > 0 && (
            <Card title={`Attachments (${atts.length})`} pad={false}>
              {atts.map((x) => (
                <div key={x.i} className="flex items-center gap-3 border-t border-stone-100 px-5 py-2.5 first:border-t-0 text-sm">
                  <Paperclip className="h-4 w-4 flex-none text-maroon" />
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{x.filename || `Attachment ${x.i + 1}`}</div><div className="text-xs text-stone-500">{fmtSize(x.size)}</div></div>
                  <a href={`/portal/api/mail/attachment?${q}&i=${x.i}`} className={btn.small}><Download className="h-3.5 w-3.5" /></a>
                </div>
              ))}
            </Card>
          )}
          <Card title="File to the portal">
            <form action={fileMessage} className="space-y-3">
              <input type="hidden" name="folder" value={folder} /><input type="hidden" name="uid" value={uid} />
              <select name="destination" className={inputCls} defaultValue="inbox" aria-label="Where to file">
                <option value="inbox">My portal inbox</option>
                {matters.map((x) => <option key={x.id} value={x.id}>{x.number} · {x.title}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" value="1" defaultChecked className="h-4 w-4 accent-maroon" />The email itself (opens in Outlook)</label>
              {atts.map((x) => <label key={x.i} className="flex items-center gap-2 text-sm"><input type="checkbox" name="att" value={x.i} defaultChecked className="h-4 w-4 accent-maroon" /><span className="truncate">{x.filename || `Attachment ${x.i + 1}`}</span></label>)}
              <button className={btn.primary}><FolderInput className="h-4 w-4" />File</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
