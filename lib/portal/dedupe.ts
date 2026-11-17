import "server-only";
import { createHash } from "node:crypto";
import { one, q, type Queryable } from "./db";
import { deleteFile, putFile } from "./storage";
import { docForDownload } from "./documents";
import { can, type Actor } from "./permissions";

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
 * Nothing is ever blocked or removed automatically, and no email is sent:
 * the litigation team decides on the Duplicates page.
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

/**
 * Duplicates are reviewed by the litigation team on the Duplicates page (no
 * email). They see every flagged pair except documents in someone's private
 * inbox, and pairs on a walled-off matter unless they are on its team.
 * $1 must be the reviewer's id; x is the document_duplicates row.
 */
export function reviewableSql() {
  return `NOT EXISTS (
    SELECT 1 FROM documents z LEFT JOIN matters zm ON zm.id = z.matter_id
    WHERE z.id IN (x.document_id, x.duplicate_of)
      AND (z.owner_type = 'inbox'
        OR (zm.confidential AND NOT EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = zm.id AND mm.user_id = $1)))
  )`;
}

/** May this person open the document to compare it, as part of reviewing an open duplicate? */
export async function canReviewDocument(u: Actor, documentId: string) {
  if (!can(u, "documents.review_duplicates")) return false;
  return !!(await one(`SELECT 1 FROM document_duplicates x WHERE x.status = 'open' AND $2 IN (x.document_id, x.duplicate_of) AND ${reviewableSql()}`, [u.id, documentId]));
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
