"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { one, q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { randomToken, sha256 } from "@/lib/portal/crypto";
import { DESIGNATIONS, ROLES, type Designation } from "@/lib/portal/permissions";
import { isUuid, oneOf, str } from "@/lib/portal/format";
import { runReminders } from "@/lib/portal/reminders";

async function issueLink(userId: string, purpose: "reset", by: string) {
  const token = randomToken(24);
  await q("UPDATE user_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await q("INSERT INTO user_tokens (token_hash, user_id, purpose, expires_at, created_by) VALUES ($1,$2,$3, now() + interval '72 hours', $4)", [sha256(token), userId, purpose, by]);
  // Shown once on the next page, never put in a URL
  (await cookies()).set("ssa_new_link", `${userId}:${token}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/portal/admin/people", maxAge: 300 });
}

const designationOf = (fd: FormData, role: string) => {
  const d = String(fd.get("designation") || "");
  return d in DESIGNATIONS && DESIGNATIONS[d as Designation].forRole === role ? d : null;
};

/** Approve an account someone created without a code, choosing its role. */
export async function approveUser(fd: FormData) {
  const u = await requirePermission("users.manage");
  const id = String(fd.get("id") || "");
  const p = isUuid(id) ? await one<{ email: string; requested_role: string | null }>("SELECT email, requested_role FROM users WHERE id = $1 AND account_status = 'pending'", [id]) : null;
  if (!p) redirect("/portal/admin/people");
  const role = oneOf(fd, "role", ROLES, "front_desk");
  await tx(async (t) => {
    await t.query("UPDATE users SET account_status = 'active', active = TRUE, role = $2, designation = $3, title = COALESCE($4, title), approved_by = $5, approved_at = now() WHERE id = $1",
      [id, role, designationOf(fd, role), str(fd, "title", 80), u.id]);
    await audit({ userId: u.id, actor: u.email, action: "user.approved", entityType: "user", entityId: id, detail: { email: p.email, role, requested: p.requested_role } }, t);
  });
  redirect("/portal/admin/people?msg=user_approved");
}

export async function rejectUser(fd: FormData) {
  const u = await requirePermission("users.manage");
  const id = String(fd.get("id") || "");
  const p = isUuid(id) ? await one<{ email: string }>("SELECT email FROM users WHERE id = $1 AND account_status = 'pending'", [id]) : null;
  if (!p) redirect("/portal/admin/people");
  await tx(async (t) => {
    await t.query("UPDATE users SET account_status = 'rejected', active = FALSE, password_hash = NULL WHERE id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: "user.rejected", entityType: "user", entityId: id, detail: { email: p.email } }, t);
  });
  redirect("/portal/admin/people?msg=user_rejected");
}

export async function updateUser(fd: FormData) {
  const u = await requirePermission("users.manage");
  const id = String(fd.get("id") || "");
  if (!isUuid(id)) redirect("/portal/admin/people");
  if (id === u.id) redirect("/portal/admin/people?msg=self");
  const before = await one<{ role: string; active: boolean }>("SELECT role, active FROM users WHERE id = $1", [id]);
  if (!before) redirect("/portal/admin/people");
  const role = oneOf(fd, "role", ROLES, before.role as keyof typeof ROLES);
  const active = fd.get("active") !== "0";
  // Never leave the firm without an administrator
  if (before.role === "admin" && (role !== "admin" || !active)) {
    const admins = await one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active AND id != $1", [id]);
    if (!admins?.n) redirect("/portal/admin/people?msg=invalid");
  }
  await tx(async (t) => {
    await t.query("UPDATE users SET full_name = $2, title = $3, phone = $4, role = $5, active = $6, designation = $7 WHERE id = $1", [id, str(fd, "full_name", 120) || "Unnamed", str(fd, "title", 80), str(fd, "phone", 40), role, active, designationOf(fd, role)]);
    if (!active || role !== before.role) await t.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    if (!active) await t.query("UPDATE api_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [id]);
    await audit({ userId: u.id, actor: u.email, action: active ? "user.updated" : "user.deactivated", entityType: "user", entityId: id, detail: { role, from: before.role, active } }, t);
  });
  redirect(`/portal/admin/people?msg=${active ? "user_updated" : "deactivated"}`);
}

export async function resetUser(fd: FormData) {
  const u = await requirePermission("users.manage");
  const id = String(fd.get("id") || "");
  if (!isUuid(id) || id === u.id) redirect("/portal/admin/people?msg=self");
  await tx(async (t) => {
    // A reset clears the password and two-factor; the person sets both again from the link
    await t.query("UPDATE users SET password_hash = NULL, totp_enabled = FALSE, totp_secret = NULL, failed_logins = 0, locked_until = NULL WHERE id = $1", [id]);
    await t.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: "user.reset", entityType: "user", entityId: id }, t);
  });
  await issueLink(id, "reset", u.id);
  redirect("/portal/admin/people?msg=invited&link=1");
}

export async function runRemindersNow() {
  const u = await requirePermission("system.manage");
  const r = await runReminders({ actor: u.email });
  redirect(`/portal/admin/system?ran=${r.emails}-${r.failed}`);
}

export async function backupNow() {
  const u = await requirePermission("system.manage");
  const { saveBackup } = await import("@/lib/portal/backup");
  const b = await saveBackup(u.email);
  await audit({ userId: u.id, actor: u.email, action: "system.backup_made", detail: b });
  redirect("/portal/admin/system?msg=backup_saved");
}

export async function readDocumentsNow(fd: FormData) {
  const u = await requirePermission("system.manage");
  const { indexPending } = await import("@/lib/portal/fulltext");
  // "Again" clears the failed ones (and, with everything, all of them) so they are read afresh
  if (fd.get("retry") === "failed") await q("DELETE FROM document_text WHERE status IN ('failed','unsupported','empty')");
  if (fd.get("retry") === "all") await q("DELETE FROM document_text");
  const n = await indexPending(25, 45_000);
  await audit({ userId: u.id, actor: u.email, action: "system.documents_read", detail: { read: n, retry: String(fd.get("retry") || "") } });
  redirect("/portal/admin/system?msg=reindexed");
}
