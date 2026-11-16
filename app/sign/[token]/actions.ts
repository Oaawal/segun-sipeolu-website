"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { q, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { signRequestByToken } from "@/lib/portal/signatures";
import { notify, emailLayout } from "@/lib/portal/notify";
import { portalUrl } from "@/lib/portal/reminders";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim();

async function meta() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || null, ua: (h.get("user-agent") || "").slice(0, 300) };
}

async function tellRequester(requestId: string, subject: string, line: string, matterId: string | null) {
  const p = await q<{ id: string; email: string; full_name: string; phone: string | null; notify_email: boolean; notify_sms: boolean }>(
    "SELECT u.id, u.email, u.full_name, u.phone, u.notify_email, FALSE AS notify_sms FROM signature_requests s JOIN users u ON u.id = s.created_by WHERE s.id = $1 AND u.active", [requestId]);
  const href = matterId ? `${portalUrl()}/matters/${matterId}?tab=client` : portalUrl();
  for (const r of p) await notify(r, { kind: "signature", key: `signature:${requestId}:${subject}`, subject, html: emailLayout(subject, [{ heading: "Signature", items: [{ title: line, href }] }], "", href), text: `${line} ${href}` });
}

export async function signDocument(fd: FormData) {
  const token = String(fd.get("token") || "");
  const r = await signRequestByToken(token);
  if (!r || r.status !== "sent" || r.current_sha !== r.doc_sha256) redirect(`/sign/${token}`);
  const name = String(fd.get("signed_name") || "").trim().slice(0, 160);
  // The typed name must match the person the request was sent to (ignoring case and accents)
  if (fd.get("agree") !== "1" || !name || norm(name) !== norm(r.signer_name)) redirect(`/sign/${token}?e=1`);
  const { ip, ua } = await meta();
  await tx(async (t) => {
    const done = await t.query("UPDATE signature_requests SET status = 'signed', signed_at = now(), signed_name = $2, signed_ip = $3, signed_ua = $4 WHERE id = $1 AND status = 'sent' RETURNING signed_at", [r.id, name, ip, ua]);
    if (!done.rows.length) return;
    if (r.matter_id) {
      await t.query("INSERT INTO matter_notes (id, matter_id, kind, body) VALUES ($1,$2,'system',$3)", [crypto.randomUUID(), r.matter_id,
        `SIGNED: "${r.title}" signed electronically by ${name} (${r.signer_email}) on ${new Date().toISOString()} from ${ip || "unknown address"}. Document SHA-256: ${r.doc_sha256}.`]);
    }
    await audit({ actor: `signer:${r.signer_email}`, action: "signature.signed", entityType: "document", entityId: r.document_id, matterId: r.matter_id, ip, detail: { request: r.id, signed_name: name, sha256: r.doc_sha256, user_agent: ua } }, t);
  });
  await tellRequester(r.id, `Signed: ${r.title}`, `${name} signed "${r.title}".`, r.matter_id).catch(() => {});
  redirect(`/sign/${token}`);
}

export async function declineDocument(fd: FormData) {
  const token = String(fd.get("token") || "");
  const r = await signRequestByToken(token);
  if (!r || r.status !== "sent") redirect(`/sign/${token}`);
  const reason = String(fd.get("reason") || "").trim().slice(0, 500) || null;
  const { ip } = await meta();
  await tx(async (t) => {
    await t.query("UPDATE signature_requests SET status = 'declined', decline_reason = $2 WHERE id = $1 AND status = 'sent'", [r.id, reason]);
    await audit({ actor: `signer:${r.signer_email}`, action: "signature.declined", entityType: "document", entityId: r.document_id, matterId: r.matter_id, ip, detail: { request: r.id, reason } }, t);
  });
  await tellRequester(r.id, `Declined: ${r.title}`, `${r.signer_name} declined to sign "${r.title}"${reason ? `: ${reason}` : "."}`, r.matter_id).catch(() => {});
  redirect(`/sign/${token}`);
}
