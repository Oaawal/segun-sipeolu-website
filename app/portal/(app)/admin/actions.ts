"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { one, q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { randomToken, sha256 } from "@/lib/portal/crypto";
import { ROLES } from "@/lib/portal/permissions";
import { isUuid, oneOf, str } from "@/lib/portal/format";
import { runReminders } from "@/lib/portal/reminders";

async function issueLink(userId: string, purpose: "invite" | "reset", by: string) {
  const token = randomToken(24);
  await q("UPDATE user_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await q("INSERT INTO user_tokens (token_hash, user_id, purpose, expires_at, created_by) VALUES ($1,$2,$3, now() + interval '72 hours', $4)", [sha256(token), userId, purpose, by]);
  // Shown once on the next page, never put in a URL
  (await cookies()).set("ssa_new_link", `${userId}:${token}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/portal/admin/people", maxAge: 300 });
}

export async function inviteUser(fd: FormData) {
  const u = await requirePermission("users.manage");
  const email = String(fd.get("email") || "").trim().toLowerCase().slice(0, 254);
  const name = str(fd, "full_name", 120);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) redirect("/portal/admin/people?msg=invalid");
  if (await one("SELECT 1 FROM users WHERE email = $1", [email])) redirect("/portal/admin/people?msg=invalid");
  const id = crypto.randomUUID();
  const role = oneOf(fd, "role", ROLES, "lawyer");
  await tx(async (t) => {
    await t.query("INSERT INTO users (id, email, full_name, role, title, phone, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, email, name, role, str(fd, "title", 80), str(fd, "phone", 40), u.id]);
    await audit({ userId: u.id, actor: u.email, action: "user.invited", entityType: "user", entityId: id, detail: { email, role } }, t);
  });
  await issueLink(id, "invite", u.id);
  redirect("/portal/admin/people?msg=invited&link=1");
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
    await t.query("UPDATE users SET full_name = $2, title = $3, phone = $4, role = $5, active = $6 WHERE id = $1", [id, str(fd, "full_name", 120) || "Unnamed", str(fd, "title", 80), str(fd, "phone", 40), role, active]);
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
  redirect(`/portal/admin/system?ran=${r.emails}-${r.sms}-${r.failed}`);
}
