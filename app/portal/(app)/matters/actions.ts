"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { one, tx, nextNumber } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { can, canSeeMatter, type Actor } from "@/lib/portal/permissions";
import { dateField, isUuid, oneOf, str, today } from "@/lib/portal/format";
import { CLIENT_KINDS, FIRM, MATTER_CODE, MATTER_STATUS, MATTER_TYPES, PARTY_ROLES, nameKey, type MatterType } from "@/lib/portal/vocab";

const NOTE_KINDS = { note: 1, attendance: 1, call: 1 } as const;

/** Every matter mutation re-checks access here; the page hiding a button is not enough. */
async function writableMatter(u: Actor, id: unknown) {
  if (!isUuid(id)) redirect("/portal/matters");
  const m = await one<{ id: string; number: string; confidential: boolean; is_member: boolean; status: string }>(
    `SELECT m.id, m.number, m.confidential, m.status, EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $2) AS is_member
     FROM matters m WHERE m.id = $1`,
    [id, u.id],
  );
  if (!m || !canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) redirect("/portal/matters?msg=denied");
  return m;
}

// ── Clients ──────────────────────────────────────────────────────
export async function saveClient(fd: FormData) {
  const u = await requireUser();
  const id = String(fd.get("id") || "");
  if (!can(u, id ? "clients.edit" : "clients.create")) redirect("/portal/clients?msg=denied");
  const name = str(fd, "name", 200);
  if (!name) redirect(`/portal/clients/${id || "new"}?msg=invalid`);
  const v = {
    kind: oneOf(fd, "kind", CLIENT_KINDS, "individual"),
    rc: str(fd, "rc_number", 40), email: str(fd, "email", 254)?.toLowerCase() || null, phone: str(fd, "phone", 40),
    address: str(fd, "address", 500), contact: str(fd, "contact_person", 120), source: str(fd, "source", 80), notes: str(fd, "notes", 4000),
    kyc: fd.get("kyc_verified") === "1",
  };
  if (id) {
    if (!isUuid(id)) redirect("/portal/clients");
    await tx(async (t) => {
      await t.query(
        `UPDATE clients SET kind=$2, name=$3, name_key=$4, rc_number=$5, email=$6, phone=$7, address=$8, contact_person=$9, source=$10, notes=$11, kyc_verified=$12, updated_at=now() WHERE id=$1`,
        [id, v.kind, name, nameKey(name), v.rc, v.email, v.phone, v.address, v.contact, v.source, v.notes, v.kyc],
      );
      await audit({ userId: u.id, actor: u.email, action: "client.updated", entityType: "client", entityId: id }, t);
    });
    redirect(`/portal/clients/${id}?msg=saved`);
  }
  const newId = crypto.randomUUID();
  await tx(async (t) => {
    await t.query(
      `INSERT INTO clients (id, kind, name, name_key, rc_number, email, phone, address, contact_person, source, notes, kyc_verified, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [newId, v.kind, name, nameKey(name), v.rc, v.email, v.phone, v.address, v.contact, v.source, v.notes, v.kyc, u.id],
    );
    await audit({ userId: u.id, actor: u.email, action: "client.created", entityType: "client", entityId: newId, detail: { name } }, t);
  });
  const next = String(fd.get("next") || "");
  redirect(next === "matter" && can(u, "matters.create") ? `/portal/matters/new?client=${newId}` : `/portal/clients/${newId}?msg=created`);
}

// ── Matters ──────────────────────────────────────────────────────
export async function createMatter(fd: FormData) {
  const u = await requireUser();
  if (!can(u, "matters.create")) redirect("/portal/matters?msg=denied");
  const clientId = String(fd.get("client_id") || "");
  const title = str(fd, "title", 250);
  const type = oneOf(fd, "matter_type", MATTER_TYPES, "other") as MatterType;
  const area = str(fd, "practice_area", 120);
  if (!isUuid(clientId) || !title || !area) redirect(`/portal/matters/new?msg=invalid${isUuid(clientId) ? `&client=${clientId}` : ""}`);
  if (fd.get("conflict_cleared") !== "1") redirect(`/portal/matters/new?msg=invalid&client=${clientId}`);
  const client = await one<{ id: string; name: string }>("SELECT id, name FROM clients WHERE id = $1", [clientId]);
  if (!client) redirect("/portal/matters/new?msg=invalid");

  const partner = String(fd.get("responsible_partner") || "");
  const partnerOk = isUuid(partner) && (await one("SELECT 1 FROM users WHERE id = $1 AND active AND role IN ('admin','partner')", [partner]));
  const confidential = fd.get("confidential") === "1" && can(u, "matters.set_confidential");
  const members = new Set<string>([u.id, ...(partnerOk ? [partner] : []), ...fd.getAll("members").map(String).filter(isUuid)]);
  const opposing = String(fd.get("opposing") || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const id = crypto.randomUUID();

  const number = await tx(async (t) => {
    const number = await nextNumber(t, `${FIRM.prefix}/${MATTER_CODE[type]}`);
    await t.query(
      `INSERT INTO matters (id, number, title, client_id, practice_area, matter_type, status, confidential, responsible_partner, court, suit_number, judge, description, opened_on, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, number, title, clientId, area, type, confidential, partnerOk ? partner : null, str(fd, "court", 160), str(fd, "suit_number", 80), str(fd, "judge", 120), str(fd, "description", 6000), dateField(fd, "opened_on") || today(), u.id],
    );
    for (const m of members) {
      const ok = (await t.query("SELECT 1 FROM users WHERE id = $1 AND active", [m])).rows.length;
      if (ok) await t.query("INSERT INTO matter_members (matter_id, user_id, role, added_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [id, m, m === u.id ? "lead" : "member", u.id]);
    }
    for (const name of opposing) {
      await t.query("INSERT INTO parties (id, matter_id, name, name_key, role, created_by) VALUES ($1,$2,$3,$4,$5,$6)", [crypto.randomUUID(), id, name.slice(0, 200), nameKey(name), type === "transaction" ? "counterparty" : "defendant", u.id]);
    }
    await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), id, `Matter opened. Conflict check cleared by ${u.full_name}${String(fd.get("conflict_query") || "") ? ` (searched: ${String(fd.get("conflict_query")).slice(0, 200)})` : ""}.`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "matter.created", entityType: "matter", entityId: id, matterId: id, detail: { number, confidential, conflictCleared: true } }, t);
    return number;
  });
  revalidatePath("/portal/matters");
  redirect(`/portal/matters/${id}?msg=created&n=${encodeURIComponent(number)}`);
}

