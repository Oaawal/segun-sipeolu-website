"use server";

import { redirect } from "next/navigation";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { randomToken, sha256 } from "@/lib/portal/crypto";
import { normalisePhone } from "@/lib/portal/notify";
import { sendDigest } from "@/lib/portal/reminders";
import { str } from "@/lib/portal/format";
import { cookies } from "next/headers";

export async function savePreferences(fd: FormData) {
  const u = await requireUser();
  const phone = str(fd, "phone", 40);
  if (phone && !normalisePhone(phone)) redirect("/portal/account?msg=invalid");
  await q("UPDATE users SET phone = $2, notify_email = $3, notify_sms = $4 WHERE id = $1", [u.id, phone, fd.get("notify_email") === "1", fd.get("notify_sms") === "1"]);
  await audit({ userId: u.id, actor: u.email, action: "account.preferences", entityType: "user", entityId: u.id });
  redirect("/portal/account?msg=saved");
}

export async function sendTestReminder() {
  const u = await requireUser();
  const p = (await q<{ id: string; email: string; full_name: string; phone: string | null; role: "admin"; notify_email: boolean; notify_sms: boolean }>("SELECT id, email, full_name, phone, role, notify_email, notify_sms FROM users WHERE id = $1", [u.id]))[0];
  await sendDigest({ ...p }, undefined, { force: true });
  redirect("/portal/account?msg=saved&test=1");
}

/** A connection code for the Word add-in, valid 180 days. Shown once. */
export async function createWordToken(fd: FormData) {
  const u = await requireUser();
  const token = `ssa_${randomToken(24)}`;
  const name = str(fd, "name", 60) || "Word on my computer";
  await q("INSERT INTO api_tokens (token_hash, user_id, name, expires_at) VALUES ($1,$2,$3, now() + interval '180 days')", [sha256(token), u.id, name]);
  await audit({ userId: u.id, actor: u.email, action: "account.word_token_created", entityType: "user", entityId: u.id, detail: { name } });
  // Pass the code to the next page view once, in a short-lived cookie, so it never appears in a URL
  (await cookies()).set("ssa_new_token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/portal/account", maxAge: 120 });
  redirect("/portal/account?token=1#codes");
}

export async function revokeToken(fd: FormData) {
  const u = await requireUser();
  const h = String(fd.get("hash") || "");
  await q("UPDATE api_tokens SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL", [h, u.id]);
  await audit({ userId: u.id, actor: u.email, action: "account.word_token_revoked", entityType: "user", entityId: u.id });
  redirect("/portal/account?msg=saved#codes");
}
