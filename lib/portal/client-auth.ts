import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one, q } from "./db";
import { randomToken, sha256 } from "./crypto";
import { requestMeta } from "./auth";
import { emailEnabled } from "./notify";

/**
 * Sign-in for clients, kept entirely apart from staff sign-in: its own
 * table, cookie and sessions, so a client session can never reach a staff
 * page. When email is set up, every sign-in also needs a 6-digit code sent
 * to the client's email (two-step sign-in).
 */

export const CLIENT_COOKIE = process.env.NODE_ENV === "production" ? "__Host-ssa_client" : "ssa_client";
const IDLE_MIN = 60;
const MAX_HOURS = 12;

export interface ClientSession {
  id: string; client_id: string; email: string; full_name: string; client_name: string; mfa_passed: boolean; token_hash: string;
}

export function clientCodeRequired() {
  return emailEnabled() && process.env.CLIENT_PORTAL_EMAIL_CODE !== "off";
}

export async function startClientSession(clientUserId: string, mfaPassed: boolean) {
  const token = randomToken();
  const { ip, userAgent } = await requestMeta();
  await q(`INSERT INTO client_sessions (token_hash, client_user_id, mfa_passed, expires_at, ip, user_agent) VALUES ($1,$2,$3, now() + interval '${MAX_HOURS} hours', $4, $5)`,
    [sha256(token), clientUserId, mfaPassed, ip, userAgent]);
  (await cookies()).set(CLIENT_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_HOURS * 3600 });
}

export async function endClientSession() {
  const jar = await cookies();
  const token = jar.get(CLIENT_COOKIE)?.value;
  if (token) await q("DELETE FROM client_sessions WHERE token_hash = $1", [sha256(token)]);
  jar.delete(CLIENT_COOKIE);
}

export const currentClient = cache(async (): Promise<ClientSession | null> => {
  const token = (await cookies()).get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  const hash = sha256(token);
  const row = await one<ClientSession & { last_seen_at: string }>(
    `SELECT cu.id, cu.client_id, cu.email, cu.full_name, c.name AS client_name, s.mfa_passed, s.token_hash, s.last_seen_at
     FROM client_sessions s JOIN client_users cu ON cu.id = s.client_user_id JOIN clients c ON c.id = cu.client_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND cu.active AND s.last_seen_at > now() - ($2::int * interval '1 minute')`,
    [hash, IDLE_MIN]);
  if (!row) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) await q("UPDATE client_sessions SET last_seen_at = now() WHERE token_hash = $1", [hash]);
  return row;
});

export async function requireClient(): Promise<ClientSession> {
  const c = await currentClient();
  if (!c) redirect("/client/login");
  if (!c.mfa_passed) redirect("/client/login/code");
  return c;
}

/** Matters this client may see in the portal: their own, and only those the firm has chosen to share. */
export function clientMatterSql(alias = "m") {
  return `${alias}.client_id = $1 AND ${alias}.share_with_client`;
}

export async function clientMatter(c: ClientSession, matterId: string) {
  return one<{ id: string; number: string; title: string; status: string; court: string | null; suit_number: string | null; practice_area: string; opened_on: string; partner_name: string | null; partner_email: string | null }>(
    `SELECT m.id, m.number, m.title, m.status, m.court, m.suit_number, m.practice_area, m.opened_on, p.full_name AS partner_name, p.email AS partner_email
     FROM matters m LEFT JOIN users p ON p.id = m.responsible_partner WHERE m.id = $2 AND ${clientMatterSql()}`,
    [c.client_id, matterId]);
}