export async function updateMatter(fd: FormData) {
  const u = await requireUser();
  const m = await writableMatter(u, fd.get("id"));
  if (!can(u, "matters.create") && !m.is_member) redirect(`/portal/matters/${m.id}?msg=denied`);
  const status = oneOf(fd, "status", MATTER_STATUS, "open");
  const confidential = can(u, "matters.set_confidential") ? fd.get("confidential") === "1" : m.confidential;
  const partner = String(fd.get("responsible_partner") || "");
  const partnerOk = isUuid(partner) && (await one("SELECT 1 FROM users WHERE id = $1 AND active AND role IN ('admin','partner')", [partner]));
  await tx(async (t) => {
    await t.query(
      `UPDATE matters SET title=$2, practice_area=$3, status=$4, confidential=$5, responsible_partner=$6, court=$7, suit_number=$8, judge=$9, description=$10,
              closed_on = CASE WHEN $4 = 'closed' THEN COALESCE(closed_on, CURRENT_DATE) ELSE NULL END, updated_at = now() WHERE id = $1`,
      [m.id, str(fd, "title", 250) || "Untitled matter", str(fd, "practice_area", 120) || "General", status, confidential, partnerOk ? partner : null, str(fd, "court", 160), str(fd, "suit_number", 80), str(fd, "judge", 120), str(fd, "description", 6000)],
    );
    if (status !== m.status) await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, `Status changed from ${MATTER_STATUS[m.status as keyof typeof MATTER_STATUS]} to ${MATTER_STATUS[status]}.`, u.id]);
    if (confidential !== m.confidential) await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, confidential ? "Ethical wall placed: only the matter team can see this matter." : "Ethical wall removed.", u.id]);
    await audit({ userId: u.id, actor: u.email, action: "matter.updated", entityType: "matter", entityId: m.id, matterId: m.id, detail: { status, confidential } }, t);
  });
  redirect(`/portal/matters/${m.id}?tab=details&msg=saved`);
}

