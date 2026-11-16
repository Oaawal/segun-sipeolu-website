/**
 * Money helpers. Amounts are kept in kobo (whole numbers), so sums are exact:
 * ₦1,250.50 is 125050. VAT is 7.5% in Nigeria (Finance Act 2019), stored per
 * invoice in basis points so a future change never alters old invoices.
 */

export const VAT_BP = Number(process.env.PORTAL_VAT_BP || 750);

export function naira(kobo: number | string | null | undefined, { symbol = true } = {}): string {
  const k = Number(kobo || 0);
  const s = (Math.abs(k) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${k < 0 ? "-" : ""}${symbol ? "₦" : ""}${s}`;
}

/** "₦1,250.50", "1250.5", "1,250" → 125050. Null if not a valid amount. */
export function parseNaira(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[₦,\s]|NGN|N(?=\d)/gi, "").trim();
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function amountField(fd: FormData, name: string): number | null {
  return parseNaira(fd.get(name));
}

/** VAT on an amount in kobo, rounded to the nearest kobo. */
export function vatOn(kobo: number, bp = VAT_BP): number {
  return Math.round((kobo * bp) / 10000);
}

/** Fee for a number of minutes at an hourly rate, rounded to the kobo. */
export function feeFor(minutes: number, rateKobo: number): number {
  return Math.round((minutes * rateKobo) / 60);
}

export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

/** "1:30", "1.5", "90m", "1h 30m", "2h" → minutes. */
export function parseDuration(raw: unknown): number | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/))) return Math.round(Number(m[1]) * 60) + Number(m[2] || 0);
  if ((m = s.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/))) return Number(m[1]);
  if ((m = s.match(/^\d+(?:\.\d+)?$/))) return Math.round(Number(s) * 60);
  return null;
}

export const BILLING_TYPES = {
  hourly: "Hourly (time recorded)",
  fixed: "Fixed / agreed fee",
  retainer: "Retainer",
  contingent: "Contingent / success fee",
  pro_bono: "Pro bono (no fee)",
} as const;

export const EXPENSE_KINDS = {
  filing_fees: "Filing fees", search_fees: "Search / CAC fees", stamp_duty: "Stamp duty", service: "Service / bailiff",
  transport: "Transport", courier: "Courier", printing: "Printing / copies", registration: "Registration / perfection", other: "Other",
} as const;

export const PAYMENT_METHODS = { transfer: "Bank transfer", paystack: "Card / Paystack", cheque: "Cheque", cash: "Cash", pos: "POS", other: "Other" } as const;

export const INVOICE_STATUS: Record<string, [string, "grey" | "amber" | "blue" | "green" | "red"]> = {
  draft: ["Draft", "grey"], issued: ["Issued", "blue"], part_paid: ["Part paid", "amber"], paid: ["Paid", "green"], void: ["Void", "red"],
};
