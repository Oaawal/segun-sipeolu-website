import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import { one, q } from "./db";
import { decrypt, encrypt } from "./crypto";

/**
 * Each person's own firm mailbox, inside the portal (IMAP to read, SMTP to
 * send). The password is stored encrypted with APP_SECRET and only ever used
 * on the server; nobody else, the administrator included, can open another
 * person's mailbox through the portal.
 *
 * Server defaults (so staff only type their address and password):
 *   MAIL_IMAP_HOST, MAIL_IMAP_PORT (993), MAIL_SMTP_HOST, MAIL_SMTP_PORT (465)
 */

export interface MailAccount {
  user_id: string; address: string; username: string; password: string;
  imap_host: string; imap_port: number; imap_secure: boolean;
  smtp_host: string; smtp_port: number; smtp_secure: boolean;
}

export const mailDefaults = () => ({
  imap_host: process.env.MAIL_IMAP_HOST || "", imap_port: Number(process.env.MAIL_IMAP_PORT || 993),
  smtp_host: process.env.MAIL_SMTP_HOST || "", smtp_port: Number(process.env.MAIL_SMTP_PORT || 465),
});

export async function mailAccount(userId: string): Promise<MailAccount | null> {
  const r = await one<Omit<MailAccount, "password"> & { password_enc: string }>("SELECT * FROM mail_accounts WHERE user_id = $1", [userId]);
  if (!r) return null;
  return { ...r, password: decrypt(r.password_enc, "mail") };
}

export async function saveMailAccount(a: MailAccount) {
  await q(
    `INSERT INTO mail_accounts (user_id, address, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, username, password_enc, last_ok_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (user_id) DO UPDATE SET address=$2, imap_host=$3, imap_port=$4, imap_secure=$5, smtp_host=$6, smtp_port=$7, smtp_secure=$8, username=$9, password_enc=$10, last_ok_at=now(), last_error=NULL`,
    [a.user_id, a.address, a.imap_host, a.imap_port, a.imap_secure, a.smtp_host, a.smtp_port, a.smtp_secure, a.username, encrypt(a.password, "mail")],
  );
}

function client(a: Pick<MailAccount, "imap_host" | "imap_port" | "imap_secure" | "username" | "password">) {
  return new ImapFlow({
    host: a.imap_host, port: a.imap_port, secure: a.imap_secure, auth: { user: a.username, pass: a.password },
    logger: false, socketTimeout: 60_000, greetingTimeout: 15_000, connectionTimeout: 15_000,
    tls: { rejectUnauthorized: process.env.MAIL_TLS_INSECURE !== "1" },
  });
}

export async function withImap<T>(a: Pick<MailAccount, "imap_host" | "imap_port" | "imap_secure" | "username" | "password">, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const c = client(a);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.logout().catch(() => c.close());
  }
}

export function smtp(a: MailAccount) {
  return nodemailer.createTransport({
    host: a.smtp_host, port: a.smtp_port, secure: a.smtp_secure, auth: { user: a.username, pass: a.password },
    tls: { rejectUnauthorized: process.env.MAIL_TLS_INSECURE !== "1" }, connectionTimeout: 15_000,
  });
}

/** Check both servers accept the details before saving them. */
export async function testAccount(a: MailAccount) {
  await withImap(a, async (c) => { await c.list(); });
  await smtp(a).verify();
}

export interface Folder { path: string; name: string; special: string | null; unseen?: number }

const SPECIAL_ORDER = ["\\Inbox", "\\Drafts", "\\Sent", "\\Archive", "\\Junk", "\\Trash"];

export async function folders(a: MailAccount): Promise<Folder[]> {
  return withImap(a, async (c) => {
    const list = await c.list({ statusQuery: { unseen: true } });
    return list
      .filter((f) => !f.flags?.has("\\Noselect"))
      .map((f) => ({ path: f.path, name: f.path === "INBOX" ? "Inbox" : f.name, special: f.path === "INBOX" ? "\\Inbox" : (f.specialUse || null), unseen: f.status?.unseen }))
      .sort((x, y) => {
        const a1 = x.special ? SPECIAL_ORDER.indexOf(x.special) : 99, b1 = y.special ? SPECIAL_ORDER.indexOf(y.special) : 99;
        return a1 - b1 || x.name.localeCompare(y.name);
      });
  });
}

