import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/portal/auth";
import { billingSettings, invoiceLines, loadInvoice } from "@/lib/portal/billing";
import { audit } from "@/lib/portal/audit";
import { buildDocx, docxResponseHeaders } from "@/lib/portal/word-export";
import { fmtDay, isUuid } from "@/lib/portal/format";
import { naira } from "@/lib/portal/money";

export const runtime = "nodejs";

/** The invoice as an editable Word document (for letterhead printing). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u || !u.mfa_passed) return NextResponse.redirect(new URL("/portal/login", req.url));
  const { id } = await params;
  const inv = isUuid(id) ? await loadInvoice(u, id) : null;
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const [lines, s] = await Promise.all([invoiceLines(inv.id), billingSettings()]);
  const buf = await buildDocx({
    title: inv.status === "draft" ? "Draft invoice" : `Invoice ${inv.number}`,
    subtitle: `${inv.client_name} · ${inv.matter_title} (${inv.matter_number})`,
    confidential: false,
    blocks: [
      { type: "kv", rows: [["Invoice", inv.number || "Draft"], ["Date", inv.issued_on ? fmtDay(inv.issued_on) : "—"], ["Due", inv.due_on ? fmtDay(inv.due_on) : "—"], ["Bill to", inv.client_name], ["Matter", `${inv.matter_title} (${inv.matter_number})`], ...(s["billing.tin"] ? [["Our TIN", s["billing.tin"]] as [string, string]] : [])] },
      { type: "table", head: ["Description", "Qty / hrs", "Rate (₦)", "Amount (₦)"], rows: lines.map((l) => [l.description, l.kind === "expense" ? "" : String(Number(l.quantity)), l.kind === "expense" ? "" : naira(l.unit_kobo, { symbol: false }), naira(l.amount_kobo, { symbol: false })]) },
      { type: "kv", rows: [["Subtotal", naira(inv.subtotal_kobo)], ...(inv.vat_rate_bp ? [[`VAT at ${inv.vat_rate_bp / 100}% on fees`, naira(inv.vat_kobo)] as [string, string]] : []), ["Total", naira(inv.total_kobo)], ...(Number(inv.paid_kobo) ? [["Paid", naira(inv.paid_kobo)] as [string, string], ["Balance due", naira(Number(inv.total_kobo) - Number(inv.paid_kobo))] as [string, string]] : [])] },
      ...(inv.notes ? [{ type: "para" as const, text: inv.notes }] : []),
      ...(s["billing.bank"] ? [{ type: "heading" as const, text: "Payment" }, { type: "para" as const, text: `${s["billing.bank"]}${inv.number ? `. Quote ${inv.number} as the reference.` : ""}` }] : []),
      ...(s["billing.footer"] ? [{ type: "para" as const, text: s["billing.footer"], muted: true }] : []),
    ],
  });
  await audit({ userId: u.id, actor: u.email, action: "invoice.exported", entityType: "invoice", entityId: inv.id, matterId: inv.matter_id });
  return new NextResponse(new Uint8Array(buf), { headers: docxResponseHeaders(`${(inv.number || "draft-invoice").replace(/\//g, "-")}.docx`) });
}
