import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";
import { q } from "./db";
import { deleteFile, getFile, putFile } from "./storage";

/**
 * Backups of every record (not the files, which are already stored
 * encrypted in their own storage). Made every night by the daily job and on
 * demand. Each backup is compressed, then encrypted like any stored file,
 * and the last 30 are kept.
 */

export const BACKUP_TABLES = [
  "users", "clients", "matters", "matter_members", "parties", "matter_notes", "hearings", "service_register", "tasks", "documents", "meetings",
  "notifications", "audit_log", "templates", "contacts", "contact_matters", "entities", "entity_officers", "entity_shareholdings", "entity_filings",
  "assets", "systems", "system_access", "mail_accounts", "calendar_feeds", "api_tokens", "counters", "settings", "schema_migrations",
  "time_entries", "expenses", "invoices", "invoice_lines", "payments", "client_ledger", "client_users", "client_messages", "signature_requests",
  "enquiries", "workflows", "deadline_rules", "holidays", "assistant_log", "backups",
];
// Secrets never leave the server, even in a backup
const STRIP: Record<string, string[]> = { users: ["password_hash", "totp_secret"], mail_accounts: ["password_enc"], calendar_feeds: ["token_hash"], api_tokens: ["token_hash"], client_users: ["password_hash"], signature_requests: ["token_hash"], invoices: ["pay_token"] };
const KEEP = 30;

export async function buildBackup(by: string) {
  const tables: Record<string, unknown[]> = {};
  let rows = 0;
  for (const t of BACKUP_TABLES) {
    const r = await q<Record<string, unknown>>(`SELECT * FROM ${t}`);
    tables[t] = r.map((x) => { for (const k of STRIP[t] || []) delete x[k]; return x; });
    rows += r.length;
  }
  const json = JSON.stringify({ createdAt: new Date().toISOString(), by, tables });
  return { json, tables: BACKUP_TABLES.length, rows };
}

export async function saveBackup(by: string) {
  const b = await buildBackup(by);
  const gz = gzipSync(Buffer.from(b.json));
  const stored = await putFile(gz);
  const id = crypto.randomUUID();
  await q("INSERT INTO backups (id, storage_key, size_bytes, sha256, tables, rows, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, stored.key, gz.length, stored.sha256, b.tables, b.rows, by]);
  const old = await q<{ id: string; storage_key: string }>("SELECT id, storage_key FROM backups ORDER BY created_at DESC OFFSET $1", [KEEP]);
  for (const o of old) {
    await deleteFile(o.storage_key).catch(() => {});
    await q("DELETE FROM backups WHERE id = $1", [o.id]);
  }
  return { id, size: gz.length, rows: b.rows };
}

export async function readBackup(id: string) {
  const r = (await q<{ storage_key: string; sha256: string; created_at: string }>("SELECT storage_key, sha256, created_at FROM backups WHERE id = $1", [id]))[0];
  if (!r) return null;
  return { json: gunzipSync(await getFile(r.storage_key, r.sha256)), created_at: r.created_at };
}
