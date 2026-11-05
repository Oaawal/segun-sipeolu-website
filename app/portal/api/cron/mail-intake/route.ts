import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runMailIntake } from "@/lib/portal/mail-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Check the portal's intake mailbox. Call every 5-15 minutes with "Authorization: Bearer <CRON_SECRET>". */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(secret).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runMailIntake());
  } catch (err) {
    console.error("[portal] mail intake failed:", err);
    return NextResponse.json({ error: "Mail intake failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
