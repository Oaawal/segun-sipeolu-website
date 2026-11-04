import "server-only";
import { one, q } from "./db";
import { audit } from "./audit";
import { can, canSeeMatter, diaryAccessSql, matterAccessSql, type Actor } from "./permissions";
import { addDays, today } from "./format";
import { nameWords } from "./vocab";

/** Read-side queries. Every function takes the signed-in person and applies their access. */

export interface MatterRow {
  id: string; number: string; title: string; client_id: string; client_name: string; client_kind: string;
  practice_area: string; matter_type: string; status: string; confidential: boolean; responsible_partner: string | null;
  partner_name: string | null; court: string | null; suit_number: string | null; judge: string | null; description: string | null;
  opened_on: string; closed_on: string | null; created_at: string; updated_at: string; is_member: boolean; next_sitting?: string | null;
}

export async function listMatters(u: Actor, opts: { status?: string; q?: string; mine?: boolean } = {}) {
  const params: unknown[] = [u.id];
  const where = [matterAccessSql(u)];
  if (opts.status && opts.status !== "all") { params.push(opts.status); where.push(`m.status = $${params.length}`); }
  if (opts.mine) where.push("EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $1)");
  if (opts.q) {
    params.push(`%${opts.q.replace(/[%_\\]/g, (c) => "\\" + c)}%`);
    const p = `$${params.length}`;
    where.push(`(m.title ILIKE ${p} OR m.number ILIKE ${p} OR c.name ILIKE ${p} OR m.suit_number ILIKE ${p} OR m.practice_area ILIKE ${p})`);
  }
  return q<MatterRow>(
    `SELECT m.*, c.name AS client_name, c.kind AS client_kind, p.full_name AS partner_name,
            EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $1) AS is_member,
            (SELECT MIN(h.sitting_on) FROM hearings h WHERE h.matter_id = m.id AND h.status = 'scheduled' AND h.sitting_on >= CURRENT_DATE) AS next_sitting
     FROM matters m JOIN clients c ON c.id = m.client_id LEFT JOIN users p ON p.id = m.responsible_partner
     WHERE ${where.join(" AND ")}
     ORDER BY m.updated_at DESC LIMIT 300`,
    params,
  );
}

/**
 * Load a matter for viewing. Returns "denied" (and logs the attempt) when the
 * person is not allowed in, so pages can show a clear message.
 */
export async function loadMatter(u: Actor, id: string, { log = true } = {}): Promise<MatterRow | null | "denied"> {
  const m = await one<MatterRow>(
    `SELECT m.*, c.name AS client_name, c.kind AS client_kind, p.full_name AS partner_name,
            EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $2) AS is_member
     FROM matters m JOIN clients c ON c.id = m.client_id LEFT JOIN users p ON p.id = m.responsible_partner WHERE m.id = $1`,
    [id, u.id],
  );
  if (!m) return null;
  if (!canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member })) {
    await audit({ userId: u.id, actor: u.email, action: "matter.access_denied", entityType: "matter", entityId: m.id, matterId: m.id, detail: { number: m.number } });
    return "denied";
  }
  if (log) await audit({ userId: u.id, actor: u.email, action: "matter.viewed", entityType: "matter", entityId: m.id, matterId: m.id, detail: { number: m.number } });
  return m;
}

export async function staffList() {
  return q<{ id: string; full_name: string; role: string; title: string | null; email: string }>(
    "SELECT id, full_name, role, title, email FROM users WHERE active ORDER BY full_name",
  );
}

export async function matterTeam(matterId: string) {
  return q<{ user_id: string; full_name: string; role: string; title: string | null; user_role: string; email: string }>(
    `SELECT mm.user_id, u.full_name, mm.role, u.title, u.role AS user_role, u.email FROM matter_members mm JOIN users u ON u.id = mm.user_id
     WHERE mm.matter_id = $1 ORDER BY mm.role = 'lead' DESC, u.full_name`,
    [matterId],
  );
}

/** Matters a person may attach things to (for pickers). */
export async function pickableMatters(u: Actor) {
  return q<{ id: string; number: string; title: string }>(
    `SELECT m.id, m.number, m.title FROM matters m WHERE ${matterAccessSql(u)} AND m.status != 'closed' ORDER BY m.updated_at DESC LIMIT 400`,
    [u.id],
  );
}

// ── Court diary ─────────────────────────────────────────────────
export interface HearingRow {
  id: string; matter_id: string; matter_number: string; matter_title: string; sitting_on: string; sitting_time: string | null; court: string;
  judge: string | null; suit_number: string | null; business: string; appearing: string | null; appearing_name: string | null;
  status: string; outcome: string | null; previous_id: string | null; confidential: boolean;
}