export interface ListItem { uid: number; subject: string; from: string; fromAddress: string; date: string | null; seen: boolean; flagged: boolean; size: number; hasAttachments: boolean }

const PAGE = 40;

export async function listMessages(a: MailAccount, path: string, page = 1, search = ""): Promise<{ items: ListItem[]; total: number; pages: number }> {
  return withImap(a, async (c) => {
    const lock = await c.getMailboxLock(path, { readOnly: true });
    try {
      const box = c.mailbox;
      if (!box || !box.exists) return { items: [], total: 0, pages: 0 };
      let uids: number[];
      if (search) {
        const found = await c.search({ or: [{ subject: search }, { from: search }, { to: search }, { body: search }] }, { uid: true });
        uids = (found || []).sort((x, y) => y - x);
      } else {
        const all = await c.search({ all: true }, { uid: true });
        uids = (all || []).sort((x, y) => y - x);
      }
      const total = uids.length;
      const slice = uids.slice((page - 1) * PAGE, page * PAGE);
      const items: ListItem[] = [];
      if (slice.length) {
        for await (const m of c.fetch(slice.join(","), { uid: true, envelope: true, flags: true, size: true, internalDate: true, bodyStructure: true }, { uid: true })) {
          const from = m.envelope?.from?.[0];
          const parts = JSON.stringify(m.bodyStructure || {});
          items.push({
            uid: m.uid, subject: m.envelope?.subject || "(no subject)", from: from?.name || from?.address || "", fromAddress: from?.address || "",
            date: (m.envelope?.date || m.internalDate)?.toString() ? new Date(m.envelope?.date || (m.internalDate as Date)).toISOString() : null,
            seen: !!m.flags?.has("\\Seen"), flagged: !!m.flags?.has("\\Flagged"), size: m.size || 0, hasAttachments: /"disposition":"attachment"/i.test(parts),
          });
        }
      }
      items.sort((x, y) => y.uid - x.uid);
      return { items, total, pages: Math.ceil(total / PAGE) };
    } finally {
      lock.release();
    }
  });
}

/** The raw message (RFC 822) and its parsed form. Marks it read. */
export async function getMessage(a: MailAccount, path: string, uid: number): Promise<{ raw: Buffer; mail: ParsedMail } | null> {
  return withImap(a, async (c) => {
    const lock = await c.getMailboxLock(path);
    try {
      const dl = await c.download(String(uid), undefined, { uid: true });
      if (!dl || !("content" in dl) || !dl.content) return null;
      const chunks: Buffer[] = [];
      for await (const ch of dl.content) chunks.push(Buffer.from(ch));
      const raw = Buffer.concat(chunks);
      await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
      return { raw, mail: await simpleParser(raw) };
    } finally {
      lock.release();
    }
  });
}

export function addrText(a: AddressObject | AddressObject[] | undefined) {
  if (!a) return "";
  return (Array.isArray(a) ? a : [a]).map((x) => x.text).join(", ");
}

/** Send, then keep a copy in the Sent folder (most servers do not do this for SMTP). */
export async function sendMail(a: MailAccount, m: { to: string; cc?: string; subject: string; text: string; inReplyTo?: string; references?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }) {
  let raw: Buffer | null = null;
  const info = await smtp(a).sendMail({
    from: a.address, to: m.to, cc: m.cc || undefined, subject: m.subject, text: m.text,
    inReplyTo: m.inReplyTo, references: m.references, attachments: m.attachments,
  });
  try {
    raw = await new Promise<Buffer>((resolve, reject) => {
      const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
      composer.sendMail({ from: a.address, to: m.to, cc: m.cc || undefined, subject: m.subject, text: m.text, inReplyTo: m.inReplyTo, references: m.references, attachments: m.attachments, messageId: info.messageId },
        (err, out) => (err ? reject(err) : resolve(out.message as Buffer)));
    });
    await withImap(a, async (c) => {
      const sent = (await c.list()).find((f) => f.specialUse === "\\Sent")?.path || "Sent";
      await c.append(sent, raw!, ["\\Seen"]).catch(() => {});
    });
  } catch {
    /* the message was sent; a missing copy in Sent is not worth failing for */
  }
  return { messageId: info.messageId as string, raw };
}

export function safeFileName(name: string | undefined, fallback: string) {
  return (name || fallback).replace(/[\\/\r\n"<>:|?*]/g, "_").slice(-150) || fallback;
}
