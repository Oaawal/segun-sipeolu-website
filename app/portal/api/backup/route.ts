import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";

export const runtime = "nodejs";

const TABLES = ["users", "clients", "matters", "matter_members", "parties", "matter_notes", "hearings", "service_register", "tasks", "documents", "meetings", "notifications", "audit_log", "counters", "settings", "schema_migrations"];
// Secrets never leave the server, even in a backup
const STRIP: Record<string, string[]> = { users: ["password_hash", "totp_secret"] };

/** Full export of the records (not the files), for the Managing Partner. */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  if (!can(u, "system.manage")) return new NextResponse("Forbidden", { status: 403 });
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = await q<Record<string, unknown>>(`SELECT * FROM ${t}`);
    out[t] = rows.map((r) => { for (const k of STRIP[t] || []) delete r[k]; return r; });
  }
  await audit({ userId: u.id, actor: u.email, action: "system.backup_downloaded", detail: { tables: TABLES.length } });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new NextResponse(JSON.stringify({ createdAt: new Date().toISOString(), by: u.email, tables: out }, null, 1), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="ssa-portal-backup-${stamp}.json"`, "Cache-Control": "no-store" },
  });
}
