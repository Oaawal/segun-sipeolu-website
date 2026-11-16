"use server";

import { redirect } from "next/navigation";
import { randomInt } from "node:crypto";
import { one, q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { hashPassword, passwordProblem, sha256, randomToken, verifyPassword } from "@/lib/portal/crypto";
import { requestMeta } from "@/lib/portal/auth";
import { clientCodeRequired, clientMatter, currentClient, endClientSession, requireClient, startClientSession } from "@/lib/portal/client-auth";
import { sendClientEmail, siteUrl } from "@/lib/portal/client-mail";
import { emailEnabled, notify, emailLayout } from "@/lib/portal/notify";
import { putFile, deleteFile, cleanName, mimeFor, uploadProblem } from "@/lib/portal/storage";
import { portalUrl } from "@/lib/portal/reminders";
import { isUuid } from "@/lib/portal/format";
import { indexSoon } from "@/lib/portal/fulltext";

type FormState = { error?: string; ok?: string } | undefined;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const IP_LIMIT = 30;
const clean = (v: unknown) => String(v || "").trim().toLowerCase().slice(0, 254);

async function sendCode(sessionHash: string, to: { email: string; name: string }) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await q("UPDATE client_sessions SET code_hash = $2, code_expires = now() + interval '10 minutes', code_tries = 0 WHERE token_hash = $1", [sessionHash, sha256(code)]);
  await sendClientEmail({
    to: to.email, name: to.name, subject: `${code} is your sign-in code`, heading: "Your sign-in code",
    paragraphs: [`Your code is ${code}. It works for 10 minutes.`, "If you did not try to sign in to the client portal of Segun Sipeolu & Associates, someone may know your password: please change it and tell us."],
  });
}

