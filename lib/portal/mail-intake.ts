import "server-only";
import { simpleParser } from "mailparser";
import { one, q } from "./db";
import { audit } from "./audit";
import { withImap } from "./mail";
import { resolveDestination, saveIncoming, type Destination } from "./intake";
import type { Actor } from "./permissions";

/**
 * The portal's own address (e.g. portal@segunsipeolu.com). Staff forward or
 * send email there and it lands in their portal Inbox: the email itself
 * (.eml) and each attachment. A matter number in the subject, in square
 * brackets, files it straight onto that matter, e.g.
 *   "Fwd: Hearing notice [SSA/LIT/2026/0001]"
 *
 * Only messages from an active staff address are accepted, and only when the
 * receiving server confirmed the sender (SPF or DKIM pass in the
 * Authentication-Results header), so nobody can drop files into a colleague's
 * inbox by faking the From line. Everything else is moved to "Rejected".
 *
 *   PORTAL_INTAKE_IMAP_HOST, PORTAL_INTAKE_IMAP_PORT (993),
 *   PORTAL_INTAKE_USER, PORTAL_INTAKE_PASSWORD
 */

export function intakeEnabled() {
  return !!(process.env.PORTAL_INTAKE_IMAP_HOST && process.env.PORTAL_INTAKE_USER && process.env.PORTAL_INTAKE_PASSWORD);
}

export function intakeAddress() {
  return process.env.PORTAL_INTAKE_ADDRESS || process.env.PORTAL_INTAKE_USER || "";
}

function senderVerified(headers: Map<string, unknown>, address: string) {
  if (process.env.PORTAL_INTAKE_TRUST_UNAUTHENTICATED === "1") return true;
  const raw = headers.get("authentication-results");
  const text = (Array.isArray(raw) ? raw.join(" ") : String(raw || "")).toLowerCase();
  const domain = address.split("@")[1]?.toLowerCase() || "";
  if (!text || !domain) return false;
  return (/dkim=pass/.test(text) && text.includes(`header.d=${domain}`)) || (/spf=pass/.test(text) && text.includes(domain)) || /dmarc=pass/.test(text);
}

export async function runMailIntake() {
  if (!intakeEnabled()) return { enabled: false };
  const a = { imap_host: process.env.PORTAL_INTAKE_IMAP_HOST!, imap_port: Number(process.env.PORTAL_INTAKE_IMAP_PORT || 993), imap_secure: process.env.PORTAL_INTAKE_IMAP_SECURE !== "false", username: process.env.PORTAL_INTAKE_USER!, password: process.env.PORTAL_INTAKE_PASSWORD! };
  let filed = 0, rejected = 0, files = 0;
  await withImap(a, async (c) => {
    for (const box of ["Filed", "Rejected"]) await c.mailboxCreate(box).catch(() => {});
    const lock = await c.getMailboxLock("INBOX");
    try {
      const uids = ((await c.search({ seen: false }, { uid: true })) || []).slice(0, 50);
      for (const uid of uids) {
        const dl = await c.download(String(uid), undefined, { uid: true });
        if (!dl || !("content" in dl) || !dl.content) continue;
        const chunks: Buffer[] = [];
        for await (const ch of dl.content) chunks.push(Buffer.from(ch));
        const raw = Buffer.concat(chunks);
        const mail = await simpleParser(raw);
        const from = (mail.from?.value?.[0]?.address || "").toLowerCase();
        const user = from ? await one<Actor>("SELECT id, email, full_name, role FROM users WHERE lower(email) = $1 AND active", [from]) : null;
        if (!user || !senderVerified(mail.headers as Map<string, unknown>, from)) {
          await c.messageMove(String(uid), "Rejected", { uid: true });
          await audit({ actor: "system:mail-intake", action: "mail_intake.rejected", detail: { from, reason: user ? "sender not verified" : "not a staff address" }, ip: null });
          rejected++;
          continue;
        }
        const tag = /\[([A-Za-z]+\/[A-Za-z]+\/\d{4}\/\d{4}|[A-Za-z]+\/\d+\/\d{4})\]/.exec(mail.subject || "")?.[1];
        let dest: Destination = { kind: "inbox" };
        if (tag) {
          const d = await resolveDestination(user, tag);
          if (!("error" in d)) dest = d;
        }
        const subject = (mail.subject || "(no subject)").replace(/\s*\[[^\]]+\]\s*$/, "").trim();
        const eml = new File([new Uint8Array(raw)], `${subject.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "email"}.eml`, { type: "message/rfc822" });
        await saveIncoming(user, eml, { destination: dest, source: "email", title: `Email: ${subject}`, category: "correspondence", ip: null });
        files++;
        for (const att of mail.attachments || []) {
          if (att.related) continue; // inline images in the body
          const f = new File([new Uint8Array(att.content)], att.filename || "attachment", { type: att.contentType });
          const r = await saveIncoming(user, f, { destination: dest, source: "email", category: "correspondence", ip: null });
          if (!("error" in r)) files++;
        }
        await c.messageMove(String(uid), "Filed", { uid: true });
        filed++;
      }
    } finally {
      lock.release();
    }
  });
  const detail = { filed, rejected, files };
  if (filed || rejected) await q("INSERT INTO job_runs (job, run_date, detail) VALUES ('mail_intake', CURRENT_DATE, $1) ON CONFLICT (job, run_date) DO UPDATE SET ran_at = now(), detail = $1", [JSON.stringify(detail)]);
  return { enabled: true, ...detail };
}
