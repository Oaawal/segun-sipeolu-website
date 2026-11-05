import Link from "next/link";
import { Archive, FileText, Inbox, Mail, Paperclip, PenSquare, Search, Send, Star, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { folders as listFolders, listMessages, mailAccount, mailDefaults, type Folder } from "@/lib/portal/mail";
import { intakeAddress, intakeEnabled } from "@/lib/portal/mail-intake";
import { ago } from "@/lib/portal/format";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Card, Empty, Field, Flash, Note, PageHeader, btn, inputCls } from "@/components/portal/ui";
import { connectMail, disconnectMail } from "./actions";

export const metadata = { title: "Mailbox" };

const FOLDER_ICON: Record<string, React.ReactNode> = {
  "\\Inbox": <Inbox className="h-4 w-4" />, "\\Sent": <Send className="h-4 w-4" />, "\\Drafts": <FileText className="h-4 w-4" />,
  "\\Archive": <Archive className="h-4 w-4" />, "\\Trash": <Trash2 className="h-4 w-4" />, "\\Flagged": <Star className="h-4 w-4" />,
};

function ConnectForm({ defaults }: { defaults: ReturnType<typeof mailDefaults> }) {
  const preset = !!defaults.imap_host && !!defaults.smtp_host;
  return (
    <ActionForm action={connectMail} className="grid gap-4 sm:grid-cols-2">
      <Field label="Your email address" name="address" type="email" required autoComplete="email" className="sm:col-span-2" placeholder="you@segunsipeolu.com" />
      <Field label="Email password" name="password" type="password" required autoComplete="current-password" className="sm:col-span-2" hint="If your provider uses two-step sign-in (Google, Microsoft), create an app password and use that." />
      <details className="sm:col-span-2" open={!preset}>
        <summary className="cursor-pointer text-sm font-semibold text-maroon">Server settings{preset ? " (already filled in by the firm)" : ""}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Incoming server (IMAP)" name="imap_host" defaultValue={defaults.imap_host} placeholder="mail.segunsipeolu.com" />
          <Field label="IMAP port" name="imap_port" defaultValue={String(defaults.imap_port)} inputMode="numeric" hint="993 (SSL) or 143" />
          <label className="text-sm"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">IMAP security</span><select name="imap_secure" defaultValue={defaults.imap_port === 143 ? "0" : "1"} className={inputCls}><option value="1">SSL/TLS (port 993)</option><option value="0">STARTTLS or none (port 143)</option></select></label>
          <div className="hidden sm:block" />
          <Field label="Outgoing server (SMTP)" name="smtp_host" defaultValue={defaults.smtp_host} placeholder="mail.segunsipeolu.com" />
          <Field label="SMTP port" name="smtp_port" defaultValue={String(defaults.smtp_port)} inputMode="numeric" hint="465 (SSL) or 587 (STARTTLS)" />
          <label className="text-sm"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">SMTP security</span><select name="smtp_secure" defaultValue={defaults.smtp_port === 587 ? "0" : "1"} className={inputCls}><option value="1">SSL/TLS (port 465)</option><option value="0">STARTTLS (port 587)</option></select></label>
          <Field label="Username (if not your address)" name="username" />
        </div>
      </details>
      <div className="sm:col-span-2"><SubmitButton className={btn.primary} pending="Checking the mail server…">Connect my mailbox</SubmitButton></div>
    </ActionForm>
  );
}

