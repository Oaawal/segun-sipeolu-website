import "server-only";
import { one } from "./db";
import { sha256 } from "./crypto";

export interface SignRequest {
  id: string; document_id: string; matter_id: string | null; signer_name: string; signer_email: string; message: string | null; doc_sha256: string;
  status: string; expires_at: string; signed_at: string | null; signed_name: string | null; title: string; file_name: string; storage_key: string; current_sha: string;
  requested_by: string | null; requested_by_email: string | null; matter_number: string | null;
}

/** The request behind a signing link, if the link is real. Expired requests are reported as such. */
export async function signRequestByToken(token: string): Promise<SignRequest | null> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  return one<SignRequest>(
    `SELECT s.id, s.document_id, s.matter_id, s.signer_name, s.signer_email, s.message, s.doc_sha256,
            CASE WHEN s.status = 'sent' AND s.expires_at < now() THEN 'expired' ELSE s.status END AS status,
            s.expires_at, s.signed_at, s.signed_name, d.title, d.file_name, d.storage_key, d.sha256 AS current_sha,
            u.full_name AS requested_by, u.email AS requested_by_email, m.number AS matter_number
     FROM signature_requests s JOIN documents d ON d.id = s.document_id LEFT JOIN users u ON u.id = s.created_by LEFT JOIN matters m ON m.id = s.matter_id
     WHERE s.token_hash = $1`, [sha256(token)]);
}