export async function diary(u: Actor, from: string, to: string, opts: { mine?: boolean; matterId?: string } = {}) {
  const params: unknown[] = [u.id, from, to];
  const where = [diaryAccessSql(u), "h.sitting_on BETWEEN $2 AND $3"];
  if (opts.mine) where.push("(h.appearing = $1 OR EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $1))");
  if (opts.matterId) { params.push(opts.matterId); where.push(`h.matter_id = $${params.length}`); }
  return q<HearingRow>(
    `SELECT h.*, m.number AS matter_number, m.title AS matter_title, m.confidential, u.full_name AS appearing_name
     FROM hearings h JOIN matters m ON m.id = h.matter_id LEFT JOIN users u ON u.id = h.appearing
     WHERE ${where.join(" AND ")}
     ORDER BY h.sitting_on, h.sitting_time NULLS LAST, h.court`,
    params,
  );
}

export async function matterHearings(matterId: string) {
  return q<HearingRow>(
    `SELECT h.*, u.full_name AS appearing_name FROM hearings h LEFT JOIN users u ON u.id = h.appearing WHERE h.matter_id = $1 ORDER BY h.sitting_on DESC, h.created_at DESC`,
    [matterId],
  );
}

// ── Service register ────────────────────────────────────────────
export interface ServiceRow {
  id: string; number: string; direction: "in" | "out"; kind: string; title: string; matter_id: string | null; matter_number: string | null;
  matter_title: string | null; party: string; method: string; served_on: string; served_at: string | null; served_by: string | null;
  received_by: string | null; proof: string | null; response_due: string | null; handled_by: string | null; handler_name: string | null;
  status: string; notes: string | null; created_at: string; created_by: string | null; creator_name: string | null;
}

function serviceAccess(u: Actor) {
  // Entries not tied to a matter are visible to everyone who works the register
  if (can(u, "service.view_all")) return `(s.matter_id IS NULL OR ${diaryAccessSql(u)})`;
  return `((s.matter_id IS NULL AND (s.created_by = $1 OR s.handled_by = $1)) OR ${matterAccessSql(u)})`;
}

export async function listService(u: Actor, opts: { direction?: string; status?: string; q?: string; matterId?: string } = {}) {
  const params: unknown[] = [u.id];
  const where = [serviceAccess(u)];
  if (opts.direction === "in" || opts.direction === "out") { params.push(opts.direction); where.push(`s.direction = $${params.length}`); }
  if (opts.status === "open") where.push("s.status = 'open'");
  if (opts.status === "due") where.push("s.status = 'open' AND s.response_due IS NOT NULL AND s.response_due <= CURRENT_DATE + 7");
  if (opts.matterId) { params.push(opts.matterId); where.push(`s.matter_id = $${params.length}`); }
  if (opts.q) {
    params.push(`%${opts.q.replace(/[%_\\]/g, (c) => "\\" + c)}%`);
    const p = `$${params.length}`;
    where.push(`(s.title ILIKE ${p} OR s.number ILIKE ${p} OR s.party ILIKE ${p} OR m.number ILIKE ${p})`);
  }
  return q<ServiceRow>(
    `SELECT s.*, m.number AS matter_number, m.title AS matter_title, h.full_name AS handler_name, cu.full_name AS creator_name
     FROM service_register s LEFT JOIN matters m ON m.id = s.matter_id LEFT JOIN users h ON h.id = s.handled_by LEFT JOIN users cu ON cu.id = s.created_by
     WHERE ${where.join(" AND ")}
     ORDER BY s.served_on DESC, s.created_at DESC LIMIT 300`,
    params,
  );
}

export async function loadService(u: Actor, id: string) {
  const rows = await q<ServiceRow>(
    `SELECT s.*, m.number AS matter_number, m.title AS matter_title, h.full_name AS handler_name, cu.full_name AS creator_name
     FROM service_register s LEFT JOIN matters m ON m.id = s.matter_id LEFT JOIN users h ON h.id = s.handled_by LEFT JOIN users cu ON cu.id = s.created_by
     WHERE s.id = $2 AND ${serviceAccess(u)}`,
    [u.id, id],
  );
  return rows[0] ?? null;
}

// ── Tasks ───────────────────────────────────────────────────────
export interface TaskRow {
  id: string; title: string; detail: string | null; matter_id: string | null; matter_number: string | null; assigned_to: string | null;
  assignee_name: string | null; due_on: string | null; kind: string; priority: string; status: string; source: string | null;
  completed_at: string | null; created_at: string;
}

