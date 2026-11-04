"use server";

import { redirect } from "next/navigation";
import { one, q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { currentUser, endSession, hasUsers, mfaRequired, requestMeta, startSession, requireUser } from "@/lib/portal/auth";
import { decrypt, hashPassword, passwordProblem, sha256, verifyPassword, verifyTotp } from "@/lib/portal/crypto";
import type { Role } from "@/lib/portal/permissions";

export type FormState = { error?: string; ok?: string } | undefined;

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const IP_LIMIT = 30; // attempts per 15 minutes from one address

function clean(email: unknown) {
  return String(email || "").trim().toLowerCase().slice(0, 254);
}

// ── First run: create the Managing Partner's account ─────────────
export async function setupAction(_: FormState, fd: FormData): Promise<FormState> {
  if (await hasUsers()) redirect("/portal/login");
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.PORTAL_SETUP_TOKEN;
    if (!expected || String(fd.get("setup_token") || "") !== expected) return { error: "The setup code is wrong. It is the PORTAL_SETUP_TOKEN value set on the server." };
  }
  const email = clean(fd.get("email"));
  const name = String(fd.get("full_name") || "").trim().slice(0, 120);
  const pw = String(fd.get("password") || "");
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Enter your name and a valid email address." };
  const problem = passwordProblem(pw, email, name);
  if (problem) return { error: problem };
  if (pw !== String(fd.get("confirm") || "")) return { error: "The two passwords do not match." };
  const id = crypto.randomUUID();
  const hash = await hashPassword(pw);
  await tx(async (t) => {
    const exists = (await t.query("SELECT 1 FROM users LIMIT 1")).rows.length;
    if (exists) throw new Error("Setup already done");
    await t.query(
      "INSERT INTO users (id, email, full_name, role, title, password_hash, password_changed_at) VALUES ($1,$2,$3,'admin',$4,$5, now())",
      [id, email, name, String(fd.get("title") || "Managing Partner").slice(0, 80), hash],
    );
    await audit({ userId: id, actor: email, action: "system.setup", entityType: "user", entityId: id }, t);
  });
  await startSession(id, false);
  redirect("/portal/security/two-factor?required=1");
}

// ── Sign in ─────────────────────────────────────────────────────
export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = clean(fd.get("email"));
  const pw = String(fd.get("password") || "");
  const { ip } = await requestMeta();
  const generic = "That email and password do not match an active account.";

  const recent = await one<{ n: number }>("SELECT COUNT(*) AS n FROM login_attempts WHERE ip IS NOT DISTINCT FROM $1 AND NOT success AND at > now() - interval '15 minutes'", [ip]);
  if ((recent?.n ?? 0) >= IP_LIMIT) return { error: "Too many attempts from this network. Wait 15 minutes and try again." };

  const u = await one<{ id: string; email: string; role: Role; password_hash: string | null; active: boolean; locked_until: string | null; totp_enabled: boolean; failed_logins: number }>(
    "SELECT id, email, role, password_hash, active, locked_until, totp_enabled, failed_logins FROM users WHERE email = $1",
    [email],
  );
  const ok = await verifyPassword(pw, u?.password_hash);
  if (u && u.locked_until && new Date(u.locked_until) > new Date()) {
    await q("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,false)", [email, ip]);
    return { error: `This account is locked after too many wrong passwords. Try again after ${LOCK_MINUTES} minutes, or ask the Managing Partner to reset it.` };
  }
  if (!u || !u.active || !ok) {
    await q("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,false)", [email, ip]);
    if (u) {
      const fails = u.failed_logins + 1;
      await q(`UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $2 >= ${MAX_FAILS} THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END WHERE id = $1`, [u.id, fails]);
      await audit({ userId: u.id, actor: u.email, action: fails >= MAX_FAILS ? "auth.locked" : "auth.failed", entityType: "user", entityId: u.id });
    }
    return { error: generic };
  }
  await q("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,true)", [email, ip]);
  await q("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [u.id]);
  // Two-factor: if enrolled, the session waits for the code; if required but not set up, enrolment comes next
  const passed = !u.totp_enabled && !mfaRequired(u.role);
  await startSession(u.id, passed);
  if (passed) {
    await q("UPDATE users SET last_login_at = now() WHERE id = $1", [u.id]);
    await audit({ userId: u.id, actor: u.email, action: "auth.login", entityType: "user", entityId: u.id });
    redirect("/portal");
  }
  redirect(u.totp_enabled ? "/portal/login/verify" : "/portal/security/two-factor?required=1");
}

