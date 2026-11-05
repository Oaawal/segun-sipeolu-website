"use server";

import { redirect } from "next/navigation";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { getMessage, mailAccount, mailDefaults, saveMailAccount, sendMail, safeFileName, testAccount } from "@/lib/portal/mail";
import { resolveDestination, saveIncoming } from "@/lib/portal/intake";
import { str } from "@/lib/portal/format";

type State = { error?: string } | undefined;

export async function connectMail(_: State, fd: FormData): Promise<State> {
  const u = await requirePermission("mail.use");
  const d = mailDefaults();
  const address = (str(fd, "address", 254) || "").toLowerCase();
  const password = String(fd.get("password") || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address) || !password) return { error: "Enter your email address and its password." };
  const a = {
    user_id: u.id, address, username: str(fd, "username", 254) || address, password,
    imap_host: str(fd, "imap_host", 200) || d.imap_host, imap_port: Number(fd.get("imap_port") || d.imap_port), imap_secure: fd.get("imap_secure") !== "0",
    smtp_host: str(fd, "smtp_host", 200) || d.smtp_host, smtp_port: Number(fd.get("smtp_port") || d.smtp_port), smtp_secure: fd.get("smtp_secure") !== "0",
  };
  if (!a.imap_host || !a.smtp_host) return { error: "Enter the incoming (IMAP) and outgoing (SMTP) server names. Your email provider lists them." };
  try {
    await testAccount(a);
  } catch (err) {
    await audit({ userId: u.id, actor: u.email, action: "mail.connect_failed", entityType: "user", entityId: u.id, detail: { host: a.imap_host } });
    return { error: `The mail server did not accept these details: ${String((err as Error).message || err).slice(0, 160)}` };
  }
  await saveMailAccount(a);
  await audit({ userId: u.id, actor: u.email, action: "mail.connected", entityType: "user", entityId: u.id, detail: { address } });
  redirect("/portal/mail?msg=saved");
}

export async function disconnectMail() {
  const u = await requirePermission("mail.use");
  await q("DELETE FROM mail_accounts WHERE user_id = $1", [u.id]);
  await audit({ userId: u.id, actor: u.email, action: "mail.disconnected", entityType: "user", entityId: u.id });
  redirect("/portal/mail");
}

/** File an email (as .eml, which opens in Outlook) and, if chosen, its attachments, to a matter or the inbox. */
export async function fileMessage(fd: FormData) {
  const u = await requirePermission("mail.use");
  const a = await mailAccount(u.id);
  const folder = String(fd.get("folder") || "INBOX");
  const uid = Number(fd.get("uid"));
  const here = `/portal/mail/message?folder=${encodeURIComponent(folder)}&uid=${uid}`;
  if (!a || !Number.isInteger(uid)) redirect("/portal/mail");
  const dest = await resolveDestination(u, String(fd.get("destination") || "inbox"));
  if ("error" in dest) redirect(`${here}&msg=denied`);
  const m = await getMessage(a, folder, uid);
  if (!m) redirect("/portal/mail");
  const subject = m.mail.subject || "(no subject)";
  const picks = new Set(fd.getAll("att").map(Number));
  let n = 0;
  if (fd.get("email") === "1") {
    await saveIncoming(u, new File([new Uint8Array(m.raw)], `${safeFileName(subject, "email")}.eml`, { type: "message/rfc822" }), { destination: dest, source: "mailbox", title: `Email: ${subject}`, category: "correspondence" });
    n++;
  }
  for (const [i, att] of (m.mail.attachments || []).entries()) {
    if (!picks.has(i)) continue;
    const r = await saveIncoming(u, new File([new Uint8Array(att.content)], safeFileName(att.filename, `attachment-${i + 1}`), { type: att.contentType }), { destination: dest, source: "mailbox", category: "correspondence" });
    if (!("error" in r)) n++;
  }
  redirect(`${here}&msg=${n ? "mail_filed" : "invalid"}${dest.kind === "matter" ? `&to=${dest.matterId}` : ""}`);
}

export async function sendMessage(_: State, fd: FormData): Promise<State> {
  const u = await requirePermission("mail.use");
  const a = await mailAccount(u.id);
  if (!a) redirect("/portal/mail");
  const to = str(fd, "to", 2000);
  const subject = str(fd, "subject", 300) || "(no subject)";
  if (!to) return { error: "Add at least one recipient." };
  const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
  let size = 0;
  for (const f of fd.getAll("files")) {
    if (typeof f === "object" && f && "arrayBuffer" in f && f.size) {
      size += f.size;
      attachments.push({ filename: safeFileName(f.name, "attachment"), content: Buffer.from(await f.arrayBuffer()), contentType: f.type || undefined });
    }
  }
  // Forwarding: bring the original's attachments along
  const fwdUid = Number(fd.get("fwd_uid"));
  if (Number.isInteger(fwdUid) && fwdUid > 0) {
    const orig = await getMessage(a, String(fd.get("fwd_folder") || "INBOX"), fwdUid);
    for (const att of orig?.mail.attachments || []) {
      if (att.related) continue;
      size += att.size;
      attachments.push({ filename: safeFileName(att.filename, "attachment"), content: att.content, contentType: att.contentType });
    }
  }
  if (size > 20 * 1024 * 1024) return { error: "Attachments are larger than 20 MB, which most mail servers refuse." };
  let sent;
  try {
    sent = await sendMail(a, { to, cc: str(fd, "cc", 2000) || undefined, subject, text: String(fd.get("body") || ""), inReplyTo: str(fd, "in_reply_to", 500) || undefined, references: str(fd, "references", 2000) || undefined, attachments });
  } catch (err) {
    return { error: `The message was not sent: ${String((err as Error).message || err).slice(0, 160)}` };
  }
  await audit({ userId: u.id, actor: u.email, action: "mail.sent", entityType: "user", entityId: u.id, detail: { recipients: to.split(",").length, attachments: attachments.length } });
  const fileTo = String(fd.get("file_to") || "");
  if (fileTo && sent.raw) {
    const dest = await resolveDestination(u, fileTo);
    if (!("error" in dest)) await saveIncoming(u, new File([new Uint8Array(sent.raw)], `${safeFileName(subject, "email")}.eml`, { type: "message/rfc822" }), { destination: dest, source: "mailbox", title: `Sent email: ${subject}`, category: "correspondence" });
  }
  redirect("/portal/mail?msg=mail_sent");
}
