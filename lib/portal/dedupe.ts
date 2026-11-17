import "server-only";
import { createHash } from "node:crypto";
import { one, q, type Queryable } from "./db";
import { deleteFile, putFile } from "./storage";
import { notify, emailLayout } from "./notify";
import { portalUrl } from "./reminders";
import { docForDownload } from "./documents";
import type { Actor } from "./permissions";

/**
 * Duplicate documents.
 *
 * 1. Same file (byte for byte, same SHA-256): the new document points at the
 *    copy already in storage, so it takes no extra space, and it is flagged
 *    for review.
 * 2. Same words in a different file (e.g. a letter saved again as PDF, or
 *    the same scan at another resolution): flagged once the words have been
 *    read for search. Only an exact match counts: letter case and spacing
 *    are ignored, but a single different word means it is not a duplicate.
 *
 * Nothing is ever blocked or removed automatically: the person who uploaded
 * it (or the Managing Partner) decides on the Duplicates page.
 */

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** Store bytes, reusing the stored copy of an identical document if there is one. */
export async function storeDeduped(bytes: Buffer): Promise<{ key: string; sha256: string; reused: boolean }> {
  const hash = sha(bytes);
  const same = await one<{ storage_key: string }>(
    "SELECT storage_key FROM documents WHERE sha256 = $1 AND purged_at IS NULL ORDER BY uploaded_at LIMIT 1", [hash]);
  if (same) return { key: same.storage_key, sha256: hash, reused: true };
  const stored = await putFile(bytes);
  return { ...stored, reused: false };
}

/** Undo a store after a failed save: never delete a copy another document uses. */
export async function releaseStored(s: { key: string; reused: boolean }) {
  if (s.reused) return;
  if (await one("SELECT 1 FROM documents WHERE storage_key = $1", [s.key])) return;
  await deleteFile(s.key).catch(() => {});
}

/** Words of a document, normalised so that only real wording differences count. */
export function textFingerprint(text: string): string | null {
  const norm = text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  // Too little text to say two documents are the same (e.g. a blank scan)
  if (norm.replace(/[^\p{L}\p{N}]/gu, "").length < 20) return null;
  return sha(norm);
}

export interface DuplicateInfo { match: "file" | "content"; ofId: string; ofTitle: string | null; ofWhere: string | null }

/** Describe the original to this person, without revealing anything they may not open. */
export async function describeOriginal(u: Actor, ofId: string): Promise<{ title: string | null; where: string | null }> {
  const d = await docForDownload(u, ofId);
  if (!d || d === "denied") return { title: null, where: null };
  const m = d.matter_id ? await one<{ number: string }>("SELECT number FROM matters WHERE id = $1", [d.matter_id]) : null;
  return { title: d.title, where: d.owner_type === "inbox" ? "your inbox" : m ? m.number : d.owner_type === "service" ? "the service register" : "a meeting" };
}

async function flag(t: Queryable | null, documentId: string, ofId: string, match: "file" | "content") {
  const run = (s: string, p: unknown[]) => (t ? t.query(s, p) : q(s, p));
  await run("INSERT INTO document_duplicates (document_id, duplicate_of, match) VALUES ($1,$2,$3) ON CONFLICT (document_id) DO NOTHING", [documentId, ofId, match]);
}

/** Tell the uploader (once a day at most) that something is waiting for review. */
async function tellUploader(documentId: string) {
  const p = await one<{ id: string; email: string; full_name: string; phone: string | null; notify_email: boolean; title: string }>(
    "SELECT u.id, u.email, u.full_name, u.phone, u.notify_email, d.title FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.id = $1 AND u.active", [documentId]);
  if (!p) return;
  const href = `${portalUrl()}/duplicates`;
  const day = new Date().toISOString().slice(0, 10);
  await notify({ ...p, notify_sms: false }, {
    kind: "duplicate", key: `duplicates:${day}`, subject: "Duplicate documents to review",
    html: emailLayout("A document you saved looks like a copy", [{ heading: "To review", items: [{ title: p.title, detail: "Its contents are exactly the same as a document already in the portal.", href }] }], "Open Duplicates to remove the copy or keep both. Anything that differs, even by a word, is never flagged.", href),
    text: `"${p.title}" has exactly the same contents as a document already in the portal. Review it: ${href}`,
  }).catch(() => {});
}