export async function clientLogin(_: FormState, fd: FormData): Promise<FormState> {
  const email = clean(fd.get("email"));
  const pw = String(fd.get("password") || "");
  const { ip } = await requestMeta();
  const generic = "That email and password do not match an active client account.";
  const recent = await one<{ n: number }>("SELECT COUNT(*) AS n FROM login_attempts WHERE ip IS NOT DISTINCT FROM $1 AND NOT success AND at > now() - interval '15 minutes'", [ip]);
  if (Number(recent?.n) >= IP_LIMIT) return { error: "Too many attempts from this network. Wait 15 minutes and try again." };
  const cu = await one<{ id: string; email: string; full_name: string; password_hash: string | null; active: boolean; locked_until: string | null; failed_logins: number; client_id: string }>(
    "SELECT id, email, full_name, password_hash, active, locked_until, failed_logins, client_id FROM client_users WHERE email = $1", [email]);
  const ok = await verifyPassword(pw, cu?.password_hash);
  if (cu?.locked_until && new Date(cu.locked_until) > new Date()) {
    await q("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,false)", [`client:${email}`, ip]);
    return { error: `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.` };
  }
  if (!cu || !cu.active || !ok) {
    await q("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,false)", [`client:${email}`, ip]);
    if (cu) {
      const fails = cu.failed_logins + 1;
      await q(`UPDATE client_users SET failed_logins = $2, locked_until = CASE WHEN $2 >= ${MAX_FAILS} THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END WHERE id = $1`, [cu.id, fails]);
      await audit({ actor: `client:${cu.email}`, action: "client.auth_failed", entityType: "client", entityId: cu.client_id, ip });
    }
    return { error: generic };
  }
  await q("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,true)", [`client:${email}`, ip]);
  await q("UPDATE client_users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [cu.id]);
  const needCode = clientCodeRequired();
  await startClientSession(cu.id, !needCode);
  if (needCode) {
    const s = await currentClientRaw();
    if (s) {
      try { await sendCode(s, { email: cu.email, name: cu.full_name }); } catch { return { error: "We could not send your sign-in code. Please try again shortly." }; }
    }
    redirect("/client/login/code");
  }
  await q("UPDATE client_users SET last_login_at = now() WHERE id = $1", [cu.id]);
  await audit({ actor: `client:${cu.email}`, action: "client.login", entityType: "client", entityId: cu.client_id, ip });
  redirect("/client");
}

/** The session row just created (cookie set in this request). */
async function currentClientRaw(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const { CLIENT_COOKIE } = await import("@/lib/portal/client-auth");
  const t = (await cookies()).get(CLIENT_COOKIE)?.value;
  return t ? sha256(t) : null;
}

export async function verifyClientCode(_: FormState, fd: FormData): Promise<FormState> {
  const c = await currentClient();
  if (!c) redirect("/client/login");
  const code = String(fd.get("code") || "").replace(/\D/g, "");
  const s = await one<{ code_hash: string | null; code_expires: string | null; code_tries: number }>("SELECT code_hash, code_expires, code_tries FROM client_sessions WHERE token_hash = $1", [c.token_hash]);
  if (!s?.code_hash || !s.code_expires || new Date(s.code_expires) < new Date() || s.code_tries >= 5) {
    await endClientSession();
    return { error: "That code has expired. Sign in again for a new one." };
  }
  if (sha256(code) !== s.code_hash) {
    await q("UPDATE client_sessions SET code_tries = code_tries + 1 WHERE token_hash = $1", [c.token_hash]);
    return { error: "That code is not right. Check the latest email from us." };
  }
  await q("UPDATE client_sessions SET mfa_passed = TRUE, code_hash = NULL WHERE token_hash = $1", [c.token_hash]);
  await q("UPDATE client_users SET last_login_at = now() WHERE id = $1", [c.id]);
  const { ip } = await requestMeta();
  await audit({ actor: `client:${c.email}`, action: "client.login", entityType: "client", entityId: c.client_id, ip, detail: { emailCode: true } });
  redirect("/client");
}

export async function resendClientCode() {
  const c = await currentClient();
  if (!c) redirect("/client/login");
  if (!c.mfa_passed) await sendCode(c.token_hash, { email: c.email, name: c.full_name }).catch(() => {});
  redirect("/client/login/code?resent=1");
}

export async function acceptClientInvite(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") || "");
  const pw = String(fd.get("password") || "");
  if (pw !== String(fd.get("confirm") || "")) return { error: "The two passwords do not match." };
  const row = await one<{ client_user_id: string; email: string; full_name: string; client_id: string; purpose: string }>(
    `SELECT t.client_user_id, cu.email, cu.full_name, cu.client_id, t.purpose FROM client_tokens t JOIN client_users cu ON cu.id = t.client_user_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND cu.active`, [sha256(token)]);
  if (!row) return { error: "This link has expired or was already used. Ask the firm for a new one." };
  const problem = passwordProblem(pw, row.email, row.full_name);
  if (problem) return { error: problem };
  const hash = await hashPassword(pw);
  await tx(async (t) => {
    await t.query("UPDATE client_tokens SET used_at = now() WHERE token_hash = $1", [sha256(token)]);
    await t.query("UPDATE client_users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1", [row.client_user_id, hash]);
    await t.query("DELETE FROM client_sessions WHERE client_user_id = $1", [row.client_user_id]);
    await audit({ actor: `client:${row.email}`, action: row.purpose === "reset" ? "client.password_reset" : "client.invite_accepted", entityType: "client", entityId: row.client_id }, t);
  });
  // The link reached their email, which is the second step
  await startClientSession(row.client_user_id, true);
  redirect("/client");
}

export async function clientForgot(_: FormState, fd: FormData): Promise<FormState> {
  const email = clean(fd.get("email"));
  const done = { ok: "If that email has a client account, a link to choose a new password is on its way. It works for one hour." };
  if (!emailEnabled()) return { error: "Please contact the firm to reset your password." };
  const cu = await one<{ id: string; full_name: string; client_id: string }>("SELECT id, full_name, client_id FROM client_users WHERE email = $1 AND active", [email]);
  if (!cu) return done;
  const recent = await one<{ n: number }>("SELECT COUNT(*) AS n FROM client_tokens WHERE client_user_id = $1 AND purpose = 'reset' AND created_at > now() - interval '1 hour'", [cu.id]);
  if (Number(recent?.n) >= 3) return done;
  const token = randomToken();
  await q("INSERT INTO client_tokens (token_hash, client_user_id, purpose, expires_at) VALUES ($1,$2,'reset', now() + interval '1 hour')", [sha256(token), cu.id]);
  await sendClientEmail({ to: email, name: cu.full_name, subject: "Choose a new password", heading: "Choose a new password", paragraphs: ["Someone asked to reset the password for your client portal account. If it was you, use the button below within an hour. If not, ignore this email: your password has not changed."], button: { label: "Choose a new password", href: `${siteUrl()}/client/invite/${token}` } }).catch(() => {});
  await audit({ actor: `client:${email}`, action: "client.reset_requested", entityType: "client", entityId: cu.client_id });
  return done;
}

export async function clientLogout() {
  const c = await currentClient();
  if (c) await audit({ actor: `client:${c.email}`, action: "client.logout", entityType: "client", entityId: c.client_id });
  await endClientSession();
  redirect("/client/login");
}

/** A message (and optionally a document) from the client to the matter team. */
export async function clientPost(fd: FormData) {
  const c = await requireClient();
  const matterId = String(fd.get("matter_id") || "");
  const m = isUuid(matterId) ? await clientMatter(c, matterId) : null;
  if (!m) redirect("/client");
  const body = String(fd.get("body") || "").trim().slice(0, 5000);
  const file = fd.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (!body && !hasFile) redirect(`/client/matters/${m.id}?msg=empty`);
  let docId: string | null = null;
  let stored: { key: string; sha256: string } | null = null;
  if (hasFile) {
    const problem = uploadProblem(file);
    if (problem) redirect(`/client/matters/${m.id}?msg=file`);
    const bytes = Buffer.from(await file.arrayBuffer());
    stored = await putFile(bytes);
    docId = crypto.randomUUID();
    const name = cleanName(file.name || "file");
    try {
      await tx(async (t) => {
        await t.query(
          `INSERT INTO documents (id, owner_type, owner_id, matter_id, series_id, version, title, category, file_name, mime_type, size_bytes, sha256, storage_key, source, from_client, shared_with_client)
           VALUES ($1,'matter',$2,$2,$1,1,$3,'correspondence',$4,$5,$6,$7,$8,'client_portal',TRUE,TRUE)`,
          [docId, m.id, `From client: ${name.replace(/\.[a-z0-9]+$/i, "")}`.slice(0, 200), name, mimeFor(name), bytes.length, stored!.sha256, stored!.key]);
        await t.query("INSERT INTO matter_notes (id, matter_id, kind, body) VALUES ($1,$2,'system',$3)", [crypto.randomUUID(), m.id, `Client uploaded a document through the client portal: ${name} (${c.full_name})`]);
      });
    } catch (e) {
      await deleteFile(stored.key).catch(() => {});
      throw e;
    }
    indexSoon();
  }
  await q("INSERT INTO client_messages (id, matter_id, from_client, client_user_id, body, document_id) VALUES ($1,$2,TRUE,$3,$4,$5)",
    [crypto.randomUUID(), m.id, c.id, body || "(sent a document)", docId]);
  const { ip } = await requestMeta();
  await audit({ actor: `client:${c.email}`, action: hasFile ? "client.uploaded" : "client.messaged", entityType: "matter", entityId: m.id, matterId: m.id, ip, detail: docId ? { document: docId, sha256: stored?.sha256 } : null });
  // Tell the matter team (by email; never the message text, which stays in the portal)
  const team = await q<{ id: string; email: string; full_name: string; phone: string | null; notify_email: boolean; notify_sms: boolean }>(
    "SELECT u.id, u.email, u.full_name, u.phone, u.notify_email, FALSE AS notify_sms FROM matter_members mm JOIN users u ON u.id = mm.user_id WHERE mm.matter_id = $1 AND u.active", [m.id]);
  const href = `${portalUrl()}/matters/${m.id}?tab=client`;
  for (const p of team) {
    await notify(p, {
      kind: "client_message", key: `client_msg:${m.id}:${Date.now()}`, subject: `Client ${hasFile ? "sent a document" : "message"}: ${m.number}`,
      html: emailLayout(`${c.client_name} ${hasFile ? "sent a document" : "sent a message"}`, [{ heading: "Matter", items: [{ title: `${m.number} · ${m.title}`, href, detail: `From ${c.full_name}` }] }], "Open the matter's Client portal tab to read it and reply.", href),
      text: `${c.client_name} ${hasFile ? "sent a document" : "sent a message"} on ${m.number}. Open ${href}`,
    });
  }
  redirect(`/client/matters/${m.id}?msg=sent`);
}
