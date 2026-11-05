import "server-only";
import { one, tx } from "./db";
import { audit } from "./audit";
import { ownerAccess } from "./documents";
import { matterFacts } from "./guards";
import { canSeeMatter, type Actor } from "./permissions";
import { putFile, deleteFile, uploadProblem, cleanName, mimeFor } from "./storage";
import { isUuid } from "./format";
import { DOC_CATEGORIES } from "./vocab";

/**
 * One way in for files from anywhere: the browser (drag and drop, folders,
 * phone camera), the phone's Share menu, Windows "Send to" and the watched
 * folder. Each file is checked, encrypted, fingerprinted and logged, and
 * lands either on a matter the person can open or in their own inbox.
 */

export const SOURCES = {
  browser: "Uploaded in the browser",
  camera: "Scanned with the phone camera",
  phone_share: "Shared from the phone",
  windows: "Sent from Windows",
  folder: "Portal Inbox folder",
  word: "Saved from Word",
  email: "Sent to the portal by email",
  mailbox: "Filed from the mailbox",
  template: "Generated from a template",
} as const;
export type Source = keyof typeof SOURCES;

export type Destination = { kind: "inbox" } | { kind: "matter"; matterId: string };

/** Work out where files go from a form value: "inbox", a matter id, or a matter / suit number. */
export async function resolveDestination(u: Actor, value: string | null | undefined): Promise<Destination | { error: string }> {
  const v = String(value || "").trim();
  if (!v || v.toLowerCase() === "inbox") return { kind: "inbox" };
  let id = isUuid(v) ? v : null;
  if (!id) {
    const hit = await one<{ id: string }>("SELECT id FROM matters WHERE lower(number) = lower($1) OR lower(suit_number) = lower($1) LIMIT 1", [v]);
    id = hit?.id ?? null;
  }
  const m = id ? await matterFacts(u, id) : null;
  // The same answer whether the matter does not exist or is closed to this person
  if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) return { error: "No matter you can open has that number." };
  return { kind: "matter", matterId: m.id };
}

export interface SavedFile { id: string; title: string; file_name: string; size: number; sha256: string; where: string }

export async function saveIncoming(
  u: Actor,
  file: File,
  opts: { destination: Destination; source: Source; title?: string | null; category?: string | null; ip?: string | null },
): Promise<SavedFile | { error: string; file_name: string }> {
  const problem = uploadProblem(file);
  const name = cleanName(file?.name || "file");
  if (problem) return { error: problem, file_name: name };
  const ownerType = opts.destination.kind;
  const ownerId = opts.destination.kind === "matter" ? opts.destination.matterId : u.id;
  const access = await ownerAccess(u, ownerType, ownerId);
  if (!access.ok || (u.role === "front_desk" && ownerType === "matter")) return { error: "You do not have access to that matter.", file_name: name };

  const title = (opts.title || "").trim().slice(0, 200) || name.replace(/\.[a-z0-9]+$/i, "");
  const category = opts.category && Object.prototype.hasOwnProperty.call(DOC_CATEGORIES, opts.category) ? opts.category : "other";
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await putFile(bytes);
  const id = crypto.randomUUID();
  try {
    await tx(async (t) => {
      await t.query(
        `INSERT INTO documents (id, owner_type, owner_id, matter_id, series_id, version, title, category, file_name, mime_type, size_bytes, sha256, storage_key, uploaded_by, source)
         VALUES ($1,$2,$3,$4,$1,1,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [id, ownerType, ownerId, access.matterId, title, category, name, mimeFor(name), bytes.length, stored.sha256, stored.key, u.id, opts.source],
      );
      if (access.matterId) {
        await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)",
          [crypto.randomUUID(), access.matterId, `Document added: ${title} (${SOURCES[opts.source].toLowerCase()})`, u.id]);
      }
      await audit({ userId: u.id, actor: u.email, action: "document.uploaded", entityType: "document", entityId: id, matterId: access.matterId, detail: { title, to: ownerType, source: opts.source, sha256: stored.sha256, size: bytes.length }, ip: opts.ip }, t);
    });
  } catch (err) {
    await deleteFile(stored.key).catch(() => {});
    throw err;
  }
  return { id, title, file_name: name, size: bytes.length, sha256: stored.sha256, where: ownerType === "inbox" ? "inbox" : "matter" };
}