export default async function MailPage({ searchParams }: { searchParams: Promise<{ folder?: string; page?: string; q?: string; msg?: string }> }) {
  const u = await requirePermission("mail.use");
  const sp = await searchParams;
  const account = await mailAccount(u.id);
  if (!account) {
    return (
      <>
        <PageHeader title="Mailbox" sub="Read and send your firm email here, and file any email or attachment to a matter in one click" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card title="Connect your mailbox"><ConnectForm defaults={mailDefaults()} /></Card>
          <div className="space-y-4">
            <Note tone="lock">Your password is encrypted and used only by the portal&apos;s server to fetch and send your email. Nobody else, the Managing Partner included, can open your mailbox here.</Note>
            {intakeEnabled() && <Note tone="info">You can also forward any email to <strong>{intakeAddress()}</strong>: it lands in your portal Inbox. Put the matter number in the subject, e.g. [SSA/LIT/2026/0001], to file it straight onto the matter.</Note>}
          </div>
        </div>
      </>
    );
  }

  const folder = sp.folder || "INBOX";
  const page = Math.max(1, Number(sp.page) || 1);
  const term = (sp.q || "").trim().slice(0, 100);
  let boxes: Folder[] = [];
  let list: Awaited<ReturnType<typeof listMessages>> | null = null;
  let error = "";
  try {
    [boxes, list] = await Promise.all([listFolders(account), listMessages(account, folder, page, term)]);
  } catch (err) {
    error = String((err as Error).message || err).slice(0, 200);
  }
  const href = (o: Record<string, string | number>) => `/portal/mail?${new URLSearchParams({ folder, ...(term ? { q: term } : {}), ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;

  return (
    <>
      <PageHeader title="Mailbox" sub={account.address} actions={<Link href="/portal/mail/compose" className={btn.primary}><PenSquare className="h-4 w-4" />New email</Link>} />
      <Flash msg={sp.msg} />
      {error ? (
        <Card>
          <Note tone="danger">The mail server could not be reached: {error}</Note>
          <p className="mt-3 text-sm text-stone-600">If you changed your email password, connect again.</p>
          <form action={disconnectMail} className="mt-3"><button className={btn.ghost}>Reconnect with new details</button></form>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col [scrollbar-width:none]">
            {boxes.map((b) => (
              <Link key={b.path} href={`/portal/mail?folder=${encodeURIComponent(b.path)}`} className={`flex flex-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${b.path === folder ? "bg-maroon text-white" : "text-stone-700 hover:bg-white"}`}>
                {FOLDER_ICON[b.special || ""] || <Mail className="h-4 w-4" />}<span className="flex-1 truncate">{b.name}</span>{!!b.unseen && <span className={`text-xs font-bold ${b.path === folder ? "text-gold" : "text-maroon"}`}>{b.unseen}</span>}
              </Link>
            ))}
            <form action={disconnectMail} className="mt-4 hidden lg:block"><button className="px-3 text-xs text-stone-400 hover:text-red-700">Disconnect mailbox</button></form>
          </nav>
          <div className="min-w-0">
            <form className="relative mb-4">
              <input type="hidden" name="folder" value={folder} />
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input name="q" type="search" defaultValue={term} placeholder="Search this folder" className={`${inputCls} pl-9`} />
            </form>
            <Card pad={false}>
              {!list || list.items.length === 0 ? <Empty icon={<Mail className="h-8 w-8" />} title={term ? "No emails match" : "No emails here"} /> : list.items.map((m) => (
                <Link key={m.uid} href={`/portal/mail/message?folder=${encodeURIComponent(folder)}&uid=${m.uid}`} className="flex items-start gap-3 border-t border-stone-100 px-5 py-3 first:border-t-0 hover:bg-cream/60">
                  <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${m.seen ? "bg-transparent" : "bg-maroon"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3"><span className={`truncate text-sm ${m.seen ? "text-stone-700" : "font-semibold text-stone-900"}`}>{m.from}</span><span className="flex-none text-xs text-stone-400">{m.date ? ago(m.date) : ""}</span></div>
                    <div className={`flex items-center gap-1.5 truncate text-sm ${m.seen ? "text-stone-500" : "font-medium text-stone-800"}`}>{m.hasAttachments && <Paperclip className="h-3.5 w-3.5 flex-none text-stone-400" />}{m.flagged && <Star className="h-3.5 w-3.5 flex-none text-gold" />}<span className="truncate">{m.subject}</span></div>
                  </div>
                </Link>
              ))}
            </Card>
            {list && list.pages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
                <span>Page {page} of {list.pages} · {list.total} emails</span>
                <div className="flex gap-2">{page > 1 && <Link href={href({ page: page - 1 })} className={btn.small}>Newer</Link>}{page < list.pages && <Link href={href({ page: page + 1 })} className={btn.small}>Older</Link>}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
