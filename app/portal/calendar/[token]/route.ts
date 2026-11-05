import { NextResponse, type NextRequest } from "next/server";
import { one, q } from "@/lib/portal/db";
import { sha256 } from "@/lib/portal/crypto";
import { buildCalendar } from "@/lib/portal/ical";
import type { Actor } from "@/lib/portal/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Private calendar feed: /portal/calendar/<secret>.ics. Calendar apps cannot
 * sign in, so the long secret in the address is the key; only its hash is
 * stored, it can be reset at any time, and it stops working when the person
 * is deactivated.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{30,}$/.test(raw)) return new NextResponse("Not found", { status: 404 });
  const hash = sha256(raw);
  const u = await one<Actor & { detail: "minimal" | "full" }>(
    "SELECT u.id, u.email, u.full_name, u.role, f.detail FROM calendar_feeds f JOIN users u ON u.id = f.user_id WHERE f.token_hash = $1 AND u.active", [hash]);
  if (!u) return new NextResponse("Not found", { status: 404 });
  await q("UPDATE calendar_feeds SET last_used_at = now() WHERE token_hash = $1", [hash]);
  return new NextResponse(await buildCalendar(u, u.detail), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Content-Disposition": 'inline; filename="sosa-portal.ics"' },
  });
}
