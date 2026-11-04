import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { one, q } from "./db";
import { randomToken, sha256 } from "./crypto";
import { can, type Actor, type Permission, type Role } from "./permissions";

/**
 * Sessions for the staff portal.
 *  - The cookie holds a random token; only its SHA-256 is stored.
 *  - Sessions end after 30 minutes idle (PORTAL_IDLE_MINUTES) and 12 hours at most.
 *  - Partners and admins must use an authenticator app (two-factor); set
 *    PORTAL_REQUIRE_2FA=all to require it for everyone.
 *  - Deactivating someone ends their sessions at once.
 */

export const COOKIE = process.env.NODE_ENV === "production" ? "__Host-ssa_portal" : "ssa_portal";
const IDLE_MIN = Number(process.env.PORTAL_IDLE_MINUTES || 30);
const MAX_HOURS = 12;

export interface SessionUser extends Actor {
  title: string | null;
  totp_enabled: boolean;
  mfa_passed: boolean;
  token_hash: string;
}

export function mfaRequired(role: Role): boolean {
  if (process.env.PORTAL_REQUIRE_2FA === "all") return true;
  if (process.env.PORTAL_REQUIRE_2FA === "none") return false;
  return role === "admin" || role === "partner";
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null,
    userAgent: (h.get("user-agent") || "").slice(0, 300),
  };
}

export async function startSession(userId: string, mfaPassed: boolean) {
  const token = randomToken();
  const { ip, userAgent } = await requestMeta();
  await q(
    `INSERT INTO sessions (token_hash, user_id, mfa_passed, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, now() + interval '${MAX_HOURS} hours', $4, $5)`,
    [sha256(token), userId, mfaPassed, ip, userAgent],
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_HOURS * 3600,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  jar.delete(COOKIE);
}

/** The signed-in person for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const hash = sha256(token);
  const row = await one<SessionUser & { last_seen_at: Date }>(
    `SELECT u.id, u.email, u.full_name, u.role, u.title, u.totp_enabled, s.mfa_passed, s.token_hash, s.last_seen_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active
       AND s.last_seen_at > now() - ($2::int * interval '1 minute')`,
    [hash, IDLE_MIN],
  );
  if (!row) return null;
  // Refresh the idle timer at most once a minute
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) {
    await q("UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1", [hash]);
  }
  return row;
});

/** For every portal page: signed in, two-factor done where required. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/portal/login");
  if (!u.mfa_passed) redirect(u.totp_enabled ? "/portal/login/verify" : "/portal/security/two-factor?required=1");
  return u;
}

export async function requirePermission(perm: Permission): Promise<SessionUser> {
  const u = await requireUser();
  if (!can(u, perm)) redirect("/portal?denied=1");
  return u;
}

export async function hasUsers(): Promise<boolean> {
  return !!(await one("SELECT 1 FROM users LIMIT 1"));
}
