import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { addrText, getMessage, mailAccount } from "@/lib/portal/mail";
import { pickableMatters } from "@/lib/portal/data";
import { fmtDateTime } from "@/lib/portal/format";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Card, Field, PageHeader, TextArea, btn, inputCls } from "@/components/portal/ui";
import { sendMessage } from "../actions";

export const metadata = { title: "New email" };

export default async function Compose({ searchParams }: { searchParams: Promise<{ mode?: string; folder?: string; uid?: string; to?: string }> }) {
  const u = await requirePermission("mail.use");
  const sp = await searchParams;
  const a = await mailAccount(u.id);
  if (!a) redirect("/portal/mail");
  let to = sp.to || "", cc = "", subject = "", body = "", inReplyTo = "", references = "", fwd: { folder: string; uid: number } | null = null;
  const uid = Number(sp.uid);
  if (sp.mode && Number.isInteger(uid)) {
    const o = await getMessage(a, sp.folder || "INBOX", uid).catch(() => null);
    if (o) {
      const m = o.mail;
      const quoted = (m.text || "").split("\n").map((l) => `> ${l}`).join("\n");
      const head = `On ${m.date ? fmtDateTime(m.date.toISOString()) : ""}, ${addrText(m.from)} wrote:`;
      if (sp.mode === "forward") {
        subject = /^fwd?:/i.test(m.subject || "") ? m.subject! : `Fwd: ${m.subject || ""}`;
        body = `\n\n---------- Forwarded message ----------\nFrom: ${addrText(m.from)}\nDate: ${m.date ? fmtDateTime(m.date.toISOString()) : ""}\nSubject: ${m.subject || ""}\nTo: ${addrText(m.to)}\n\n${m.text || ""}`;
        fwd = { folder: sp.folder || "INBOX", uid };
      } else {
        to = m.replyTo ? addrText(m.replyTo) : addrText(m.from);
        if (sp.mode === "all") {
          const me = a.address.toLowerCase();
          cc = [addrText(m.to), addrText(m.cc)].join(", ").split(",").map((s) => s.trim()).filter((s) => s && !s.toLowerCase().includes(me)).join(", ");
        }
        subject = /^re:/i.test(m.subject || "") ? m.subject! : `Re: ${m.subject || ""}`;
        body = `\n\n${head}\n${quoted}`;
        inReplyTo = m.messageId || "";
        references = [typeof m.references === "string" ? m.references : (m.references || []).join(" "), m.messageId].filter(Boolean).join(" ");
      }
    }
  }
  const matters = u.role === "front_desk" ? [] : await pickableMatters(u);
  return (
    <>
      <PageHeader back={{ href: "/portal/mail", label: "Mailbox" }} title={sp.mode === "forward" ? "Forward" : sp.mode ? "Reply" : "New email"} sub={`From ${a.address}`} />
      <Card>
        <ActionForm action={sendMessage} className="grid gap-4">
          <input type="hidden" name="in_reply_to" value={inReplyTo} /><input type="hidden" name="references" value={references} />
          {fwd && <><input type="hidden" name="fwd_folder" value={fwd.folder} /><input type="hidden" name="fwd_uid" value={fwd.uid} /></>}
          <Field label="To" name="to" required defaultValue={to} placeholder="Separate several addresses with commas" />
          <Field label="Cc" name="cc" defaultValue={cc} />
          <Field label="Subject" name="subject" defaultValue={subject} />
          <TextArea label="Message" name="body" rows={14} defaultValue={body} autoFocus />
          <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Attach files{fwd ? " (the original attachments are included)" : ""}</span><input type="file" name="files" multiple className={inputCls} /></label>
          <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Also file a copy on a matter</span>
            <select name="file_to" className={inputCls} defaultValue=""><option value="">No</option>{matters.map((x) => <option key={x.id} value={x.id}>{x.number} · {x.title}</option>)}</select></label>
          <div><SubmitButton className={btn.primary} pending="Sending…"><Send className="h-4 w-4" />Send</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