export async function listTasks(u: Actor, opts: { view?: string; matterId?: string } = {}) {
  const params: unknown[] = [u.id];
  // Tasks on matters you cannot open stay hidden even if assigned to you; tasks without a matter are visible to their assignee and creator
  const where = [`((t.matter_id IS NULL AND (t.assigned_to = $1 OR t.created_by = $1 OR $1::uuid IN (SELECT id FROM users WHERE role = 'admin'))) OR (t.matter_id IS NOT NULL AND ${matterAccessSql(u)}))`];
  const view = opts.view || "mine";
  if (view === "mine") where.push("t.status = 'open' AND t.assigned_to = $1");
  if (view === "open") where.push("t.status = 'open'");
  if (view === "overdue") where.push("t.status = 'open' AND t.due_on < CURRENT_DATE");
  if (view === "deadlines") where.push("t.status = 'open' AND t.kind = 'deadline'");
  if (view === "done") where.push("t.status = 'done'");
  if (opts.matterId) { params.push(opts.matterId); where.push(`t.matter_id = $${params.length}`); }
  return q<TaskRow>(
    `SELECT t.*, m.number AS matter_number, a.full_name AS assignee_name
     FROM tasks t LEFT JOIN matters m ON m.id = t.matter_id LEFT JOIN users a ON a.id = t.assigned_to
     WHERE ${where.join(" AND ")}
     ORDER BY ${view === "done" ? "t.completed_at DESC" : "t.due_on NULLS LAST, CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END"} LIMIT 300`,
    params,
  );
}

// ── Documents ───────────────────────────────────────────────────
export interface DocRow {
  id: string; series_id: string; version: number; title: string; category: string | null; file_name: string; mime_type: string | null;
  size_bytes: number; sha256: string; privileged: boolean; uploaded_at: string; uploader_name: string | null; versions: number;
}

export async function listDocuments(ownerType: string, ownerId: string) {
  // Latest version of each series, with the count of versions
  return q<DocRow>(
    `SELECT d.*, u.full_name AS uploader_name, (SELECT COUNT(*) FROM documents x WHERE x.series_id = d.series_id AND x.deleted_at IS NULL) AS versions
     FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.owner_type = $1 AND d.owner_id = $2 AND d.deleted_at IS NULL
       AND d.version = (SELECT MAX(x.version) FROM documents x WHERE x.series_id = d.series_id AND x.deleted_at IS NULL)
     ORDER BY d.uploaded_at DESC`,
    [ownerType, ownerId],
  );
}

// ── Meetings ────────────────────────────────────────────────────
export interface MeetingRow {
  id: string; matter_id: string | null; matter_number: string | null; matter_title: string | null; title: string; held_on: string; kind: string;
  participants: string | null; consent_confirmed: boolean; status: string; audio_document_id: string | null; transcript: string | null;
  transcript_source: string | null; minutes: string | null; minutes_model: string | null; error: string | null; created_by: string | null;
  creator_name: string | null; created_at: string; updated_at: string;
}

function meetingAccess(u: Actor) {
  return `((mt.matter_id IS NULL AND (mt.created_by = $1 OR $1::uuid IN (SELECT id FROM users WHERE role = 'admin'))) OR (mt.matter_id IS NOT NULL AND ${matterAccessSql(u)}))`;
}

export async function listMeetings(u: Actor, matterId?: string) {
  const params: unknown[] = [u.id];
  const where = [meetingAccess(u)];
  if (matterId) { params.push(matterId); where.push(`mt.matter_id = $${params.length}`); }
  return q<MeetingRow>(
    `SELECT mt.id, mt.matter_id, mt.title, mt.held_on, mt.kind, mt.status, mt.participants, mt.created_at, mt.updated_at, mt.created_by,
            m.number AS matter_number, m.title AS matter_title, cu.full_name AS creator_name
     FROM meetings mt LEFT JOIN matters m ON m.id = mt.matter_id LEFT JOIN users cu ON cu.id = mt.created_by
     WHERE ${where.join(" AND ")} ORDER BY mt.held_on DESC, mt.created_at DESC LIMIT 200`,
    params,
  );
}

export async function loadMeeting(u: Actor, id: string) {
  const rows = await q<MeetingRow>(
    `SELECT mt.*, m.number AS matter_number, m.title AS matter_title, cu.full_name AS creator_name
     FROM meetings mt LEFT JOIN matters m ON m.id = mt.matter_id LEFT JOIN users cu ON cu.id = mt.created_by
     WHERE mt.id = $2 AND ${meetingAccess(u)}`,
    [u.id, id],
  );
  return rows[0] ?? null;
}

