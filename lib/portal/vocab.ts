import { services } from "@/lib/site-data";

/** Firm details used across the portal. */
export const FIRM = {
  name: "Segun Sipeolu & Associates",
  short: "SOS&A",
  prefix: "SSA",
};

export const PRACTICE_AREAS = services.map((s) => s.title);

export const MATTER_TYPES = {
  litigation: "Litigation",
  arbitration: "Arbitration / ADR",
  debt_recovery: "Debt recovery",
  advisory: "Advisory / opinion",
  transaction: "Transaction / solicitors' work",
  regulatory: "Licences, approvals & regulatory",
  other: "Other",
} as const;
export type MatterType = keyof typeof MATTER_TYPES;

/** Short code used in matter numbers: SSA/LIT/2026/0001 */
export const MATTER_CODE: Record<MatterType, string> = {
  litigation: "LIT", arbitration: "ARB", debt_recovery: "DRC", advisory: "ADV", transaction: "TRN", regulatory: "REG", other: "GEN",
};

export const MATTER_STATUS = { intake: "Intake", open: "Open", on_hold: "On hold", closed: "Closed" } as const;

export const CLIENT_KINDS = { individual: "Individual", company: "Company", government: "Government / agency", ngo: "NGO / church / association", other: "Other" } as const;

export const PARTY_ROLES = {
  claimant: "Claimant / plaintiff / applicant",
  defendant: "Defendant / respondent",
  opposing_counsel: "Opposing counsel",
  counterparty: "Counterparty (transaction)",
  co_party: "Co-claimant / co-defendant",
  witness: "Witness",
  guarantor: "Guarantor / surety",
  related: "Related person or company",
} as const;

export const COURTS = [
  "Magistrate Court, Ikeja", "Magistrate Court, Lagos Island", "High Court of Lagos State, Ikeja", "High Court of Lagos State, Lagos Island",
  "Federal High Court, Ikoyi", "Federal High Court, Abuja", "National Industrial Court, Lagos", "Customary Court",
  "Court of Appeal, Lagos Division", "Court of Appeal, Abuja Division", "Supreme Court of Nigeria", "Investments and Securities Tribunal",
  "Arbitral Tribunal", "Lagos Multi-Door Courthouse",
];

export const HEARING_BUSINESS = [
  "Mention", "Hearing of motion", "Pre-trial conference", "Trial", "Continuation of trial", "Cross-examination", "Adoption of final written addresses",
  "Ruling", "Judgment", "Report of settlement", "Case management conference", "Arbitral hearing",
];

export const HEARING_STATUS = { scheduled: "Scheduled", held: "Held", adjourned: "Adjourned", vacated: "Did not sit", concluded: "Concluded" } as const;

export const SERVICE_KINDS = {
  writ: "Writ of summons", originating_summons: "Originating summons / petition", motion: "Motion / application", hearing_notice: "Hearing notice",
  pleading: "Pleading / statement of defence", written_address: "Written address", order: "Court order / judgment", subpoena: "Subpoena",
  letter: "Letter / correspondence", demand: "Letter of demand / pre-action notice", regulator: "Regulator or government letter", other: "Other",
} as const;

export const SERVICE_METHODS = {
  personal: "Personal service", bailiff: "Court bailiff", hand: "Hand delivery", courier: "Courier", post: "Registered post",
  email: "Email", substituted: "Substituted service (by court order)", whatsapp: "WhatsApp / electronic", portal: "Court e-filing portal",
} as const;

/** Common periods after service, offered as a starting point. Always confirm against the applicable rules. */
export const DEADLINE_PRESETS = [
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 21, label: "21 days" },
  { days: 30, label: "30 days" },
  { days: 42, label: "42 days" },
];

export const DOC_CATEGORIES = {
  pleading: "Pleading / process", court_order: "Court order / judgment", evidence: "Evidence / exhibit", correspondence: "Correspondence",
  contract: "Contract / agreement", opinion: "Legal opinion / memo", id: "Identity / KYC", title: "Title document", other: "Other",
} as const;

export const MEETING_KINDS = { client: "Client meeting", internal: "Internal / strategy", counterparty: "With the other side", court: "Court / tribunal", other: "Other" } as const;

// ── Names, for conflict checks ─────────────────────────────────
const NOISE = new Set(["ltd", "limited", "plc", "inc", "llc", "llp", "co", "company", "nig", "nigeria", "the", "and", "of", "mr", "mrs", "ms", "miss", "dr", "chief", "alhaji", "alhaja", "prof", "engr", "barr", "hon", "rev", "pastor", "sir", "lady", "otunba", "oba"]);

/** "Lagos Homes (Nig.) Ltd" → "homes lagos"; word order and titles do not matter. */
export function nameKey(name: string): string {
  const words = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !NOISE.has(w));
  return [...new Set(words)].sort().join(" ");
}

/** Words to search for, from a conflict-check query. */
export function nameWords(name: string): string[] {
  return nameKey(name).split(" ").filter((w) => w.length >= 2);
}

export const MEETING_STATUS: Record<string, [string, "grey" | "amber" | "blue" | "green" | "red"]> = {
  draft: ["Not recorded", "grey"], transcribing: ["Transcribing…", "amber"], transcribed: ["Transcript ready", "blue"],
  summarising: ["Writing minutes…", "amber"], ready: ["Minutes ready", "green"], failed: ["Needs attention", "red"],
};

export const CONTACT_KINDS = {
  court: "Court / registry", counsel: "Opposing or other counsel", bailiff: "Bailiff / process server", agency: "Government agency / regulator",
  expert: "Expert / valuer / surveyor", bank: "Bank", vendor: "Supplier / vendor", client_contact: "Client contact", other: "Other",
} as const;

export const ENTITY_TYPES = {
  private_ltd: "Private company (Ltd)", public_plc: "Public company (Plc)", ltd_gte: "Company limited by guarantee", business_name: "Business name",
  incorporated_trustees: "Incorporated trustees", llp: "Limited liability partnership", other: "Other",
} as const;

export const OFFICER_ROLES = { director: "Director", secretary: "Company secretary", trustee: "Trustee", chairman: "Chairman", proprietor: "Proprietor / partner", psc: "Person with significant control" } as const;

export const FILING_KINDS = {
  annual_return: "Annual return (CAC)", agm: "Annual general meeting", change_of_directors: "Change of directors / secretary", allotment: "Allotment of shares",
  address_change: "Change of registered address", psc: "PSC register update", tax_return: "Tax return / filing", licence: "Licence or permit renewal", other: "Other",
} as const;

export const ASSET_KINDS = {
  laptop: "Laptop", desktop: "Desktop computer", phone: "Phone", tablet: "Tablet", printer: "Printer / scanner", network: "Router / network",
  storage: "Storage / backup drive", software: "Software licence", subscription: "Subscription / service", domain: "Domain / website", furniture: "Furniture / equipment", other: "Other",
} as const;

export const TEMPLATE_CATEGORIES = { engagement: "Engagement and client care", letter: "Letters", court: "Court processes", corporate: "Corporate / secretarial", property: "Property", other: "Other" } as const;
