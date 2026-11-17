"use server";

import { redirect } from "next/navigation";
import { one, q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { canSeeMatter } from "@/lib/portal/permissions";
import { matterFacts } from "@/lib/portal/guards";
import { randomToken, sha256 } from "@/lib/portal/crypto";
import { isUuid, str } from "@/lib/portal/format";
import { sendClientEmail, siteUrl } from "@/lib/portal/client-mail";
import { emailEnabled } from "@/lib/portal/notify";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function matterForClientWork(fd: FormData) {
  const u = await requirePermission("clientportal.use");
  const m = await matterFacts(u, fd.get("matter_id"));
  if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) redirect("/portal/matters?msg=denied");
  const extra = await one<{ client_id: string; share_with_client: boolean }>("SELECT client_id, share_with_client FROM matters WHERE id = $1", [m.id]);
  return { u, m: { ...m, ...extra! }, url: `/portal/matters/${m.id}?tab=client` };
}

// ── Client sign-ins (on the client's page) ──────────────────────
export async function inviteClientUser(fd: FormData) {
  const u = await requirePermission("clientportal.invite");
  const clientId = String(fd.get("client_id") || "");
  const back = `/portal/clients/${clientId}`;
  const client = isUuid(clientId) ? await one<{ id: string; name: string }>("SELECT id, name FROM clients WHERE id = $1", [clientId]) : null;
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const name = str(fd, "full_name", 120);
  if (!client || !name || !EMAIL.test(email)) redirect(`${back}?msg=invalid`);
  const existing = await one<{ id: string; client_id: string }>("SELECT id, client_id FROM client_users WHERE email = $1", [email]);
  if (existing && existing.client_id !== client.id) redirect(`${back}?msg=client_email_taken`);
  const id = existing?.id ?? crypto.randomUUID();
  const token = randomToken();
  await tx(async (t) => {
    if (!existing) await t.query("INSERT INTO client_users (id, client_id, email, full_name, phone, created_by) VALUES ($1,$2,$3,$4,$5,$6)", [id, client.id, email, name, str(fd, "phone", 40), u.id]);
    else await t.query("UPDATE client_users SET active = TRUE, full_name = $2 WHERE id = $1", [id, name]);
    await t.query("INSERT INTO client_tokens (token_hash, client_user_id, purpose, expires_at) VALUES ($1,$2,'invite', now() + interval '7 days')", [sha256(token), id]);
    await audit({ userId: u.id, actor: u.email, action: "client_portal.invited", entityType: "client", entityId: client.id, detail: { email } }, t);
  });
  const link = `${siteUrl()}/client/invite/${token}`;
  let emailed = false;
  if (emailEnabled() && fd.get("send") === "1") {
    try {
      await sendClientEmail({ to: email, name, subject: "Your client portal with Segun Sipeolu & Associates", heading: "Your client portal is ready",
        paragraphs: [`Dear ${name},`, "You have been given access to the firm's secure client portal, where you can follow your matters, read and send documents and message your lawyers.", "Use the button below within 7 days to choose your password."],
        button: { label: "Set up my access", href: link } });
      emailed = true;
    } catch { /* the link is still shown */ }
  }
  // The link is shown once, to the person who created it
  redirect(`${back}?msg=client_invited&link=${encodeURIComponent(link)}${emailed ? "&emailed=1" : ""}`);
}

export async function setClientUserActive(fd: FormData) {
  const u = await requirePermission("clientportal.invite");
  const id = String(fd.get("id") || "");
  const cu = isUuid(id) ? await one<{ client_id: string; email: string }>("SELECT client_id, email FROM client_users WHERE id = $1", [id]) : null;
  if (!cu) redirect("/portal/clients?msg=denied");
  const active = fd.get("active") === "1";
  await tx(async (t) => {
    await t.query("UPDATE client_users SET active = $2 WHERE id = $1", [id, active]);
    if (!active) await t.query("DELETE FROM client_sessions WHERE client_user_id = $1", [id]);
    await audit({ userId: u.id, actor: u.email, action: active ? "client_portal.reactivated" : "client_portal.deactivated", entityType: "client", entityId: cu.client_id, detail: { email: cu.email } }, t);
  });
  redirect(`/portal/clients/${cu.client_id}?msg=saved`);
}

// ── Sharing on a matter ─────────────────────────────────────────
export async function setMatterShared(fd: FormData) {
  const { u, m, url } = await matterForClientWork(fd);
  const on = fd.get("on") === "1";
  await tx(async (t) => {
    await t.query("UPDATE matters SET share_with_client = $2, updated_at = now() WHERE id = $1", [m.id, on]);
    await audit({ userId: u.id, actor: u.email, action: on ? "client_portal.matter_shared" : "client_portal.matter_unshared", entityType: "matter", entityId: m.id, matterId: m.id }, t);
  });
  redirect(`${url}&msg=${on ? "shared" : "unshared"}`);
}

