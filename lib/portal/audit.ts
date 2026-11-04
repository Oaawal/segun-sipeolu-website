import "server-only";
import { headers } from "next/headers";
import { q, tx, type Queryable } from "./db";
import { sha256 } from "./crypto";

/**
 * Tamper-evident audit trail. Each entry's hash covers its own content and
 * the previous entry's hash, so changing, deleting or reordering any past
 * entry breaks every hash after it. Database triggers also refuse updates
 * and deletes. verifyAuditChain() re-computes the whole chain.
 */

export interface AuditEntry {
  userId?: string | null;
  actor: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  matterId?: string | null;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
}

const GENESIS = "0".repeat(64);

function canonical(e: { at: string; user_id: string | null; actor: string; action: string; entity_type: string | null; entity_id: string | null; matter_id: string | null; detail: string | null; ip: string | null; prev_hash: string }) {
  return JSON.stringify([e.at, e.user_id, e.actor, e.action, e.entity_type, e.entity_id, e.matter_id, e.detail, e.ip, e.prev_hash]);
}

export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

async function append(t: Queryable, e: AuditEntry) {
  // Serialise writers so each entry links to the true previous one
  await t.query("SELECT pg_advisory_xact_lock(727274)");
  const prev = (await t.query<{ hash: string }>("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1")).rows[0];
  const row = {
    at: new Date().toISOString(),
    user_id: e.userId ?? null,
    actor: e.actor,
    action: e.action,
    entity_type: e.entityType ?? null,
    entity_id: e.entityId ?? null,
    matter_id: e.matterId ?? null,
    detail: e.detail ? JSON.stringify(e.detail) : null,
    ip: e.ip === undefined ? await clientIp() : e.ip,
    prev_hash: prev ? prev.hash : GENESIS,
  };
  const hash = sha256(canonical(row));
  await t.query(
    `INSERT INTO audit_log (at, user_id, actor, action, entity_type, entity_id, matter_id, detail, ip, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [row.at, row.user_id, row.actor, row.action, row.entity_type, row.entity_id, row.matter_id, row.detail, row.ip, row.prev_hash, hash],
  );
}

/** Record an action. Pass `t` to make the entry part of the same transaction as the change. */
export async function audit(e: AuditEntry, t?: Queryable) {
  if (t) return append(t, e);
  return tx((inner) => append(inner, e));
}

export interface ChainCheck {
  ok: boolean;
  checked: number;
  brokenAt?: number;
  reason?: string;
}

export async function verifyAuditChain(): Promise<ChainCheck> {
  const rows = await q<{
    id: string; at: Date | string; user_id: string | null; actor: string; action: string; entity_type: string | null;
    entity_id: string | null; matter_id: string | null; detail: string | null; ip: string | null; prev_hash: string; hash: string;
  }>("SELECT * FROM audit_log ORDER BY id");
  let prev = GENESIS;
  for (const r of rows) {
    const at = r.at instanceof Date ? r.at.toISOString() : new Date(r.at).toISOString();
    if (r.prev_hash !== prev) return { ok: false, checked: rows.length, brokenAt: Number(r.id), reason: "An earlier entry is missing or was altered." };
    const expected = sha256(canonical({ ...r, at }));
    if (expected !== r.hash) return { ok: false, checked: rows.length, brokenAt: Number(r.id), reason: "This entry's contents were altered after it was written." };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}
