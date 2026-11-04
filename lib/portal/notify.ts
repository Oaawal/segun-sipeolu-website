import "server-only";
import { one, q } from "./db";
import { FIRM } from "./vocab";

/**
 * Sends reminders to the team by email and SMS.
 *
 *   Email: Brevo (BREVO_API_KEY, NOTIFY_FROM_EMAIL, NOTIFY_FROM_NAME)
 *   SMS:   Termii, a Nigerian gateway (TERMII_API_KEY, TERMII_SENDER_ID).
 *          Uses Termii's "dnd" route so messages reach numbers on the
 *          Do-Not-Disturb register; the sender ID must be approved by Termii.
 *
 * Confidentiality: SMS is not encrypted, so texts carry only the matter
 * number, court and time, never client names or case details. The full
 * details are in the email and the portal. Set PORTAL_SMS_DETAIL=full to
 * include matter titles.
 *
 * Every attempt is logged in the notifications table; a reminder with the
 * same dedupe key is never sent twice to the same person.
 */

export function emailEnabled() {
  return !!process.env.BREVO_API_KEY && !!process.env.NOTIFY_FROM_EMAIL;
}
export function smsEnabled() {
  return !!process.env.TERMII_API_KEY && !!process.env.TERMII_SENDER_ID;
}

/** Nigerian numbers to international format: 0803 402 1136 → 2348034021136. */
export function normalisePhone(raw: string | null | undefined): string | null {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 11 && d.startsWith("0")) d = "234" + d.slice(1);
  if (d.length === 10 && /^[789]/.test(d)) d = "234" + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

async function sendEmail(to: { email: string; name: string }, subject: string, html: string, text: string) {
  const res = await fetch(`${process.env.BREVO_API_BASE || "https://api.brevo.com"}/v3/smtp/email`, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.NOTIFY_FROM_EMAIL, name: process.env.NOTIFY_FROM_NAME || `${FIRM.name} Portal` },
      to: [to], subject, htmlContent: html, textContent: text,
      headers: { "X-Mailin-Tag": "portal-reminder" },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Email provider ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json().catch(() => ({}))) as { messageId?: string };
  return body.messageId || null;
}

async function sendSms(to: string, text: string) {
  const res = await fetch(`${process.env.TERMII_API_BASE || "https://api.ng.termii.com"}/api/sms/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: process.env.TERMII_API_KEY, to, from: process.env.TERMII_SENDER_ID, sms: text, type: "plain", channel: process.env.TERMII_CHANNEL || "dnd" }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { message_id?: string; message?: string; code?: string };
  if (!res.ok || (body.code && body.code !== "ok")) throw new Error(`SMS provider ${res.status}: ${body.message || "failed"}`);
  return body.message_id || null;
}

export interface Recipient { id: string; email: string; full_name: string; phone: string | null; notify_email: boolean; notify_sms: boolean }

async function alreadySent(userId: string, channel: string, key: string) {
  return !!(await one("SELECT 1 FROM notifications WHERE user_id = $1 AND channel = $2 AND dedupe_key = $3 AND status = 'sent'", [userId, channel, key]));
}

async function log(r: Recipient, channel: "email" | "sms", kind: string, key: string, recipient: string, subject: string | null, body: string, status: string, ref: string | null, error: string | null) {
  await q(
    "INSERT INTO notifications (id, user_id, channel, kind, dedupe_key, recipient, subject, body, status, provider_ref, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING",
    [crypto.randomUUID(), r.id, channel, kind, key, recipient, subject, body.slice(0, 4000), status, ref, error?.slice(0, 500) ?? null],
  );
}

/**
 * Send one message to one person on the channels they allow. Returns what
 * happened per channel. Never throws: a failed provider is logged.
 */
export async function notify(r: Recipient, msg: { kind: string; key: string; subject: string; html: string; text: string; sms?: string }) {
  const out: { email?: string; sms?: string } = {};
  if (r.notify_email && emailEnabled() && !(await alreadySent(r.id, "email", msg.key))) {
    try {
      const ref = await sendEmail({ email: r.email, name: r.full_name }, msg.subject, msg.html, msg.text);
      await log(r, "email", msg.kind, msg.key, r.email, msg.subject, msg.text, "sent", ref, null);
      out.email = "sent";
    } catch (err) {
      await log(r, "email", msg.kind, msg.key, r.email, msg.subject, msg.text, "failed", null, String((err as Error).message));
      out.email = "failed";
    }
  }
  const phone = normalisePhone(r.phone);
  if (msg.sms && r.notify_sms && phone && smsEnabled() && !(await alreadySent(r.id, "sms", msg.key))) {
    const text = msg.sms.slice(0, 459); // three SMS pages at most
    try {
      const ref = await sendSms(phone, text);
      await log(r, "sms", msg.kind, msg.key, phone, null, text, "sent", ref, null);
      out.sms = "sent";
    } catch (err) {
      await log(r, "sms", msg.kind, msg.key, phone, null, text, "failed", null, String((err as Error).message));
      out.sms = "failed";
    }
  }
  return out;
}

// ── Email layout ─────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailLayout(title: string, sections: { heading: string; items: { title: string; detail?: string; href?: string; tag?: string }[] }[], intro: string, portalUrl: string) {
  const body = sections.filter((s) => s.items.length).map((s) => `
    <tr><td style="padding:18px 0 6px;font:700 11px Arial,sans-serif;letter-spacing:1.2px;text-transform:uppercase;color:#6D1F3B">${esc(s.heading)} (${s.items.length})</td></tr>
    ${s.items.map((i) => `<tr><td style="padding:9px 0;border-top:1px solid #EDE8E2;font:14px/1.45 Arial,sans-serif;color:#1a1a1a">
      ${i.tag ? `<span style="display:inline-block;background:#F6EBD3;color:#7a5a14;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;margin-right:6px">${esc(i.tag)}</span>` : ""}
      ${i.href ? `<a href="${esc(i.href)}" style="color:#2B0D17;font-weight:700;text-decoration:none">${esc(i.title)}</a>` : `<strong>${esc(i.title)}</strong>`}
      ${i.detail ? `<div style="color:#6b6b6b;font-size:13px">${esc(i.detail)}</div>` : ""}</td></tr>`).join("")}`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;background:#F7F4F1;padding:24px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #EDE8E2">
    <tr><td style="background:#2B0D17;padding:22px 28px;border-bottom:3px solid #D4B06A">
      <div style="font:700 18px Georgia,serif;color:#fff">${esc(FIRM.name)}</div>
      <div style="font:11px Arial,sans-serif;color:#D4B06A;letter-spacing:.5px;margin-top:2px">Practice Portal · Confidential</div></td></tr>
    <tr><td style="padding:24px 28px">
      <div style="font:700 20px Georgia,serif;color:#2B0D17;margin-bottom:6px">${esc(title)}</div>
      <div style="font:14px/1.5 Arial,sans-serif;color:#444">${esc(intro)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
      <div style="margin-top:22px"><a href="${esc(portalUrl)}" style="display:inline-block;background:#6D1F3B;color:#fff;text-decoration:none;font:700 14px Arial,sans-serif;padding:11px 18px;border-radius:8px">Open the portal</a></div>
    </td></tr>
    <tr><td style="background:#F7F4F1;padding:14px 28px;font:11px Arial,sans-serif;color:#888">Confidential and privileged. You receive this because you are on the ${esc(FIRM.short)} team. Change reminders on your Account page.</td></tr>
  </table></td></tr></table></body></html>`;
}
