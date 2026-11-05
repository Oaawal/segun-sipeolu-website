"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { addDays, dateField, isUuid, oneOf, str } from "@/lib/portal/format";
import { ENTITY_TYPES, FILING_KINDS, OFFICER_ROLES } from "@/lib/portal/vocab";

async function entity(id: unknown) {
  if (!isUuid(id) || !(await one("SELECT 1 FROM entities WHERE id = $1", [id]))) redirect("/portal/cosec");
  return id as string;
}
const back = (id: string, tab: string, msg = "saved") => redirect(`/portal/cosec/${id}?tab=${tab}&msg=${msg}`);

export async function saveEntity(fd: FormData) {
  const u = await requirePermission("cosec.edit");
  const id = String(fd.get("id") || "");
  const name = str(fd, "name", 200);
  if (!name) redirect(`/portal/cosec${isUuid(id) ? `/${id}` : ""}?msg=invalid`);
  const client = String(fd.get("client_id") || "");
  const clientId = isUuid(client) && (await one("SELECT 1 FROM clients WHERE id = $1", [client])) ? client : null;
  const v = [clientId, name, oneOf(fd, "entity_type", ENTITY_TYPES, "private_ltd"), str(fd, "rc_number", 40), dateField(fd, "incorporated_on"), str(fd, "registered_address", 500),
    str(fd, "share_capital", 120), str(fd, "tin", 40), str(fd, "firm_role", 60), oneOf(fd, "status", { active: 1, dormant: 1, struck_off: 1, dissolved: 1 }, "active"), str(fd, "notes", 4000)];
  if (isUuid(id)) {
    await tx(async (t) => {
      await t.query("UPDATE entities SET client_id=$2, name=$3, entity_type=$4, rc_number=$5, incorporated_on=$6, registered_address=$7, share_capital=$8, tin=$9, firm_role=$10, status=$11, notes=$12, updated_at=now() WHERE id=$1", [id, ...v]);
      await audit({ userId: u.id, actor: u.email, action: "cosec.entity_updated", entityType: "entity", entityId: id }, t);
    });
    back(id, "details");
  }
  const nid = crypto.randomUUID();
  const inc = v[4] as string | null;
  await tx(async (t) => {
    await t.query("INSERT INTO entities (id, client_id, name, entity_type, rc_number, incorporated_on, registered_address, share_capital, tin, firm_role, status, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [nid, ...v, u.id]);
    // A sensible first deadline to start from; the lawyer confirms the date against CAMA and the company's position
    if (inc && fd.get("first_return") === "1") {
      const firstDue = v[2] === "business_name" ? addDays(inc, 365) : addDays(inc, 548);
      await t.query("INSERT INTO entity_filings (id, entity_id, kind, title, due_on, responsible, created_by) VALUES ($1,$2,'annual_return',$3,$4,$5,$5)",
        [crypto.randomUUID(), nid, "First annual return (check date)", firstDue, u.id]);
    }
    await audit({ userId: u.id, actor: u.email, action: "cosec.entity_created", entityType: "entity", entityId: nid, detail: { name } }, t);
  });
  redirect(`/portal/cosec/${nid}?msg=created`);
}

export async function addOfficer(fd: FormData) {
  const u = await requirePermission("cosec.edit");
  const id = await entity(fd.get("entity_id"));
  const name = str(fd, "name", 160);
  if (!name) back(id, "officers", "invalid");
  await tx(async (t) => {
    await t.query("INSERT INTO entity_officers (id, entity_id, name, role, nationality, address, appointed_on, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [crypto.randomUUID(), id, name, oneOf(fd, "role", OFFICER_ROLES, "director"), str(fd, "nationality", 60), str(fd, "address", 300), dateField(fd, "appointed_on"), str(fd, "notes", 500), u.id]);
    if (fd.get("filing_task") === "1") {
      const due = addDays(dateField(fd, "appointed_on") || new Date(Date.now() + 3600000).toISOString().slice(0, 10), 14);
      await t.query("INSERT INTO entity_filings (id, entity_id, kind, title, due_on, responsible, created_by) VALUES ($1,$2,'change_of_directors',$3,$4,$5,$5)", [crypto.randomUUID(), id, `Notify CAC of appointment: ${name}`, due, u.id]);
    }
    await audit({ userId: u.id, actor: u.email, action: "cosec.officer_added", entityType: "entity", entityId: id }, t);
  });
  back(id, "officers");
}

export async function ceaseOfficer(fd: FormData) {
  const u = await requirePermission("cosec.edit");
  const id = await entity(fd.get("entity_id"));
  const oid = String(fd.get("officer_id") || "");
  const on = dateField(fd, "ceased_on") || new Date(Date.now() + 3600000).toISOString().slice(0, 10);
  await tx(async (t) => {
    const r = (await t.query<{ name: string }>("UPDATE entity_officers SET ceased_on = $3 WHERE id = $1 AND entity_id = $2 AND ceased_on IS NULL RETURNING name", [oid, id, on])).rows[0];
    if (r) {
      await t.query("INSERT INTO entity_filings (id, entity_id, kind, title, due_on, responsible, created_by) VALUES ($1,$2,'change_of_directors',$3,$4,$5,$5)", [crypto.randomUUID(), id, `Notify CAC of cessation: ${r.name}`, addDays(on, 14), u.id]);
      await audit({ userId: u.id, actor: u.email, action: "cosec.officer_ceased", entityType: "entity", entityId: id }, t);
    }
  });
  back(id, "officers");
}

export async function addShareholding(fd: FormData) {
  const u = await requirePermission("cosec.edit");
  const id = await entity(fd.get("entity_id"));
  const holder = str(fd, "holder", 200);
  const shares = Number(String(fd.get("shares") || "").replace(/[,\s]/g, ""));
  if (!holder || !Number.isFinite(shares) || shares <= 0 || shares > 1e15) back(id, "shares", "invalid");
  await tx(async (t) => {
    await t.query("INSERT INTO entity_shareholdings (id, entity_id, holder, share_class, shares, acquired_on, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [crypto.randomUUID(), id, holder, str(fd, "share_class", 60) || "Ordinary", Math.round(shares), dateField(fd, "acquired_on"), str(fd, "notes", 500), u.id]);
    await audit({ userId: u.id, actor: u.email, action: "cosec.shares_added", entityType: "entity", entityId: id }, t);
  });
  back(id, "shares");
}

export async function ceaseShareholding(fd: FormData) {
  const u = await requirePermission("cosec.edit");
  const id = await entity(fd.get("entity_id"));
  await tx(async (t) => {
    await t.query("UPDATE entity_shareholdings SET ceased_on = CURRENT_DATE WHERE id = $1 AND entity_id = $2 AND ceased_on IS NULL", [String(fd.get("holding_id") || ""), id]);
    await audit({ userId: u.id, actor: u.email, action: "cosec.shares_ceased", entityType: "entity", entityId: id }, t);
  });
  back(id, "shares");
}

export async function addFiling(fd: FormData) {
  const u = await requirePermission("cosec.edit");
  const id = await entity(fd.get("entity_id"));
  const kind = oneOf(fd, "kind", FILING_KINDS, "other");
  const resp = String(fd.get("responsible") || "");
  await tx(async (t) => {
    await t.query("INSERT INTO entity_filings (id, entity_id, kind, title, due_on, responsible, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [crypto.randomUUID(), id, kind, str(fd, "title", 200) || FILING_KINDS[kind], dateField(fd, "due_on"), isUuid(resp) ? resp : u.id, str(fd, "notes", 500), u.id]);
    await audit({ userId: u.id, actor: u.email, action: "cosec.filing_added", entityType: "entity", entityId: id, detail: { kind } }, t);
  });
  back(id, "filings");
}

/** Mark a filing done. A filed annual return or AGM rolls the next one forward a year. */
export async function completeFiling(fd: FormData) {
  const u = await requirePermission("cosec.edit");
  const id = await entity(fd.get("entity_id"));
  const fid = String(fd.get("filing_id") || "");
  const waived = fd.get("waive") === "1";
  await tx(async (t) => {
    const f = (await t.query<{ kind: string; title: string; due_on: string | null; responsible: string | null }>(
      "UPDATE entity_filings SET status = $3, filed_on = CASE WHEN $3 = 'filed' THEN COALESCE($4::date, CURRENT_DATE) END, reference = $5 WHERE id = $1 AND entity_id = $2 AND status = 'due' RETURNING kind, title, due_on, responsible",
      [fid, id, waived ? "waived" : "filed", dateField(fd, "filed_on"), str(fd, "reference", 120)])).rows[0];
    if (f && !waived && (f.kind === "annual_return" || f.kind === "agm") && f.due_on) {
      const next = addDays(f.due_on, 365);
      await t.query("INSERT INTO entity_filings (id, entity_id, kind, title, due_on, responsible, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [crypto.randomUUID(), id, f.kind, `${f.kind === "agm" ? "AGM" : "Annual return"} ${next.slice(0, 4)}`, next, f.responsible, u.id]);
    }
    await audit({ userId: u.id, actor: u.email, action: waived ? "cosec.filing_waived" : "cosec.filing_filed", entityType: "entity", entityId: id }, t);
  });
  back(id, "filings");
}
