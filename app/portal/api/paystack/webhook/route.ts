import { NextResponse, type NextRequest } from "next/server";
import { validWebhook } from "@/lib/portal/paystack";
import { settlePaystack } from "@/lib/portal/billing";

export const runtime = "nodejs";

/**
 * Paystack calls this when a payment succeeds, so it is recorded even if the
 * payer closes the page. The signature is checked, then the payment is
 * verified again with Paystack before anything is recorded.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validWebhook(raw, req.headers.get("x-paystack-signature"))) return new NextResponse("Invalid signature", { status: 401 });
  let event: { event?: string; data?: { reference?: string } };
  try { event = JSON.parse(raw); } catch { return new NextResponse("Bad request", { status: 400 }); }
  if (event.event === "charge.success" && event.data?.reference) {
    try { await settlePaystack(event.data.reference); } catch { return new NextResponse("Try again", { status: 500 }); }
  }
  return NextResponse.json({ ok: true });
}