// ── Conflict check ──────────────────────────────────────────────
export interface ConflictHit {
  source: "client" | "party"; name: string; role: string; matter_id: string | null; matter_number: string | null; matter_title: string | null;
  matter_status: string | null; client_id: string | null; overlap: number; restricted: boolean;
}

/**
 * Search every client and every party on every matter, including walled-off
 * matters (a conflict must never be hidden), but only reveal the details of
 * matters the searcher may open.
 */
export async function conflictSearch(u: Actor, name: string): Promise<ConflictHit[]> {
  const words = nameWords(name);
  if (!words.length) return [];
  const conds = words.map((_, i) => `(' ' || name_key || ' ') LIKE $${i + 1}`).join(" OR ");
  const params = words.map((w) => `% ${w} %`);
  const clients = await q<{ id: string; name: string; name_key: string }>(`SELECT id, name, name_key FROM clients WHERE ${conds} LIMIT 100`, params);
  const parties = await q<{ name: string; name_key: string; role: string; matter_id: string }>(`SELECT name, name_key, role, matter_id FROM parties WHERE ${conds} LIMIT 200`, params);
  const clientMatters = clients.length
    ? await q<{ id: string; client_id: string; number: string; title: string; status: string; confidential: boolean }>(
        `SELECT id, client_id, number, title, status, confidential FROM matters WHERE client_id = ANY($1::uuid[])`, [clients.map((c) => c.id)])
    : [];
  const matterIds = [...new Set([...parties.map((p) => p.matter_id), ...clientMatters.map((m) => m.id)])];
  const access = matterIds.length
    ? await q<{ id: string; number: string; title: string; status: string; confidential: boolean; is_member: boolean }>(
        `SELECT m.id, m.number, m.title, m.status, m.confidential, EXISTS (SELECT 1 FROM matter_members mm WHERE mm.matter_id = m.id AND mm.user_id = $1) AS is_member
         FROM matters m WHERE m.id = ANY($2::uuid[])`, [u.id, matterIds])
    : [];
  const byId = new Map(access.map((m) => [m.id, m]));
  const score = (key: string) => {
    const k = new Set(key.split(" "));
    return words.filter((w) => k.has(w)).length / Math.max(words.length, k.size);
  };
  const hits: ConflictHit[] = [];
  const reveal = (id: string) => {
    const m = byId.get(id)!;
    const open = canSeeMatter(u, { confidential: m.confidential, isMember: m.is_member });
    return { m, open };
  };
  for (const c of clients) {
    const ms = clientMatters.filter((m) => m.client_id === c.id);
    if (!ms.length) hits.push({ source: "client", name: c.name, role: "Client (no matters yet)", matter_id: null, matter_number: null, matter_title: null, matter_status: null, client_id: c.id, overlap: score(c.name_key), restricted: false });
    for (const cm of ms) {
      const { m, open } = reveal(cm.id);
      hits.push({ source: "client", name: c.name, role: "Our client", matter_id: open ? m.id : null, matter_number: m.number, matter_title: open ? m.title : null, matter_status: m.status, client_id: c.id, overlap: score(c.name_key), restricted: !open });
    }
  }
  for (const p of parties) {
    const { m, open } = reveal(p.matter_id);
    hits.push({ source: "party", name: p.name, role: p.role, matter_id: open ? m.id : null, matter_number: m.number, matter_title: open ? m.title : null, matter_status: m.status, client_id: null, overlap: score(p.name_key), restricted: !open });
  }
  return hits.sort((a, b) => b.overlap - a.overlap);
}

// ── Dashboard ───────────────────────────────────────────────────
export async function dashboard(u: Actor) {
  const t = today();
  const [sittings, myTasks, serviceDue, recent, meetings, counts] = await Promise.all([
    diary(u, t, addDays(t, 7), { mine: !can(u, "diary.view_all") }),
    listTasks(u, { view: "mine" }),
    listService(u, { status: "due" }),
    can(u, "clients.view") && u.role !== "front_desk" ? listMatters(u, { mine: true, status: "open" }) : Promise.resolve([] as MatterRow[]),
    can(u, "meetings.use") ? listMeetings(u) : Promise.resolve([] as MeetingRow[]),
    one<{ open_matters: number; my_matters: number }>(
      `SELECT (SELECT COUNT(*) FROM matters m WHERE m.status != 'closed' AND ${matterAccessSql(u)}) AS open_matters,
              (SELECT COUNT(*) FROM matter_members mm JOIN matters m ON m.id = mm.matter_id WHERE mm.user_id = $1 AND m.status != 'closed') AS my_matters`,
      [u.id],
    ),
  ]);
  return { sittings, myTasks, serviceDue, recent: recent.slice(0, 6), meetings: meetings.filter((m) => m.status !== "ready").slice(0, 5), counts };
}
