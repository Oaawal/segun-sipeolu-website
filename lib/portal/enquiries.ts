import "server-only";
import { q } from "./db";
import { notify, emailLayout } from "./notify";
import { portalUrl } from "./reminders";

export const ENQUIRY_STATUS: Record<string, [string, "grey" | "amber" | "blue" | "green" | "red" | "gold" | "maroon"]> = {
  new: ["New", "gold"], conflict_cleared: ["Conflict cleared", "blue"], conflict_found: ["Conflict found", "red"], quoted: ["Fee quoted", "amber"],
  engaged: ["Engaged", "green"], declined: ["Declined", "grey"], no_response: ["No response", "grey"],
};
export const ENQUIRY_SOURCES = { website: "Website", walk_in: "Walk-in", phone: "Phone call", email: "Email", referral: "Referral", whatsapp: "WhatsApp", other: "Other" } as const;

/** Tell partners and front desk (and whoever it is assigned to) that an enquiry came in. */
export async function announceEnquiry(e: { id: string; number: string; name: string; practice_area: string | null; source: string }, assignedTo?: string | null) {
  const people = await q<{ id: string; email: string; full_name: string; phone: string | null; notify_email: boolean }>(
    "SELECT id, email, full_name, phone, notify_email FROM users WHERE active AND (role IN ('admin','partner','front_desk') OR id = $1)", [assignedTo ?? null]);
  const href = `${portalUrl()}/enquiries/${e.id}`;
  for (const p of people) {
    await notify(p, {
      kind: "enquiry", key: `enquiry:${e.id}`, subject: `New enquiry ${e.number}: ${e.name}`,
      html: emailLayout("A new enquiry came in", [{ heading: "Enquiry", items: [{ title: `${e.number} · ${e.name}`, detail: `${e.practice_area || "Area not given"} · via ${e.source}`, href }] }], "Run a conflict check before discussing the matter in detail. Aim to reply within one business day.", href),
      text: `New enquiry ${e.number} from ${e.name}. ${href}`,
    });
  }
}
