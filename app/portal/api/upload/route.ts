import { NextResponse, type NextRequest } from "next/server";
import { currentUser, requestMeta } from "@/lib/portal/auth";
import { resolveDestination, saveIncoming, type Source } from "@/lib/portal/intake";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Browser uploads (drag and drop, folders, phone camera). One or more files; answers JSON. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  const fd = await req.formData();
  const dest = await resolveDestination(u, String(fd.get("destination") || "inbox"));
  if ("error" in dest) return NextResponse.json({ error: dest.error }, { status: 403 });
  const source: Source = fd.get("source") === "camera" ? "camera" : "browser";
  const { ip } = await requestMeta();
  const files = fd.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!files.length) return NextResponse.json({ error: "No file received." }, { status: 400 });
  const results = [];
  for (const f of files.slice(0, 50)) {
    results.push(await saveIncoming(u, f, { destination: dest, source, category: String(fd.get("category") || ""), title: files.length === 1 ? String(fd.get("title") || "") : null, ip }));
  }
  return NextResponse.json({ results });
}
