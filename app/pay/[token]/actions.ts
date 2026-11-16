"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { one } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { newReference, paystackEnabled, startPayment } from "@/lib/portal/paystack";
import { siteUrl } from "@/lib/portal/client-mail";

export async function payInvoice(fd: FormData) {
  const token = String(fd.get("token") || "");
  const email = String(fd.get("email") || "").trim().toLowerCase().slice(0, 254);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token) || !paystackEnabled()) redirect("/");
  const inv = await one<{ id: string; number: string; total_kobo: number; paid_kobo: number; status: string; matter_id: string }>(
    "SELECT id, number, total_kobo, paid_kobo, status, matter_id FROM invoices WHERE pay_token = $1", [token]);
  if (!inv) redirect("/");
  const due = Number(inv.total_kobo) - Number(inv.paid_kobo);
  if (!["issued", "part_paid"].includes(inv.status) || due <= 0) redirect(`/pay/${token}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`/pay/${token}?e=1`);
  // A little throttling: at most 10 payment starts per invoice per hour
  const recent = await one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'invoice.payment_started' AND entity_id = $1 AND at > now() - interval '1 hour'", [inv.id]);
  if (Number(recent?.n) >= 10) redirect(`/pay/${token}?e=1`);
  const reference = newReference(inv.id);
  let url: string;
  try {
    const r = await startPayment({ email, amountKobo: due, reference, callbackUrl: `${siteUrl()}/pay/${token}/done`, invoiceNumber: inv.number });
    url = r.authorization_url;
  } catch {
    redirect(`/pay/${token}?e=1`);
  }
  const h = await headers();
  await audit({ actor: `payer:${email}`, action: "invoice.payment_started", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id, detail: { reference }, ip: (h.get("x-forwarded-for") || "").split(",")[0].trim() || null });
  redirect(url);
}