export async function verifyCodeAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await currentUser();
  if (!s) redirect("/portal/login");
  const u = await one<{ totp_secret: string | null; failed_logins: number }>("SELECT totp_secret, failed_logins FROM users WHERE id = $1", [s.id]);
  if (!u?.totp_secret) redirect("/portal/security/two-factor?required=1");
  if (!verifyTotp(decrypt(u.totp_secret), String(fd.get("code") || ""))) {
    const fails = u.failed_logins + 1;
    await q(`UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $2 >= ${MAX_FAILS} THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END WHERE id = $1`, [s.id, fails]);
    await audit({ userId: s.id, actor: s.email, action: "auth.code_failed", entityType: "user", entityId: s.id });
    if (fails >= MAX_FAILS) {
      await endSession();
      redirect("/portal/login?locked=1");
    }
    return { error: "That code is not right. Use the 6-digit code showing in your authenticator app now." };
  }
  await q("UPDATE sessions SET mfa_passed = TRUE WHERE token_hash = $1", [s.token_hash]);
  await q("UPDATE users SET failed_logins = 0, last_login_at = now() WHERE id = $1", [s.id]);
  await audit({ userId: s.id, actor: s.email, action: "auth.login", entityType: "user", entityId: s.id, detail: { twoFactor: true } });
  redirect("/portal");
}

export async function logoutAction() {
  const s = await currentUser();
  if (s) await audit({ userId: s.id, actor: s.email, action: "auth.logout", entityType: "user", entityId: s.id });
  await endSession();
  redirect("/portal/login");
}

// ── Two-factor enrolment ────────────────────────────────────────
export async function confirmTwoFactorAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await currentUser();
  if (!s) redirect("/portal/login");
  const u = await one<{ totp_secret: string | null; totp_enabled: boolean }>("SELECT totp_secret, totp_enabled FROM users WHERE id = $1", [s.id]);
  if (!u?.totp_secret || u.totp_enabled) redirect("/portal");
  if (!verifyTotp(decrypt(u.totp_secret), String(fd.get("code") || ""))) return { error: "That code is not right. Check the time on your phone is set automatically, then try the current code." };
  await q("UPDATE users SET totp_enabled = TRUE WHERE id = $1", [s.id]);
  await q("UPDATE sessions SET mfa_passed = TRUE WHERE token_hash = $1", [s.token_hash]);
  await q("UPDATE users SET last_login_at = now() WHERE id = $1", [s.id]);
  await audit({ userId: s.id, actor: s.email, action: "auth.two_factor_enabled", entityType: "user", entityId: s.id });
  redirect("/portal?msg=two_factor_on");
}

// ── Invitations and password resets ─────────────────────────────
export async function acceptInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") || "");
  const row = await one<{ user_id: string; email: string; full_name: string; role: Role }>(
    `SELECT t.user_id, u.email, u.full_name, u.role FROM user_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.active`,
    [sha256(token)],
  );
  if (!row) return { error: "This link has expired or was already used. Ask the Managing Partner for a new one." };
  const pw = String(fd.get("password") || "");
  const problem = passwordProblem(pw, row.email, row.full_name);
  if (problem) return { error: problem };
  if (pw !== String(fd.get("confirm") || "")) return { error: "The two passwords do not match." };
  const hash = await hashPassword(pw);
  await tx(async (t) => {
    await t.query("UPDATE user_tokens SET used_at = now() WHERE token_hash = $1", [sha256(token)]);
    await t.query("UPDATE users SET password_hash = $2, password_changed_at = now(), failed_logins = 0, locked_until = NULL WHERE id = $1", [row.user_id, hash]);
    await t.query("DELETE FROM sessions WHERE user_id = $1", [row.user_id]);
    await audit({ userId: row.user_id, actor: row.email, action: "auth.password_set", entityType: "user", entityId: row.user_id }, t);
  });
  const passed = !mfaRequired(row.role);
  await startSession(row.user_id, passed);
  redirect(passed ? "/portal" : "/portal/security/two-factor?required=1");
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireUser();
  const u = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [s.id]);
  if (!(await verifyPassword(String(fd.get("current") || ""), u?.password_hash))) return { error: "Your current password is not right." };
  const pw = String(fd.get("password") || "");
  const problem = passwordProblem(pw, s.email, s.full_name);
  if (problem) return { error: problem };
  if (pw !== String(fd.get("confirm") || "")) return { error: "The two new passwords do not match." };
  await q("UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1", [s.id, await hashPassword(pw)]);
  // Sign out every other device
  await q("DELETE FROM sessions WHERE user_id = $1 AND token_hash != $2", [s.id, s.token_hash]);
  await audit({ userId: s.id, actor: s.email, action: "auth.password_changed", entityType: "user", entityId: s.id });
  redirect("/portal/account?msg=password_changed");
}

export async function signOutOthersAction() {
  const s = await requireUser();
  await q("DELETE FROM sessions WHERE user_id = $1 AND token_hash != $2", [s.id, s.token_hash]);
  await audit({ userId: s.id, actor: s.email, action: "auth.signed_out_others", entityType: "user", entityId: s.id });
  redirect("/portal/account?msg=saved");
}
