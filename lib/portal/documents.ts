import "server-only";
import { one } from "./db";
import { canSeeMatter, type Actor } from "./permissions";
import { loadMeeting, loadService } from "./data";
import { matterFacts } from "./guards";

/**
 * May this person read (or add to) the documents of an owner record?
 * Matter documents follow the matter's file access; register scans follow the
 * register entry; meeting recordings follow the meeting.
 */
export async function ownerAccess(u: Actor, ownerType: string, ownerId: string): Promise<{ ok: boolean; matterId: string | null; back: string }> {
  if (ownerType === "matter") {
    const m = await matterFacts(u, ownerId);
    const ok = !!m && canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member });
    return { ok, matterId: m?.id ?? null, back: `/portal/matters/${ownerId}?tab=documents` };
  }
  if (ownerType === "service") {
    const e = await loadService(u, ownerId);
    return { ok: !!e, matterId: e?.matter_id ?? null, back: `/portal/register/${ownerId}` };
  }
  if (ownerType === "meeting") {
    const mt = await loadMeeting(u, ownerId);
    return { ok: !!mt, matterId: mt?.matter_id ?? null, back: `/portal/meetings/${ownerId}` };
  }
  return { ok: false, matterId: null, back: "/portal" };
}

export async function docForDownload(u: Actor, id: string) {
  const d = await one<{ id: string; owner_type: string; owner_id: string; matter_id: string | null; file_name: string; storage_key: string; sha256: string; title: string; deleted_at: string | null }>(
    "SELECT id, owner_type, owner_id, matter_id, file_name, storage_key, sha256, title, deleted_at FROM documents WHERE id = $1",
    [id],
  );
  if (!d || d.deleted_at) return null;
  const a = await ownerAccess(u, d.owner_type, d.owner_id);
  return a.ok ? d : "denied";
}
