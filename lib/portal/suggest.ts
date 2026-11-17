import "server-only";
import { q } from "./db";
import { can, matterAccessSql, type Actor } from "./permissions";
import { searchDocuments } from "./data";

/**
 * Results while typing in the search box: documents (by name, folder or the
 * words inside), matters and people (clients, contacts, parties and staff).
 * Same access rules as everywhere else. Short and fast: a few of each.
 */
export interface Suggestion { kind: "document" | "matter" | "client" | "contact" | "party" | "staff"; id: string; title: string; detail: string; href: string; snippet?: string | null; ext?: string }

export async function suggest(u: Actor, term: string): Promise<Suggestion[]> {
  const t = term.trim().slice(0, 100);
  if (t.length < 2) return [];
  const like = `%${t.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const starts = `${t.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const wordStart = `% ${t.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
  const [docs, matters, clients, contacts, parties, staff] = await Promise.all([
    searchDocuments(u, { term: t, limit: 7 }),
    u.role === "front_desk" ? Promise.resolve([]) : q<{ id: string; number: string; title: string; client: string }>(
      `SELECT m.id, m.number, m.title, c.name AS client FROM matters m JOIN clients c ON c.id = m.client_id
       WHERE ${matterAccessSql(u)} AND (m.title ILIKE $2 OR m.number ILIKE $2 OR m.suit_number ILIKE $2 OR c.name ILIKE $2)
       ORDER BY (m.title ILIKE $3 OR m.number ILIKE $3) DESC, m.updated_at DESC LIMIT 4`, [u.id, like, starts]),
    can(u, "clients.view") ? q<{ id: string; name: string; email: string | null; phone: string | null }>(
      `SELECT id, name, email, phone FROM clients WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR rc_number ILIKE $1
       ORDER BY (name ILIKE $2 OR name ILIKE $3) DESC, name LIMIT 4`, [like, starts, wordStart]) : Promise.resolve([]),
    can(u, "contacts.view") ? q<{ id: string; name: string; organisation: string | null; role: string | null }>(
      `SELECT id, name, organisation, role FROM contacts WHERE archived_at IS NULL AND (name ILIKE $1 OR organisation ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)
       ORDER BY (name ILIKE $2 OR name ILIKE $3) DESC, name LIMIT 3`, [like, starts, wordStart]) : Promise.resolve([]),
    u.role === "front_desk" ? Promise.resolve([]) : q<{ id: string; name: string; role: string; matter_id: string; number: string }>(
      `SELECT p.id, p.name, p.role, m.id AS matter_id, m.number FROM parties p JOIN matters m ON m.id = p.matter_id
       WHERE ${matterAccessSql(u)} AND p.name ILIKE $2 ORDER BY p.name LIMIT 3`, [u.id, like]),
    q<{ id: string; full_name: string; title: string | null; email: string }>(
      "SELECT id, full_name, title, email FROM users WHERE active AND (full_name ILIKE $1 OR email ILIKE $1) ORDER BY full_name LIMIT 3", [like]),
  ]);
  const ext = (n: string) => (n.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  return [
    ...docs.map((d): Suggestion => ({
      kind: "document", id: d.id, title: d.title, ext: ext(d.file_name), snippet: d.in_name ? null : d.snippet,
      detail: [d.folder, d.matter_number || (d.owner_type === "inbox" ? "Your inbox" : d.owner_type === "service" ? "Service register" : d.owner_type === "meeting" ? "Meeting" : null), d.file_name].filter(Boolean).join(" · "),
      href: `/portal/api/files/${d.id}`,
    })),
    ...matters.map((m): Suggestion => ({ kind: "matter", id: m.id, title: m.title, detail: `${m.number} · ${m.client}`, href: `/portal/matters/${m.id}` })),
    ...clients.map((c): Suggestion => ({ kind: "client", id: c.id, title: c.name, detail: ["Client", c.email || c.phone].filter(Boolean).join(" · "), href: `/portal/clients/${c.id}` })),
    ...contacts.map((c): Suggestion => ({ kind: "contact", id: c.id, title: c.name, detail: ["Contact", c.organisation || c.role].filter(Boolean).join(" · "), href: `/portal/contacts/${c.id}` })),
    ...parties.map((p): Suggestion => ({ kind: "party", id: p.id, title: p.name, detail: `${p.role.replace(/_/g, " ")} · ${p.number}`, href: `/portal/matters/${p.matter_id}?tab=parties` })),
    ...staff.map((s): Suggestion => ({ kind: "staff", id: s.id, title: s.full_name, detail: s.title || s.email, href: `/portal/search?q=${encodeURIComponent(s.full_name)}` })),
  ];
}