/**
 * After a document is saved: is it the same file as one already kept?
 * A new version identical to the previous one counts too.
 */
export async function checkFileDuplicate(documentId: string): Promise<{ match: "file"; ofId: string } | null> {
  const d = await one<{ sha256: string; deleted_at: string | null }>("SELECT sha256, deleted_at FROM documents WHERE id = $1", [documentId]);
  if (!d || d.deleted_at) return null;
  const other = await one<{ id: string }>(
    "SELECT id FROM documents WHERE sha256 = $1 AND id <> $2 AND deleted_at IS NULL ORDER BY uploaded_at, id LIMIT 1", [d.sha256, documentId]);
  if (!other) return null;
  await flag(null, documentId, other.id, "file");
  await tellUploader(documentId);
  return { match: "file", ofId: other.id };
}

/** Once a document's words have been read: is another document word-for-word the same? */
export async function checkContentDuplicate(documentId: string, text: string) {
  const fp = textFingerprint(text);
  await q("UPDATE document_text SET text_sha256 = $2 WHERE document_id = $1", [documentId, fp]);
  if (!fp) return;
  if (await one("SELECT 1 FROM document_duplicates WHERE document_id = $1", [documentId])) return;
  const other = await one<{ id: string }>(
    `SELECT d.id FROM document_text t JOIN documents d ON d.id = t.document_id
     WHERE t.text_sha256 = $1 AND d.id <> $2 AND d.deleted_at IS NULL
       AND d.uploaded_at <= (SELECT uploaded_at FROM documents WHERE id = $2)
     ORDER BY d.uploaded_at, d.id LIMIT 1`, [fp, documentId]);
  if (!other) return;
  await flag(null, documentId, other.id, "content");
  await tellUploader(documentId);
}

/** Look through everything already stored (for documents saved before this check existed). */
export async function scanAllForDuplicates(): Promise<{ file: number; content: number }> {
  let file = 0, content = 0;
  const groups = await q<{ ids: string[] }>(
    `SELECT array_agg(id::text ORDER BY uploaded_at, id) AS ids FROM documents WHERE deleted_at IS NULL GROUP BY sha256 HAVING COUNT(*) > 1`);
  for (const g of groups) for (const id of g.ids.slice(1)) {
    if (!(await one("SELECT 1 FROM document_duplicates WHERE document_id = $1", [id]))) { await flag(null, id, g.ids[0], "file"); file++; }
  }
  // Fingerprint the words of documents read before fingerprints existed
  const unprinted = await q<{ document_id: string; content: string }>("SELECT document_id, content FROM document_text WHERE status = 'ok' AND text_sha256 IS NULL LIMIT 5000");
  for (const r of unprinted) await q("UPDATE document_text SET text_sha256 = $2 WHERE document_id = $1", [r.document_id, textFingerprint(r.content || "")]);
  const tgroups = await q<{ ids: string[] }>(
    `SELECT array_agg(d.id::text ORDER BY d.uploaded_at, d.id) AS ids FROM document_text t JOIN documents d ON d.id = t.document_id
     WHERE d.deleted_at IS NULL AND t.text_sha256 IS NOT NULL GROUP BY t.text_sha256 HAVING COUNT(*) > 1`);
  for (const g of tgroups) for (const id of g.ids.slice(1)) {
    if (!(await one("SELECT 1 FROM document_duplicates WHERE document_id = $1", [id]))) { await flag(null, id, g.ids[0], "content"); content++; }
  }
  return { file, content };
}

/** Free the stored copy of a removed duplicate, unless any other document still uses it. */
export async function purgeIfUnused(documentId: string): Promise<boolean> {
  const d = await one<{ storage_key: string }>("SELECT storage_key FROM documents WHERE id = $1 AND deleted_at IS NOT NULL AND purged_at IS NULL", [documentId]);
  if (!d) return false;
  const shared = await one("SELECT 1 FROM documents WHERE storage_key = $1 AND id <> $2", [d.storage_key, documentId]);
  const template = await one("SELECT 1 FROM templates WHERE storage_key = $1", [d.storage_key]);
  if (shared || template) return false;
  await deleteFile(d.storage_key);
  await q("UPDATE documents SET purged_at = now() WHERE id = $1", [documentId]);
  return true;
}
