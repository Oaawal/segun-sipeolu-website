import "server-only";
import { one, q } from "./db";
import { decrypt, encrypt } from "./crypto";

/**
 * Staff chat: one room for the whole firm, and private one-to-one
 * conversations. Only signed-in staff can read or write; a one-to-one
 * conversation is open to its two people only. Message text is encrypted
 * before it is stored, and nothing is ever sent by email.
 */

export const FIRM = "firm";
export const MAX_LEN = 4000;

export interface ChatMessage { id: number; sender_id: string; sender: string; body: string; created_at: string }

export function dmChannel(a: string, b: string) {
  return `dm:${[a, b].sort().join(":")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The channel this person asked for, if they may use it (otherwise null). */
export async function openChannel(userId: string, channel: string | null | undefined): Promise<string | null> {
  if (!channel || channel === FIRM) return FIRM;
  const m = /^dm:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(channel);
  if (!m || !UUID.test(m[1]) || !UUID.test(m[2]) || m[1] === m[2]) return null;
  if (![m[1], m[2]].includes(userId) || dmChannel(m[1], m[2]) !== channel) return null;
  const other = m[1] === userId ? m[2] : m[1];
  return (await one("SELECT 1 FROM users WHERE id = $1 AND active AND account_status = 'active'", [other])) ? channel : null;
}

function readBody(stored: string) {
  try { return decrypt(stored, "chat"); } catch { return "(message could not be read)"; }
}

/** Messages after a given id (the latest 200 when after is 0). */
export async function messages(channel: string, after = 0): Promise<ChatMessage[]> {
  const rows = await q<{ id: string; sender_id: string; sender: string; body: string; created_at: string }>(
    after > 0
      ? `SELECT c.id, c.sender_id, u.full_name AS sender, c.body, c.created_at FROM chat_messages c JOIN users u ON u.id = c.sender_id
         WHERE c.channel = $1 AND c.id > $2 ORDER BY c.id LIMIT 200`
      : `SELECT * FROM (SELECT c.id, c.sender_id, u.full_name AS sender, c.body, c.created_at FROM chat_messages c JOIN users u ON u.id = c.sender_id
         WHERE c.channel = $1 ORDER BY c.id DESC LIMIT 200) x ORDER BY id`,
    after > 0 ? [channel, after] : [channel]);
  return rows.map((r) => ({ id: Number(r.id), sender_id: r.sender_id, sender: r.sender, body: readBody(r.body), created_at: new Date(r.created_at).toISOString() }));
}

export async function post(userId: string, channel: string, text: string): Promise<number | null> {
  const body = text.replace(/\r\n/g, "\n").trim().slice(0, MAX_LEN);
  if (!body) return null;
  const r = await one<{ id: string }>("INSERT INTO chat_messages (channel, sender_id, body) VALUES ($1,$2,$3) RETURNING id", [channel, userId, encrypt(body, "chat")]);
  const id = Number(r!.id);
  await markRead(userId, channel, id);
  return id;
}

export async function markRead(userId: string, channel: string, lastId: number) {
  if (!lastId) return;
  await q(`INSERT INTO chat_reads (user_id, channel, last_id) VALUES ($1,$2,$3)
           ON CONFLICT (user_id, channel) DO UPDATE SET last_id = GREATEST(chat_reads.last_id, EXCLUDED.last_id)`, [userId, channel, lastId]);
}

/** SQL for "messages to this person not yet read"; $1 is the person's id. */
export const UNREAD_SQL = `(SELECT COUNT(*) FROM chat_messages c LEFT JOIN chat_reads r ON r.user_id = $1 AND r.channel = c.channel
  WHERE c.sender_id <> $1 AND c.id > COALESCE(r.last_id, 0)
    AND (c.channel = 'firm' OR c.channel LIKE 'dm:' || $1::text || ':%' OR c.channel LIKE 'dm:%:' || $1::text))`;

/** Everyone this person can message, with unread counts and the latest activity. */
export async function people(userId: string) {
  return q<{ id: string; full_name: string; title: string | null; unread: number; last_at: string | null }>(
    `SELECT u.id, u.full_name, u.title,
       (SELECT COUNT(*)::int FROM chat_messages c LEFT JOIN chat_reads r ON r.user_id = $1 AND r.channel = c.channel
        WHERE c.channel = 'dm:' || LEAST(u.id::text, $1::text) || ':' || GREATEST(u.id::text, $1::text) AND c.sender_id <> $1 AND c.id > COALESCE(r.last_id, 0)) AS unread,
       (SELECT MAX(c.created_at) FROM chat_messages c WHERE c.channel = 'dm:' || LEAST(u.id::text, $1::text) || ':' || GREATEST(u.id::text, $1::text)) AS last_at
     FROM users u WHERE u.active AND u.account_status = 'active' AND u.id <> $1
     ORDER BY last_at DESC NULLS LAST, u.full_name`, [userId]);
}

export async function firmUnread(userId: string) {
  const r = await one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM chat_messages c LEFT JOIN chat_reads r ON r.user_id = $1 AND r.channel = 'firm'
     WHERE c.channel = 'firm' AND c.sender_id <> $1 AND c.id > COALESCE(r.last_id, 0)`, [userId]);
  return Number(r?.n || 0);
}
