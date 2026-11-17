import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { can } from "@/lib/portal/permissions";
import { one } from "@/lib/portal/db";
import { billingSettings, loadInvoice } from "@/lib/portal/billing";
import { audit } from "@/lib/portal/audit";
import { buildDocx, docxResponseHeaders } from "@/lib/portal/word-export";
import { fmtDay, isUuid } from "@/lib/portal/format";
import { naira, PAYMENT_METHODS } from "@/lib/portal/money";

export const runtime = "nodejs";

/** A receipt for one payment, as a Word document for the partner to print or send. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  if (!can(u, "billing.manage")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  const p = isUuid(id) ? await one<{ id: string; invoice_id: string; received_on: string; amount_kobo: number; method: string; reference: string | null; receipt_number: string | null; reversed_at: string | null }>(
    "SELECT id, invoice_id, received_on, amount_kobo, method, reference, receipt_number, reversed_at FROM payments WHERE id = $1", [id]) : null;
  const inv = p ? await loadInvoice(u, p.invoice_id) : null;
  if (!p || !inv || p.reversed_at) return new NextResponse("Not found", { status: 404 });
  const s = await billingSettings();
  const balance = Number(inv.total_kobo) - Number(inv.paid_kobo);
  const buf = await buildDocx({
    title: `Receipt ${p.receipt_number || ""}`.trim(),
    subtitle: `Segun Sipeolu & Associates${s["billing.tin"] ? ` · TIN ${s["billing.tin"]}` : ""}`,
    confidential: false,
    blocks: [
      { type: "kv", rows: [
        ["Receipt number", p.receipt_number || "—"], ["Date received", fmtDay(p.received_on)], ["Received from", inv.client_name],
        ["Amount", naira(p.amount_kobo)], ["Paid by", PAYMENT_METHODS[p.method as keyof typeof PAYMENT_METHODS] || p.method], ["Reference", p.reference || "—"],
        ["For invoice", `${inv.number} (${inv.matter_title})`], ["Invoice total", naira(inv.total_kobo)], ["Balance after payments to date", naira(balance)],
      ] },
      { type: "para", text: "Received with thanks." },
      { type: "para", text: "Signed: ______________________________    For: Segun Sipeolu & Associates", muted: true },
    ],
  });
  await audit({ userId: u.id, actor: u.email, action: "receipt.exported", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id, detail: { payment: p.id, receipt: p.receipt_number } });
  return new NextResponse(new Uint8Array(buf), { headers: docxResponseHeaders(`Receipt ${(p.receipt_number || p.id.slice(0, 8)).replace(/\//g, "-")}.docx`) });
}