export async function setDocumentShared(fd: FormData) {
  const { u, m, url } = await matterForClientWork(fd);
  const docId = String(fd.get("document_id") || "");
  const on = fd.get("on") === "1";
  const d = isUuid(docId) ? await one<{ title: string; privileged: boolean }>("SELECT title, privileged FROM documents WHERE id = $1 AND matter_id = $2 AND owner_type = 'matter' AND deleted_at IS NULL", [docId, m.id]) : null;
  if (!d) redirect(`${url}&msg=invalid`);
  await tx(async (t) => {
    await t.query("UPDATE documents SET shared_with_client = $2 WHERE id = $1", [docId, on]);
    await audit({ userId: u.id, actor: u.email, action: on ? "document.shared_with_client" : "document.unshared_with_client", entityType: "document", entityId: docId, matterId: m.id, detail: { title: d.title } }, t);
  });
  redirect(`${url}&msg=${on ? "shared" : "unshared"}`);
}

/** Reply to the client; they get an email that a message is waiting (never the text itself). */
export async function replyToClient(fd: FormData) {
  const { u, m, url } = await matterForClientWork(fd);
  const body = str(fd, "body", 5000);
  if (!body) redirect(`${url}&msg=invalid`);
  if (!m.share_with_client) redirect(`${url}&msg=not_shared`);
  await tx(async (t) => {
    await t.query("INSERT INTO client_messages (id, matter_id, from_client, staff_user_id, body) VALUES ($1,$2,FALSE,$3,$4)", [crypto.randomUUID(), m.id, u.id, body]);
    await t.query("UPDATE client_messages SET read_at = now() WHERE matter_id = $1 AND from_client AND read_at IS NULL", [m.id]);
    await audit({ userId: u.id, actor: u.email, action: "client_portal.replied", entityType: "matter", entityId: m.id, matterId: m.id }, t);
  });
  if (emailEnabled()) {
    const people = await q<{ email: string; full_name: string }>("SELECT email, full_name FROM client_users WHERE client_id = $1 AND active AND password_hash IS NOT NULL", [m.client_id]);
    for (const p of people) {
      await sendClientEmail({ to: p.email, name: p.full_name, subject: "You have a new message from Segun Sipeolu & Associates", heading: "You have a new message",
        paragraphs: [`Dear ${p.full_name},`, "There is a new message for you. For your privacy, please read it in the client portal."],
        button: { label: "Read the message", href: `${siteUrl()}/client/matters/${m.id}` } }).catch(() => {});
    }
  }
  redirect(`${url}&msg=sent`);
}

export async function markClientMessagesRead(fd: FormData) {
  const { m, url } = await matterForClientWork(fd);
  await q("UPDATE client_messages SET read_at = now() WHERE matter_id = $1 AND from_client AND read_at IS NULL", [m.id]);
  redirect(url);
}

// ── Electronic signatures ───────────────────────────────────────
export async function requestSignature(fd: FormData) {
  const { u, m, url } = await matterForClientWork(fd);
  await requirePermission("signatures.request");
  const docId = String(fd.get("document_id") || "");
  const email = String(fd.get("signer_email") || "").trim().toLowerCase();
  const name = str(fd, "signer_name", 120);
  const days = Math.min(30, Math.max(1, Number(fd.get("days")) || 14));
  const d = isUuid(docId) ? await one<{ id: string; title: string; sha256: string }>("SELECT id, title, sha256 FROM documents WHERE id = $1 AND matter_id = $2 AND owner_type = 'matter' AND deleted_at IS NULL", [docId, m.id]) : null;
  if (!d || !name || !EMAIL.test(email)) redirect(`${url}&msg=invalid`);
  const token = randomToken();
  const id = crypto.randomUUID();
  const message = str(fd, "message", 1000);
  await tx(async (t) => {
    await t.query(`INSERT INTO signature_requests (id, document_id, matter_id, signer_name, signer_email, message, token_hash, doc_sha256, expires_at, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + ($9::int * interval '1 day'), $10)`, [id, d.id, m.id, name, email, message, sha256(token), d.sha256, days, u.id]);
    await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, `Signature requested from ${name} (${email}) on "${d.title}"`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "signature.requested", entityType: "document", entityId: d.id, matterId: m.id, detail: { request: id, signer: email, sha256: d.sha256 } }, t);
  });
  const link = `${siteUrl()}/sign/${token}`;
  let emailed = false;
  if (emailEnabled()) {
    try {
      // The document's name and any note are shown on the signing page, not in the email
      await sendClientEmail({ to: email, name, subject: "A document from Segun Sipeolu & Associates is waiting for your signature", heading: "A document is ready for your signature",
        paragraphs: [`Dear ${name},`, "Segun Sipeolu & Associates asks you to read and sign a document.", `The link works for ${days} days. You can read and download the document before you sign.`],
        button: { label: "Read and sign", href: link } });
      emailed = true;
    } catch { /* link shown instead */ }
  }
  redirect(`${url}&msg=signature_sent&link=${encodeURIComponent(link)}${emailed ? "&emailed=1" : ""}`);
}

export async function cancelSignature(fd: FormData) {
  const { u, m, url } = await matterForClientWork(fd);
  const id = String(fd.get("request_id") || "");
  await tx(async (t) => {
    const r = await t.query("UPDATE signature_requests SET status = 'cancelled' WHERE id = $1 AND matter_id = $2 AND status = 'sent' RETURNING id", [id, m.id]);
    if (r.rows.length) await audit({ userId: u.id, actor: u.email, action: "signature.cancelled", entityType: "signature_request", entityId: id, matterId: m.id }, t);
  });
  redirect(`${url}&msg=saved`);
}
