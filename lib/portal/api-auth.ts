import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { one, q } from "./db";
import { sha256 } from "./crypto";
import { parseRights, type Actor, type Permission } from "./permissions";

/**
 * Authentication for the Word add-in: a personal connection code (created on
 * the Account page after a full two-factor sign-in) sent as a Bearer token.
 * Codes expire after 180 days, are revoked when the person is deactivated,
 * and every use is logged.
 */
export async function tokenUser(req: NextRequest): Promise<(Actor & { token_hash: string; grants: Permission[]; denies: Permission[] }) | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!/^ssa_[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const hash = sha256(token);
  const u = await one<Actor & { token_hash: string; perm_grants: string | null; perm_denies: string | null }>(
    `SELECT u.id, u.email, u.full_name, u.role, u.perm_grants, u.perm_denies, t.token_hash FROM api_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now() AND u.active`,
    [hash],
  );
  if (!u) return null;
  await q("UPDATE api_tokens SET last_used_at = now() WHERE token_hash = $1", [hash]);
  // The same personal rights as in the portal
  const { perm_grants, perm_denies, ...rest } = u;
  return { ...rest, grants: parseRights(perm_grants), denies: parseRights(perm_denies) };
}

export function unauthorized() {
  return NextResponse.json({ error: "The connection code is not valid any more. Create a new one on your Account page in the portal." }, { status: 401 });
}
