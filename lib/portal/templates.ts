import "server-only";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { one, q } from "./db";
import { FIRM } from "./vocab";
import { firm } from "@/lib/site-data";
import { fmtDay, today } from "./format";
import { HEARING_STATUS, PARTY_ROLES, SERVICE_METHODS } from "./vocab";

/**
 * Word templates with {{fields}}. Fields are filled from the matter, the
 * client, the firm, the person generating the document and (for affidavits
 * of service) a service register entry. Any other {{field}} becomes a box to
 * fill in when generating.
 *
 * Word often splits typed text across several "runs" (spell-check, edits,
 * formatting), so a field can arrive as "{{cli" + "ent.name}}". Filling
 * works paragraph by paragraph on the joined text, then writes the result
 * back into the paragraph's first run, so fields are always found. A field
 * should therefore sit within one formatting style.
 */

const FIELD_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;
const PARTS = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

const unescapeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Fields every template can use, with what they are filled with. */
export const KNOWN_FIELDS: Record<string, string> = {
  "today": "Today's date, e.g. 5 November 2026",
  "firm.name": "Segun Sipeolu & Associates", "firm.address": "Office address", "firm.phone": "Office phone", "firm.email": "Office email",
  "user.name": "Your name", "user.title": "Your job title",
  "client.name": "Client name", "client.address": "Client address", "client.email": "Client email", "client.phone": "Client phone", "client.rc_number": "Client RC number",
  "matter.number": "Matter number", "matter.title": "Matter title", "matter.court": "Court", "matter.suit_number": "Suit number", "matter.judge": "Judge",
  "matter.practice_area": "Practice area", "matter.description": "Instructions and background", "matter.opened": "Date opened",
  "partner.name": "Responsible partner",
  "opponent.name": "First party on the other side", "opponent.counsel": "Opposing counsel", "parties": "All parties, one per line",
  "next_hearing.date": "Next court date", "next_hearing.business": "Next court business",
  "service.title": "Document served", "service.party": "Served on / by", "service.method": "How it was served", "service.date": "Date of service",
  "service.time": "Time of service", "service.served_by": "Person who served it", "service.received_by": "Person who received it", "service.proof": "Proof of service",
};

function partsOf(zip: Record<string, Uint8Array>) {
  return Object.keys(zip).filter((k) => PARTS.test(k));
}

export function extractFields(docx: Uint8Array): string[] {
  const zip = unzipSync(docx);
  if (!zip["word/document.xml"]) throw new Error("This is not a Word (.docx) document.");
  const found = new Set<string>();
  for (const name of partsOf(zip)) {
    const xml = strFromU8(zip[name]);
    for (const para of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
      const text = unescapeXml((para.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));
      for (const m of text.matchAll(FIELD_RE)) found.add(m[1]);
    }
  }
  return [...found];
}

export function fillDocx(docx: Uint8Array, values: Record<string, string>): Uint8Array {
  const zip = unzipSync(docx);
  for (const name of partsOf(zip)) {
    const xml = strFromU8(zip[name]);
    const out = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
      const runs = para.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g);
      if (!runs) return para;
      const text = unescapeXml(runs.map((t) => t.replace(/<[^>]+>/g, "")).join(""));
      if (!FIELD_RE.test(text)) return para;
      FIELD_RE.lastIndex = 0;
      const filled = text.replace(FIELD_RE, (_, k: string) => values[k] ?? `[${k}]`);
      // Line breaks in a value become line breaks in Word
      const xmlText = filled.split("\n").map(escapeXml).join('</w:t><w:br/><w:t xml:space="preserve">');
      let first = true;
      return para.replace(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g, () => {
        if (first) { first = false; return `<w:t xml:space="preserve">${xmlText}</w:t>`; }
        return "<w:t></w:t>";
      });
    });
    zip[name] = strToU8(out);
  }
  return zipSync(zip, { level: 6 });
}

/** Values for a matter (and optionally a service register entry), for the person generating. */
export async function contextValues(opts: { matterId: string; serviceId?: string | null; user: { full_name: string; title: string | null } }) {
  const m = await one<{ number: string; title: string; court: string | null; suit_number: string | null; judge: string | null; practice_area: string; description: string | null; opened_on: string;
    client_name: string; client_address: string | null; client_email: string | null; client_phone: string | null; client_rc: string | null; partner: string | null }>(
    `SELECT m.number, m.title, m.court, m.suit_number, m.judge, m.practice_area, m.description, m.opened_on,
            c.name AS client_name, c.address AS client_address, c.email AS client_email, c.phone AS client_phone, c.rc_number AS client_rc, p.full_name AS partner
     FROM matters m JOIN clients c ON c.id = m.client_id LEFT JOIN users p ON p.id = m.responsible_partner WHERE m.id = $1`, [opts.matterId]);
  if (!m) throw new Error("Matter not found");
  const parties = await q<{ name: string; role: keyof typeof PARTY_ROLES; contact: string | null }>("SELECT name, role, contact FROM parties WHERE matter_id = $1 ORDER BY created_at", [opts.matterId]);
  const next = await one<{ sitting_on: string; business: string; status: string }>(
    "SELECT sitting_on, business, status FROM hearings WHERE matter_id = $1 AND status = 'scheduled' AND sitting_on >= CURRENT_DATE ORDER BY sitting_on LIMIT 1", [opts.matterId]);
  const opponent = parties.find((p) => p.role === "defendant" || p.role === "counterparty" || p.role === "claimant");
  const v: Record<string, string> = {
    "today": fmtDay(today(), { day: "numeric", month: "long", year: "numeric" }),
    "firm.name": FIRM.name, "firm.address": firm.address, "firm.phone": firm.phone, "firm.email": firm.email,
    "user.name": opts.user.full_name, "user.title": opts.user.title || "",
    "client.name": m.client_name, "client.address": m.client_address || "", "client.email": m.client_email || "", "client.phone": m.client_phone || "", "client.rc_number": m.client_rc || "",
    "matter.number": m.number, "matter.title": m.title, "matter.court": m.court || "", "matter.suit_number": m.suit_number || "", "matter.judge": m.judge || "",
    "matter.practice_area": m.practice_area, "matter.description": m.description || "", "matter.opened": fmtDay(m.opened_on, { day: "numeric", month: "long", year: "numeric" }),
    "partner.name": m.partner || "",
    "opponent.name": opponent?.name || "", "opponent.counsel": parties.find((p) => p.role === "opposing_counsel")?.name || "",
    "parties": [m.client_name, ...parties.map((p) => `${p.name} (${PARTY_ROLES[p.role] || p.role})`)].join("\n"),
    "next_hearing.date": next ? fmtDay(next.sitting_on, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "",
    "next_hearing.business": next ? `${next.business} (${HEARING_STATUS[next.status as keyof typeof HEARING_STATUS]})` : "",
  };
  if (opts.serviceId) {
    const s = await one<{ title: string; party: string; method: keyof typeof SERVICE_METHODS; served_on: string; served_at: string | null; served_by: string | null; received_by: string | null; proof: string | null }>(
      "SELECT title, party, method, served_on, served_at, served_by, received_by, proof FROM service_register WHERE id = $1 AND matter_id = $2", [opts.serviceId, opts.matterId]);
    if (s) Object.assign(v, {
      "service.title": s.title, "service.party": s.party, "service.method": SERVICE_METHODS[s.method] || s.method,
      "service.date": fmtDay(s.served_on, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), "service.time": s.served_at || "",
      "service.served_by": s.served_by || "", "service.received_by": s.received_by || "", "service.proof": s.proof || "",
    });
  }
  return v;
}
