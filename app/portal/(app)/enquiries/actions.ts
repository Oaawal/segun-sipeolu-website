"use server";

import { redirect } from "next/navigation";
import { one, tx, nextNumber } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { isUuid, oneOf, str } from "@/lib/portal/format";
import { amountField } from "@/lib/portal/money";
import { nameKey } from "@/lib/portal/vocab";
import { announceEnquiry, ENQUIRY_SOURCES } from "@/lib/portal/enquiries";

export async function logEnquiry(fd: FormData) {
  const u = await requirePermission("intake.log");
  const name = str(fd, "name", 160);
  const summary = str(fd, "summary", 5000);
  if (!name || !summary) redirect("/portal/enquiries?msg=invalid");
  const assigned = String(fd.get("assigned_to") || "");
  const assignee = isUuid(assigned) && (await one("SELECT 1 FROM users WHERE id = $1 AND active AND role <> 'front_desk'", [assigned])) ? assigned : null;
  const id = crypto.randomUUID();
  const source = oneOf(fd, "source", ENQUIRY_SOURCES, "walk_in");
  const number = await tx(async (t) => {
    const n = await nextNumber(t, "ENQ");
    await t.query(`INSERT INTO enquiries (id, number, name, organisation, email, phone, practice_area, summary, other_parties, source, assigned_to, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, n, name, str(fd, "organisation", 160), str(fd, "email", 254)?.toLowerCase() ?? null, str(fd, "phone", 40), str(fd, "practice_area", 120), summary, str(fd, "other_parties", 2000), source, assignee, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "enquiry.logged", entityType: "enquiry", entityId: id }, t);
    return n;
  });
  await announceEnquiry({ id, number, name, practice_area: str(fd, "practice_area", 120), source }, assignee).catch(() => {});
  redirect(`/portal/enquiries/${id}?msg=enquiry_logged`);
}

async function enquiryFor(fd: FormData, perm: "intake.log" | "intake.decide" = "intake.decide") {
  const u = await requirePermission(perm);
  const id = String(fd.get("id") || "");
  const e = isUuid(id) ? await one<{ id: string; number: string; name: string; organisation: string | null; email: string | null; phone: string | null; status: string; client_id: string | null; practice_area: string | null; other_parties: string | null }>(
    "SELECT id, number, name, organisation, email, phone, status, client_id, practice_area, other_parties FROM enquiries WHERE id = $1", [id]) : null;
  if (!e) redirect("/portal/enquiries?msg=denied");
  return { u, e, url: `/portal/enquiries/${e.id}` };
}

export async function assignEnquiry(fd: FormData) {
  const { u, e, url } = await enquiryFor(fd, "intake.log");
  const who = String(fd.get("assigned_to") || "");
  const ok = isUuid(who) && (await one("SELECT 1 FROM users WHERE id = $1 AND active AND role <> 'front_desk'", [who]));
  await tx(async (t) => {
    await t.query("UPDATE enquiries SET assigned_to = $2, updated_at = now() WHERE id = $1", [e.id, ok ? who : null]);
    await audit({ userId: u.id, actor: u.email, action: "enquiry.assigned", entityType: "enquiry", entityId: e.id, detail: { to: ok ? who : null } }, t);
  });
  redirect(`${url}?msg=saved`);
}

export async function recordConflict(fd: FormData) {
  const { u, e, url } = await enquiryFor(fd);
  const found = fd.get("result") === "found";
  const note = str(fd, "conflict_note", 2000);
  if (found && !note) redirect(`${url}?msg=invalid`);
  await tx(async (t) => {
    await t.query("UPDATE enquiries SET status = $2, conflict_note = $3, conflict_by = $4, conflict_at = now(), updated_at = now() WHERE id = $1", [e.id, found ? "conflict_found" : "conflict_cleared", note, u.id]);
    await audit({ userId: u.id, actor: u.email, action: found ? "enquiry.conflict_found" : "enquiry.conflict_cleared", entityType: "enquiry", entityId: e.id, detail: { note } }, t);
  });
  redirect(`${url}?msg=saved`);
}

export async function quoteEnquiry(fd: FormData) {
  const { u, e, url } = await enquiryFor(fd);
  const amount = amountField(fd, "quote");
  if (!amount) redirect(`${url}?msg=invalid`);
  if (e.status === "conflict_found" || e.status === "new") redirect(`${url}?msg=conflict_first`);
  await tx(async (t) => {
    await t.query("UPDATE enquiries SET status = 'quoted', quote_kobo = $2, quote_note = $3, updated_at = now() WHERE id = $1", [e.id, amount, str(fd, "quote_note", 2000)]);
    await audit({ userId: u.id, actor: u.email, action: "enquiry.quoted", entityType: "enquiry", entityId: e.id, detail: { amount_kobo: amount } }, t);
  });
  redirect(`${url}?msg=saved`);
}

export async function closeEnquiry(fd: FormData) {
  const { u, e, url } = await enquiryFor(fd, "intake.log");
  const status = fd.get("status") === "no_response" ? "no_response" : "declined";
  await tx(async (t) => {
    await t.query("UPDATE enquiries SET status = $2, decline_reason = $3, updated_at = now() WHERE id = $1", [e.id, status, str(fd, "reason", 1000)]);
    await audit({ userId: u.id, actor: u.email, action: `enquiry.${status}`, entityType: "enquiry", entityId: e.id }, t);
  });
  redirect(`${url}?msg=saved`);
}

/** Take the enquiry on: make (or pick) the client record, then open the matter with the conflict check pre-filled. */
export async function convertEnquiry(fd: FormData) {
  const { u, e, url } = await enquiryFor(fd);
  await requirePermission("matters.create");
  if (e.status === "conflict_found" || e.status === "new") redirect(`${url}?msg=conflict_first`);
  let clientId = String(fd.get("client_id") || "");
  if (!isUuid(clientId) || !(await one("SELECT 1 FROM clients WHERE id = $1", [clientId]))) {
    clientId = crypto.randomUUID();
    const cname = e.organisation || e.name;
    await tx(async (t) => {
      await t.query("INSERT INTO clients (id, kind, name, name_key, email, phone, contact_person, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [clientId, e.organisation ? "company" : "individual", cname, nameKey(cname), e.email, e.phone, e.organisation ? e.name : null, `Enquiry ${e.number}`, u.id]);
      await audit({ userId: u.id, actor: u.email, action: "client.created", entityType: "client", entityId: clientId, detail: { from_enquiry: e.number } }, t);
    });
  }
  await tx(async (t) => {
    await t.query("UPDATE enquiries SET client_id = $2, updated_at = now() WHERE id = $1", [e.id, clientId]);
    await audit({ userId: u.id, actor: u.email, action: "enquiry.converted", entityType: "enquiry", entityId: e.id, detail: { client: clientId } }, t);
  });
  const parties = (e.other_parties || "").split(/\n|;/).map((s) => s.trim()).filter(Boolean).join("\n");
  redirect(`/portal/matters/new?client=${clientId}&enquiry=${e.id}&checked=1${parties ? `&parties=${encodeURIComponent(parties)}` : ""}`);
}
