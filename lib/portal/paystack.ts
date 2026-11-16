import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack (card, bank transfer and USSD payments in naira).
 * Needs PAYSTACK_SECRET_KEY. Amounts are in kobo, like the rest of the portal.
 * A payment is only recorded after the portal itself asks Paystack to verify
 * the reference (or receives a webhook signed with the secret key), never on
 * the word of the browser.
 */

const BASE = () => process.env.PAYSTACK_API_BASE || "https://api.paystack.co";

export function paystackEnabled() {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || !body.status || !body.data) throw new Error(`Paystack: ${body.message || res.status}`);
  return body.data;
}

export async function startPayment(p: { email: string; amountKobo: number; reference: string; callbackUrl: string; invoiceNumber: string }) {
  return call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: p.email, amount: p.amountKobo, currency: "NGN", reference: p.reference, callback_url: p.callbackUrl,
      metadata: { invoice: p.invoiceNumber, custom_fields: [{ display_name: "Invoice", variable_name: "invoice", value: p.invoiceNumber }] },
    }),
  });
}

export interface VerifiedPayment { status: string; reference: string; amount: number; currency: string; paid_at: string | null; channel: string | null }

export async function verifyPayment(reference: string) {
  return call<VerifiedPayment>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function validWebhook(raw: string, signature: string | null): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Our reference carries the invoice id, so a verified reference maps back to its invoice. */
export function newReference(invoiceId: string) {
  return `ssa.${invoiceId}.${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

export function invoiceIdFromReference(reference: string): string | null {
  const m = /^ssa\.([0-9a-f-]{36})\.[0-9a-f]{10}$/i.exec(reference);
  return m ? m[1].toLowerCase() : null;
}
