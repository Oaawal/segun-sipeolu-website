import "server-only";
import crypto from "node:crypto";
import { one, q } from "./db";
import { sha256 } from "./crypto";
import { emailEnabled, sendEmail } from "./notify";

/**
 * Emailed sign-in codes, for people who have not set up an authenticator app
 * yet: after the password, a 6-digit code is emailed and must be entered.
 * Codes last 10 minutes, allow 5 tries, and a new one replaces the old.
 * The email carries only the code. Turn off with PORTAL_EMAIL_CODE=off.
 */

const MINUTES = 10;
const TRIES = 5;

export function emailCodesOn() {
  return emailEnabled() && process.env.PORTAL_EMAIL_CODE !== "off";
}

const hash = (userId: string, code: string) => sha256(`login-code:${userId}:${code}`);

/** Email a new code (at most one a minute per person). Returns false if it could not be sent. */
export async function sendLoginCode(u: { id: string; email: string; full_name: string }): Promise<"sent" | "wait" | "failed"> {
  const recent = await one("SELECT 1 FROM login_codes WHERE user_id = $1 AND sent_at > now() - interval '1 minute'", [u.id]);
  if (recent) return "wait";
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q(`INSERT INTO login_codes (user_id, code_hash, expires_at, attempts, sent_at) VALUES ($1,$2, now() + interval '${MINUTES} minutes', 0, now())
           ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = now()`, [u.id, hash(u.id, code)]);
  const text = `Your sign-in code is ${code}\n\nIt works for ${MINUTES} minutes. If you did not just try to sign in, change your password and tell the Managing Partner.\n\nTo stop receiving these codes, set up an authenticator app under Account in the portal.`;
  const html = `<p>Your sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It works for ${MINUTES} minutes. If you did not just try to sign in, change your password and tell the Managing Partner.</p><p style="color:#777">To stop receiving these codes, set up an authenticator app under Account in the portal.</p>`;
  try {
    await sendEmail({ email: u.email, name: u.full_name }, `Sign-in code: ${code}`, html, text);
    return "sent";
  } catch (err) {
    console.error("[portal] sign-in code email failed", err);
    await q("DELETE FROM login_codes WHERE user_id = $1", [u.id]);
    return "failed";
  }
}

/** True if the code is right (it is then used up). */
export async function checkLoginCode(userId: string, raw: string): Promise<boolean> {
  const code = raw.replace(/\D/g, "");
  const row = await one<{ code_hash: string }>(
    `UPDATE login_codes SET attempts = attempts + 1 WHERE user_id = $1 AND expires_at > now() AND attempts < ${TRIES} RETURNING code_hash`, [userId]);
  if (!row || code.length !== 6) return false;
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hash(userId, code)));
  if (ok) await q("DELETE FROM login_codes WHERE user_id = $1", [userId]);
  return ok;
}
