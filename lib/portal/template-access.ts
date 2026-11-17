import "server-only";
import { ROLES, type Role } from "./permissions";

/**
 * Who may see a template or reference document. visible_to is a JSON list of
 * roles, or NULL for everyone. Whoever can see it can preview and download
 * it; generating a document for a matter still needs the matter's file.
 */
export function visibleRoles(raw: string | null): Role[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((r): r is Role => typeof r === "string" && r in ROLES) : null;
  } catch {
    return null;
  }
}

export function canSeeTemplate(u: { role: Role }, raw: string | null) {
  const roles = visibleRoles(raw);
  // The Managing Partner always sees everything, so nothing can be lost from view
  return !roles || u.role === "admin" || roles.includes(u.role);
}

/** SQL condition on templates t for this person. */
export function templateVisibleSql(u: { role: Role }) {
  if (u.role === "admin") return "TRUE";
  return `(t.visible_to IS NULL OR t.visible_to::jsonb ? '${u.role}')`;
}

/** Read the "Who can see it" checkboxes from a form: everyone, or the roles ticked. */
export function visibilityFromForm(fd: FormData): string | null {
  if (fd.get("visibility") !== "some") return null;
  const roles = fd.getAll("visible_role").map(String).filter((r) => r in ROLES && r !== "admin");
  return roles.length ? JSON.stringify(roles) : null;
}

export function visibilityLabel(raw: string | null) {
  const roles = visibleRoles(raw);
  return roles ? roles.map((r) => ROLES[r].label.split(" /")[0]).join(", ") : "Everyone";
}
