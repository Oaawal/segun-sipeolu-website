import "server-only";
import { emailEnabled, sendEmail } from "./notify";
import { FIRM } from "./vocab";

/**
 * Email to people outside the firm (clients, signers). Plain, branded, with
 * one button. Never contains confidential details beyond what the message
 * needs; the detail sits behind the link. Callers record each send in the audit trail.
 */

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function siteUrl() {
  return (process.env.PORTAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

export interface ClientEmail { to: string; name: string; subject: string; heading: string; paragraphs: string[]; button?: { label: string; href: string } }

export function clientEmailHtml(m: ClientEmail) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#F7F4F1;padding:24px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #EDE8E2">
    <tr><td style="background:#2B0D17;padding:22px 28px;border-bottom:3px solid #D4B06A">
      <div style="font:700 18px Georgia,serif;color:#fff">${esc(FIRM.name)}</div>
      <div style="font:11px Arial,sans-serif;color:#D4B06A;letter-spacing:.5px;margin-top:2px">Barristers &amp; Solicitors · Lagos</div></td></tr>
    <tr><td style="padding:26px 28px">
      <div style="font:700 20px Georgia,serif;color:#2B0D17;margin-bottom:12px">${esc(m.heading)}</div>
      ${m.paragraphs.map((p) => `<p style="font:14px/1.6 Arial,sans-serif;color:#333;margin:0 0 12px">${esc(p)}</p>`).join("")}
      ${m.button ? `<div style="margin-top:20px"><a href="${esc(m.button.href)}" style="display:inline-block;background:#6D1F3B;color:#fff;text-decoration:none;font:700 14px Arial,sans-serif;padding:12px 20px;border-radius:8px">${esc(m.button.label)}</a></div>
      <p style="font:12px/1.5 Arial,sans-serif;color:#888;margin-top:16px">If the button does not work, copy this address into your browser:<br>${esc(m.button.href)}</p>` : ""}
    </td></tr>
    <tr><td style="background:#F7F4F1;padding:14px 28px;font:11px Arial,sans-serif;color:#888">This email is confidential and intended only for ${esc(m.name)}. If you received it in error, please tell us and delete it. ${esc(FIRM.name)} will never ask for your bank PIN or password by email.</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendClientEmail(m: ClientEmail) {
  if (!emailEnabled()) throw new Error("Email is not set up (BREVO_API_KEY).");
  const text = [m.heading, "", ...m.paragraphs, m.button ? `\n${m.button.label}: ${m.button.href}` : ""].join("\n");
  return sendEmail({ email: m.to, name: m.name }, m.subject, clientEmailHtml(m), text);
}
