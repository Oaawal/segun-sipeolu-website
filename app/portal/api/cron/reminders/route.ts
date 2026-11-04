import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runReminders } from "@/lib/portal/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Morning reminders. Call once a day (7am Lagos = 06:00 UTC) with
 *   Authorization: Bearer <CRON_SECRET>
 * from any scheduler: Vercel Cron, a server's crontab, cron-job.org, or a
 * GitHub Action. Re-running the same day sends nothing twice.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runReminders());
}

export const GET = handle;
export const POST = handle;