export async function addNote(fd: FormData) {
  const u = await requireUser();
  const m = await writableMatter(u, fd.get("matter_id"));
  const body = str(fd, "body", 8000);
  const kind = oneOf(fd, "kind", NOTE_KINDS, "note");
  if (!body) redirect(`/portal/matters/${m.id}?tab=notes&msg=invalid`);
  await tx(async (t) => {
    await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,$3,$4,$5)", [crypto.randomUUID(), m.id, kind, body, u.id]);
    await t.query("UPDATE matters SET updated_at = now() WHERE id = $1", [m.id]);
    await audit({ userId: u.id, actor: u.email, action: "matter.note_added", entityType: "matter", entityId: m.id, matterId: m.id, detail: { kind } }, t);
  });
  redirect(`/portal/matters/${m.id}?tab=notes&msg=saved`);
}

export async function addParty(fd: FormData) {
  const u = await requireUser();
  const m = await writableMatter(u, fd.get("matter_id"));
  const name = str(fd, "name", 200);
  if (!name) redirect(`/portal/matters/${m.id}?tab=parties&msg=invalid`);
  const role = oneOf(fd, "role", PARTY_ROLES, "related");
  await tx(async (t) => {
    await t.query("INSERT INTO parties (id, matter_id, name, name_key, role, contact, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [crypto.randomUUID(), m.id, name, nameKey(name), role, str(fd, "contact", 300), str(fd, "notes", 1000), u.id]);
    await audit({ userId: u.id, actor: u.email, action: "matter.party_added", entityType: "matter", entityId: m.id, matterId: m.id, detail: { role } }, t);
  });
  redirect(`/portal/matters/${m.id}?tab=parties&msg=saved`);
}

export async function removeParty(fd: FormData) {
  const u = await requireUser();
  const m = await writableMatter(u, fd.get("matter_id"));
  const pid = String(fd.get("party_id") || "");
  if (!isUuid(pid)) redirect(`/portal/matters/${m.id}?tab=parties`);
  await tx(async (t) => {
    const p = (await t.query<{ name: string }>("DELETE FROM parties WHERE id = $1 AND matter_id = $2 RETURNING name", [pid, m.id])).rows[0];
    if (p) {
      await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, `Party removed: ${p.name}`, u.id]);
      await audit({ userId: u.id, actor: u.email, action: "matter.party_removed", entityType: "matter", entityId: m.id, matterId: m.id }, t);
    }
  });
  redirect(`/portal/matters/${m.id}?tab=parties&msg=removed`);
}

export async function addMember(fd: FormData) {
  const u = await requireUser();
  const m = await writableMatter(u, fd.get("matter_id"));
  if (!can(u, "matters.manage_team")) redirect(`/portal/matters/${m.id}?tab=team&msg=denied`);
  const uid = String(fd.get("user_id") || "");
  const target = isUuid(uid) ? await one<{ full_name: string; role: string }>("SELECT full_name, role FROM users WHERE id = $1 AND active", [uid]) : null;
  if (!target || target.role === "front_desk") redirect(`/portal/matters/${m.id}?tab=team&msg=invalid`);
  await tx(async (t) => {
    await t.query("INSERT INTO matter_members (matter_id, user_id, role, added_by) VALUES ($1,$2,$3,$4) ON CONFLICT (matter_id, user_id) DO UPDATE SET role = $3", [m.id, uid, fd.get("role") === "lead" ? "lead" : "member", u.id]);
    await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, `${target.full_name} added to the matter team.`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "matter.member_added", entityType: "matter", entityId: m.id, matterId: m.id, detail: { user: uid } }, t);
  });
  redirect(`/portal/matters/${m.id}?tab=team&msg=member_added`);
}

export async function removeMember(fd: FormData) {
  const u = await requireUser();
  const m = await writableMatter(u, fd.get("matter_id"));
  if (!can(u, "matters.manage_team")) redirect(`/portal/matters/${m.id}?tab=team&msg=denied`);
  const uid = String(fd.get("user_id") || "");
  if (!isUuid(uid)) redirect(`/portal/matters/${m.id}?tab=team`);
  await tx(async (t) => {
    const r = (await t.query<{ full_name: string }>("DELETE FROM matter_members mm USING users u WHERE mm.matter_id = $1 AND mm.user_id = $2 AND u.id = mm.user_id RETURNING u.full_name", [m.id, uid])).rows[0];
    if (r) {
      await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, `${r.full_name} removed from the matter team.`, u.id]);
      await audit({ userId: u.id, actor: u.email, action: "matter.member_removed", entityType: "matter", entityId: m.id, matterId: m.id, detail: { user: uid } }, t);
    }
  });
  redirect(`/portal/matters/${m.id}?tab=team&msg=member_removed`);
}
