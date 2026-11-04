/**
 * Who may do what: least privilege, decided in one place.
 *
 * Two layers:
 *  1. Role permissions (below): what kind of work a role does.
 *  2. Matter access (canSeeMatter): which files a person may open. Lawyers and
 *     the litigation team see only matters they are on. Partners see every
 *     matter except confidential ones they are not on (an ethical wall). Front
 *     desk never opens matter files.
 * Every page and every server action checks both; hiding a button is never
 * the only protection.
 */

export type Role = "admin" | "partner" | "lawyer" | "litigation" | "front_desk";

export const ROLES: Record<Role, { label: string; summary: string }> = {
  admin: { label: "Managing Partner / Admin", summary: "Everything, including people, access, the audit trail and backups." },
  partner: { label: "Partner", summary: "All matters except walled-off ones they are not on; opens matters and manages teams." },
  lawyer: { label: "Lawyer", summary: "Only the matters they are on: files, notes, diary, tasks and meetings." },
  litigation: { label: "Litigation team", summary: "Court diary and service register firm-wide; matter files only where assigned." },
  front_desk: { label: "Front desk", summary: "Client contact details, logging documents served on the firm, and the day's cause list. No matter files." },
};

export const PERMISSIONS = {
  "users.manage": ["admin"],
  "audit.view": ["admin"],
  "system.manage": ["admin"],
  "matters.view_all": ["admin", "partner"],
  "matters.create": ["admin", "partner", "lawyer"],
  "matters.manage_team": ["admin", "partner"],
  "matters.set_confidential": ["admin", "partner"],
  "clients.view": ["admin", "partner", "lawyer", "litigation", "front_desk"],
  "clients.create": ["admin", "partner", "lawyer", "front_desk"],
  "clients.edit": ["admin", "partner", "lawyer", "front_desk"],
  "conflicts.check": ["admin", "partner", "lawyer"],
  "diary.view_all": ["admin", "partner", "litigation", "front_desk"],
  "diary.edit": ["admin", "partner", "lawyer", "litigation"],
  "service.view_all": ["admin", "partner", "litigation", "front_desk"],
  "service.log_inward": ["admin", "partner", "lawyer", "litigation", "front_desk"],
  "service.edit": ["admin", "partner", "lawyer", "litigation"],
  "tasks.assign_others": ["admin", "partner", "lawyer", "litigation"],
  "meetings.use": ["admin", "partner", "lawyer", "litigation"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export interface Actor {
  id: string;
  email: string;
  full_name: string;
  role: Role;
}

export function can(user: Pick<Actor, "role">, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly Role[]).includes(user.role);
}

export interface MatterAccessFacts {
  confidential: boolean;
  isMember: boolean;
}

/** May this person open the matter's file (documents, notes, meetings, parties)? */
export function canSeeMatter(user: Pick<Actor, "role">, m: MatterAccessFacts): boolean {
  if (user.role === "front_desk") return false;
  if (m.isMember) return true;
  if (user.role === "admin") return true;
  if (user.role === "partner") return !m.confidential;
  return false;
}

/** SQL condition (matters aliased as m) for the matters a user may open. $1 must be the user's id. */
export function matterAccessSql(user: Pick<Actor, "role">): string {
  const member = "EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $1)";
  if (user.role === "front_desk") return "FALSE";
  if (user.role === "admin") return "($1::uuid IS NOT NULL)";
  if (user.role === "partner") return `(NOT m.confidential OR ${member})`;
  return member;
}

/**
 * Diary and register rows are visible more widely than matter files (the
 * litigation team and front desk need the day's sittings), but rows from a
 * confidential matter stay inside the wall.
 */
export function diaryAccessSql(user: Pick<Actor, "role">): string {
  if (can(user, "diary.view_all")) {
    if (user.role === "admin") return "($1::uuid IS NOT NULL)";
    return "(NOT m.confidential OR EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $1))";
  }
  return matterAccessSql(user);
}
