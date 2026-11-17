import "server-only";
import { cleanName, isOwnStagedKey, takeStaged } from "./storage";

/**
 * Files from a form, whichever way they came: sent with the form (local
 * server), or staged straight to storage first (Vercel), in which case the
 * form carries "<field>__staged" entries: {"key","name","type"}. A staged key
 * must belong to the person submitting, so nobody can claim someone else's upload.
 */
export async function readUploads(userId: string, fd: FormData, field: string): Promise<File[]> {
  const out: File[] = [];
  for (const f of fd.getAll(field)) {
    if (typeof f === "object" && f !== null && "arrayBuffer" in f && f.size > 0) out.push(f);
  }
  for (const s of fd.getAll(`${field}__staged`).slice(0, 50)) {
    let meta: { key?: unknown; name?: unknown; type?: unknown };
    try { meta = JSON.parse(String(s)); } catch { continue; }
    if (!isOwnStagedKey(userId, meta.key)) continue;
    const bytes = await takeStaged(meta.key).catch(() => null);
    if (!bytes) continue;
    // Keep "/" so the folder a file came from survives; saveIncoming splits it off
    const name = String(meta.name || "file").split("/").map((p) => cleanName(p)).join("/").slice(-400);
    out.push(new File([new Uint8Array(bytes)], name, { type: String(meta.type || "application/octet-stream") }));
  }
  return out;
}
