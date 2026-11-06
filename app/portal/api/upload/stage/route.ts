import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { ext, MAX_FILE_BYTES, s3Enabled, stagedUploadUrl, uploadProblem } from "@/lib/portal/storage";

export const runtime = "nodejs";

/**
 * A short-lived link to send one file straight to storage (used on Vercel,
 * which refuses large request bodies). The file only becomes part of the
 * portal when a form or upload route accepts it, checked and encrypted.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  if (!s3Enabled()) return NextResponse.json({ error: "Direct upload is not set up." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { name?: string; size?: number };
  const name = String(body.name || "file").slice(0, 200);
  const size = Number(body.size);
  if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_BYTES) return NextResponse.json({ error: `Files can be up to ${MAX_FILE_BYTES / 1048576} MB.` }, { status: 400 });
  // Same type rules as every other upload, checked on the name before any bytes move
  const problem = uploadProblem({ name, size, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File);
  if (problem) return NextResponse.json({ error: problem, ext: ext(name) }, { status: 400 });
  return NextResponse.json(await stagedUploadUrl(u.id, size));
}
