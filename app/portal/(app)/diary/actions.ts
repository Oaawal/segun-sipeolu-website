"use server";

import { redirect } from "next/navigation";
import { one, tx } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requireUser } from "@/lib/portal/auth";
import { requireDiaryAccess } from "@/lib/portal/guards";
import { addDays, dateField, fmtDay, isUuid, oneOf, str, today } from "@/lib/portal/format";
import { HEARING_STATUS } from "@/lib/portal/vocab";

function back(fd: FormData, fallback: string) {
  const b = String(fd.get("back") || "");
  return /^\/portal\/[A-Za-z0-9/_\-?=&%.]*$/.test(b) ? b : fallback;
}
const withMsg = (path: string, msg: string) => `${path}${path.includes("?") ? "&" : "?"}msg=${msg}`;

async function staffId(v: FormDataEntryValue | null) {
  const id = String(v || "");
  return isUuid(id) && (await one("SELECT 1 FROM users WHERE id = $1 AND active AND role != 'front_desk'", [id])) ? id : null;
}

export async function addHearing(fd: FormData) {
  const u = await requireUser();
  const m = await requireDiaryAccess(u, fd.get("matter_id"));
  const to = back(fd, `/portal/matters/${m.id}?tab=diary`);
  const day = dateField(fd, "sitting_on");
  const court = str(fd, "court", 160) || m.court;
  const business = str(fd, "business", 120);
  if (!day || !court || !business) redirect(withMsg(to, "invalid"));
  const id = crypto.randomUUID();
  await tx(async (t) => {
    await t.query(
      `INSERT INTO hearings (id, matter_id, sitting_on, sitting_time, court, judge, suit_number, business, appearing, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
      [id, m.id, day, str(fd, "sitting_time", 10), court, str(fd, "judge", 120) || m.judge, str(fd, "suit_number", 80) || m.suit_number, business, await staffId(fd.get("appearing")), u.id],
    );
    await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), m.id, `Court date added: ${fmtDay(day)} · ${business} · ${court}`, u.id]);
    await audit({ userId: u.id, actor: u.email, action: "diary.added", entityType: "hearing", entityId: id, matterId: m.id, detail: { day, business } }, t);
  });
  redirect(withMsg(to, "saved"));
}

/**
 * Record what happened at a sitting. When adjourned, the next sitting is
 * created and linked, so the matter's court history reads as one chain.
 */
export async function recordOutcome(fd: FormData) {
  const u = await requireUser();
  const hid = String(fd.get("hearing_id") || "");
  if (!isUuid(hid)) redirect("/portal/diary");
  const h = await one<{ id: string; matter_id: string; sitting_on: string; court: string; judge: string | null; suit_number: string | null; appearing: string | null; sitting_time: string | null; business: string }>("SELECT * FROM hearings WHERE id = $1", [hid]);
  if (!h) redirect("/portal/diary");
  const m = await requireDiaryAccess(u, h.matter_id);
  const to = back(fd, `/portal/matters/${m.id}?tab=diary`);
  const status = oneOf(fd, "status", HEARING_STATUS, "held");
  const outcome = str(fd, "outcome", 4000);
  const nextDay = dateField(fd, "next_date");
  const nextBusiness = str(fd, "next_business", 120);
  if (status === "adjourned" && (!nextDay || !nextBusiness)) redirect(withMsg(to, "invalid"));
  await tx(async (t) => {
    await t.query("UPDATE hearings SET status = $2, outcome = $3, updated_at = now(), updated_by = $4 WHERE id = $1", [h.id, status, outcome, u.id]);
    let line = `Court (${fmtDay(h.sitting_on)}, ${h.business}): ${HEARING_STATUS[status]}.${outcome ? ` ${outcome}` : ""}`;
    if (nextDay && nextBusiness) {
      const nid = crypto.randomUUID();
      await t.query(
        `INSERT INTO hearings (id, matter_id, sitting_on, sitting_time, court, judge, suit_number, business, appearing, previous_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [nid, h.matter_id, nextDay, str(fd, "next_time", 10) || h.sitting_time, h.court, h.judge, h.suit_number, nextBusiness, (await staffId(fd.get("next_appearing"))) || h.appearing, h.id, u.id],
      );
      line += ` Next date: ${fmtDay(nextDay)} for ${nextBusiness}.`;
      if (fd.get("prep_task") === "1") {
        const prepOn = addDays(nextDay, -3) < today() ? today() : addDays(nextDay, -3);
        await t.query(
          "INSERT INTO tasks (id, title, matter_id, assigned_to, due_on, kind, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,'deadline','high',$6,$7)",
          [crypto.randomUUID(), `Prepare for ${nextBusiness.toLowerCase()} on ${fmtDay(nextDay)} (${m.number})`, h.matter_id, (await staffId(fd.get("next_appearing"))) || h.appearing || u.id, prepOn, `hearing:${nid}`, u.id],
        );
      }
    }
    await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), h.matter_id, line, u.id]);
    await t.query("UPDATE matters SET updated_at = now() WHERE id = $1", [h.matter_id]);
    await audit({ userId: u.id, actor: u.email, action: "diary.outcome", entityType: "hearing", entityId: h.id, matterId: h.matter_id, detail: { status, next: nextDay } }, t);
  });
  redirect(withMsg(to, nextDay ? "adjourned" : "saved"));
}
