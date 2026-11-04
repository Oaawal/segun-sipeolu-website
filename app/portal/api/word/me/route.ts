import { NextResponse, type NextRequest } from "next/server";
import { tokenUser, unauthorized } from "@/lib/portal/api-auth";
import { ROLES } from "@/lib/portal/permissions";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const u = await tokenUser(req);
  if (!u) return unauthorized();
  return NextResponse.json({ name: u.full_name, email: u.email, role: ROLES[u.role].label });
}
