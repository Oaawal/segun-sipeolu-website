import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can, matterAccessSql } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";

export const runtime = "nodejs";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formulas, then quote
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Open matters as CSV, for the partners (opens in Excel). */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  if (!can(u, "reports.view")) return new NextResponse("Forbidden", { status: 403 });
  const rows = await q<Record<string, unknown>>(
    `SELECT m.number, m.title, c.name AS client, m.matter_type, m.practice_area, m.status, m.opened_on, p.full_name AS partner,
            (SELECT string_agg(us.full_name, '; ') FROM matter_members mm JOIN users us ON us.id = mm.user_id WHERE mm.matter_id = m.id AND mm.role = 'lead') AS lead,
            m.court, m.suit_number,
            (SELECT MIN(h.sitting_on) FROM hearings h WHERE h.matter_id = m.id AND h.status = 'scheduled' AND h.sitting_on >= CURRENT_DATE) AS next_court,
            (SELECT COUNT(*) FROM tasks t WHERE t.matter_id = m.id AND t.status = 'open' AND t.due_on < CURRENT_DATE) AS overdue_tasks
     FROM matters m JOIN clients c ON c.id = m.client_id LEFT JOIN users p ON p.id = m.responsible_partner
     WHERE m.status != 'closed' AND ${matterAccessSql(u)} ORDER BY m.number`, [u.id]);
  const head = ["Number", "Title", "Client", "Type", "Practice area", "Status", "Opened", "Partner", "Lead", "Court", "Suit number", "Next court date", "Overdue tasks"];
  const keys = ["number", "title", "client", "matter_type", "practice_area", "status", "opened_on", "partner", "lead", "court", "suit_number", "next_court", "overdue_tasks"];
  const csv = "﻿" + [head.map(cell).join(","), ...rows.map((r) => keys.map((k) => cell(r[k])).join(","))].join("\r\n");
  await audit({ userId: u.id, actor: u.email, action: "reports.exported", detail: { rows: rows.length } });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="open-matters-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
