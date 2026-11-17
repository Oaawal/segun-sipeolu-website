import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { suggest } from "@/lib/portal/suggest";

export const runtime = "nodejs";

/** Suggestions for the search box, as the person types. */
export async function GET(req: NextRequest) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const term = req.nextUrl.searchParams.get("q") || "";
  return NextResponse.json({ results: await suggest(u, term) }, { headers: { "Cache-Control": "no-store" } });
}
