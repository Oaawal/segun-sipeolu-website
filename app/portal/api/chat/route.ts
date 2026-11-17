import { NextResponse, type NextRequest } from "next/server";
import { currentUser, peekUser } from "@/lib/portal/auth";
import { markRead, messages, openChannel, post } from "@/lib/portal/chat";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

/** New messages in a conversation (checked every few seconds by the open chat page). */
export async function GET(req: NextRequest) {
  // Looking for new messages is not activity: an open chat must not keep an idle session alive
  const u = await peekUser();
  if (!u || !u.mfa_passed) return NextResponse.json({ error: "Sign in again." }, { status: 401, headers: noStore });
  const channel = await openChannel(u.id, req.nextUrl.searchParams.get("channel"));
  if (!channel) return NextResponse.json({ error: "Not available." }, { status: 404, headers: noStore });
  const after = Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0);
  const list = await messages(channel, after);
  if (list.length && req.nextUrl.searchParams.get("seen") === "1") await markRead(u.id, channel, list[list.length - 1].id);
  return NextResponse.json({ messages: list }, { headers: noStore });
}

/** Send a message. */
export async function POST(req: NextRequest) {
  // Same site only (the session cookie is SameSite=Lax as well)
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!(req.headers.get("content-type") || "").includes("application/json")) return NextResponse.json({ error: "Not allowed." }, { status: 415 });
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { channel?: string; text?: string } | null;
  const channel = await openChannel(u.id, body?.channel);
  if (!channel) return NextResponse.json({ error: "Not available." }, { status: 404 });
  const id = await post(u.id, channel, String(body?.text || ""));
  if (!id) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  return NextResponse.json({ id }, { headers: noStore });
}
