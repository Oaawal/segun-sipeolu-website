import "server-only";
import { randomInt } from "node:crypto";
import { q, type Queryable } from "./db";
import { sha256 } from "./crypto";
import type { Role } from "./permissions";

/**
 * Invitation codes: made by the Managing Partner, partners, Senior Counsel
 * and the Head of Litigation; each works once, for one role, for 7 days.
 * Codes look like SSA-7KQ2-M9XD-4HTP; only their hash is stored.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I to misread
export const CODE_DAYS = 7;

export function newCode() {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `SSA-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/** Whatever way it was typed ("ssa 7kq2m9xd4htp", with or without dashes), the same key. */
export function normaliseCode(raw: string) {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^SSA/, "");
  return c.length === 12 ? c : null;
}

export const codeHash = (normalised: string) => sha256(`invite:${normalised}`);

/** Use a code inside a transaction: returns its role, or null if it is wrong, used, revoked or expired. */
export async function redeemCode(t: Queryable, raw: string, userId: string): Promise<Role | null> {
  const n = normaliseCode(raw);
  if (!n) return null;
  const r = await t.query<{ role: Role }>(
    "UPDATE invite_codes SET used_at = now(), used_by = $2 WHERE code_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING role",
    [codeHash(n), userId]);
  return r.rows[0]?.role ?? null;
}

export async function pendingCount() {
  const r = await q<{ n: number }>("SELECT COUNT(*)::int AS n FROM users WHERE account_status = 'pending'");
  return Number(r[0]?.n || 0);
}
