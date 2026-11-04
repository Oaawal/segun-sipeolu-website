import { NextResponse, type NextRequest } from "next/server";
import { tokenUser, unauthorized } from "@/lib/portal/api-auth";
import { listMatters } from "@/lib/portal/data";

export const runtime = "nodejs";

/** Matters the person may save into (open ones they can access). */
export async function GET(req: NextRequest) {
  const u = await tokenUser(req);
  if (!u) return unauthorized();
  const term = (req.nextUrl.searchParams.get("q") || "").slice(0, 100);
  const rows = await listMatters(u, { status: "open", q: term || undefined });
  return NextResponse.json(rows.slice(0, 50).map((m) => ({ id: m.id, number: m.number, title: m.title, client: m.client_name })));
}
