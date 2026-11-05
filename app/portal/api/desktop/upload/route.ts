import { NextResponse, type NextRequest } from "next/server";
import { tokenUser, unauthorized } from "@/lib/portal/api-auth";
import { resolveDestination, saveIncoming } from "@/lib/portal/intake";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Uploads from Windows ("Send to → SOS&A Portal" and the Portal Inbox
 * folder), authenticated with a personal connection code.
 * Form fields: file (one or more); matter (matter or suit number; empty = my inbox); source.
 */
export async function POST(req: NextRequest) {
  const u = await tokenUser(req);
  if (!u) return unauthorized();
  const fd = await req.formData();
  const dest = await resolveDestination(u, String(fd.get("matter") || ""));
  if ("error" in dest) return NextResponse.json({ error: dest.error }, { status: 403 });
  const source = fd.get("source") === "folder" ? "folder" : "windows";
  const files = fd.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) return NextResponse.json({ error: "No file received." }, { status: 400 });
  const results = [];
  for (const f of files.slice(0, 50)) results.push(await saveIncoming(u, f, { destination: dest, source, ip: null }));
  return NextResponse.json({ results });
}
