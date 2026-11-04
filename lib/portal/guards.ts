import "server-only";
import { redirect } from "next/navigation";
import { one } from "./db";
import { can, canSeeMatter, type Actor } from "./permissions";
import { isUuid } from "./format";

export interface MatterFacts { id: string; number: string; title: string; confidential: boolean; is_member: boolean; court: string | null; judge: string | null; suit_number: string | null }

export async function matterFacts(u: Actor, id: unknown): Promise<MatterFacts | null> {
  if (!isUuid(id)) return null;
  return one<MatterFacts>(
    `SELECT m.id, m.number, m.title, m.confidential, m.court, m.judge, m.suit_number,
            EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $2) AS is_member
     FROM matters m WHERE m.id = $1`,
    [id, u.id],
  );
}

/** Open the matter's file (documents, notes, meetings). */
export async function requireMatterFile(u: Actor, id: unknown, back = "/portal/matters") {
  const m = await matterFacts(u, id);
  if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) redirect(`${back}?msg=denied`);
  return m;
}

/** Work the court diary for a matter: the file, or the litigation team's firm-wide diary access (never through a wall). */
export async function requireDiaryAccess(u: Actor, id: unknown, back = "/portal/diary") {
  const m = await matterFacts(u, id);
  const ok = m && can(u, "diary.edit") && (canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member }) || (can(u, "diary.view_all") && (!m.confidential || m.is_member)));
  if (!m || !ok) redirect(`${back}${back.includes("?") ? "&" : "?"}msg=denied`);
  return m;
}
