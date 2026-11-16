import "server-only";
import { q, type Queryable } from "./db";
import { addDays, today } from "./format";

/**
 * Matter checklists: the standard steps for a kind of work. Applying one to
 * a matter creates its tasks, with due dates counted from the day it is
 * applied, assigned to the matter lead (or the responsible partner).
 */

export interface Step { title: string; days: number | null; priority: "low" | "normal" | "high"; kind: "task" | "deadline"; who: "lead" | "partner" }

export function parseSteps(raw: string): Step[] {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.slice(0, 60).map((s): Step => ({
      title: String(s.title || "").slice(0, 250),
      days: Number.isInteger(s.days) && s.days >= 0 && s.days <= 3650 ? s.days : null,
      priority: ["low", "normal", "high"].includes(s.priority) ? s.priority : "normal",
      kind: s.kind === "deadline" ? "deadline" : "task",
      who: s.who === "partner" ? "partner" : "lead",
    })).filter((s) => s.title);
  } catch {
    return [];
  }
}

/** One step per line: "Title | days | high | deadline | partner" (everything after the title is optional). */
export function stepsFromText(text: string): Step[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 60).map((line) => {
    const [title, ...rest] = line.split("|").map((x) => x.trim());
    const days = rest.map((r) => r.match(/^(\d{1,4})\s*(d|days?)?$/i)).find(Boolean);
    const low = rest.map((r) => r.toLowerCase());
    return {
      title: title.slice(0, 250),
      days: days ? Number(days[1]) : null,
      priority: low.includes("high") ? "high" : low.includes("low") ? "low" : "normal",
      kind: low.includes("deadline") ? "deadline" : "task",
      who: low.includes("partner") ? "partner" : "lead",
    } as Step;
  }).filter((s) => s.title);
}

export function stepsToText(steps: Step[]) {
  return steps.map((s) => [s.title, s.days !== null ? `${s.days} days` : "", s.priority !== "normal" ? s.priority : "", s.kind === "deadline" ? "deadline" : "", s.who === "partner" ? "partner" : ""].filter(Boolean).join(" | ")).join("\n");
}

export async function applyWorkflow(t: Queryable, matterId: string, workflowId: string, byUserId: string): Promise<number> {
  const wf = (await t.query<{ name: string; steps: string }>("SELECT name, steps FROM workflows WHERE id = $1 AND active", [workflowId])).rows[0];
  if (!wf) return 0;
  const m = (await t.query<{ responsible_partner: string | null; lead: string | null }>(
    "SELECT m.responsible_partner, (SELECT mm.user_id FROM matter_members mm WHERE mm.matter_id = m.id AND mm.role = 'lead' ORDER BY mm.added_at LIMIT 1) AS lead FROM matters m WHERE m.id = $1", [matterId])).rows[0];
  const steps = parseSteps(wf.steps);
  const start = today();
  for (const s of steps) {
    const who = s.who === "partner" ? m?.responsible_partner || m?.lead : m?.lead || m?.responsible_partner;
    await t.query("INSERT INTO tasks (id, title, detail, matter_id, assigned_to, due_on, kind, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [crypto.randomUUID(), s.title, `From the "${wf.name}" checklist`, matterId, who || byUserId, s.days !== null ? addDays(start, s.days) : null, s.kind, s.priority, `workflow:${workflowId}`, byUserId]);
  }
  await t.query("INSERT INTO matter_notes (id, matter_id, kind, body, created_by) VALUES ($1,$2,'system',$3,$4)", [crypto.randomUUID(), matterId, `Checklist applied: ${wf.name} (${steps.length} tasks)`, byUserId]);
  return steps.length;
}

export async function activeWorkflows() {
  return q<{ id: string; name: string; matter_type: string | null; steps: string }>("SELECT id, name, matter_type, steps FROM workflows WHERE active ORDER BY name");
}

/** A starting set, to be reviewed and adapted by the partners. */
export const STARTER_WORKFLOWS: { name: string; matter_type: string; description: string; steps: string }[] = [
  {
    name: "Litigation: defending a claim", matter_type: "litigation", description: "From service of the originating process to the first hearing.",
    steps: `Record the originating process in the service register and confirm the date of service | 0 days | high | deadline
Obtain the client's full account and documents; take a written statement | 3 days | high
Enter appearance (memorandum of appearance) | 5 days | high | deadline
Conflict, limitation and jurisdiction review; note any preliminary objection | 7 days
Draft statement of defence, witness statements and list of documents | 21 days | high
Partner review of defence and counter-claim, if any | 30 days | high | partner
File and serve defence processes; confirm the date allowed by the applicable rules | 35 days | high | deadline
Prepare for case management / pre-trial conference | 45 days`,
  },
  {
    name: "Litigation: filing a claim", matter_type: "litigation", description: "Pre-action steps to service of the writ.",
    steps: `Issue letter of demand / pre-action notice where required | 2 days | high
Collect documents and witness details; check limitation period | 5 days | high | deadline
Pre-action protocol form and counsel's certificate (where the court requires them) | 10 days
Draft writ, statement of claim, witness statements and list of documents | 14 days | high
Partner review | 17 days | partner
File processes and pay filing fees; obtain suit number | 20 days | high
Arrange service through the bailiff; diarise the date of service | 25 days
Diarise the period for appearance and defence once served | 30 days | deadline`,
  },
  {
    name: "Property purchase", matter_type: "transaction", description: "Acting for a buyer of land in Lagos.",
    steps: `Obtain copies of title documents (C of O, deed, survey plan) | 2 days
Search at the Lands Registry and Surveyor-General; charting of the survey | 7 days | high
Physical inspection and enquiry about possession / adverse claims | 7 days
Review title search results; advise the client in writing | 14 days | high | partner
Negotiate and draft the contract of sale / deed of assignment | 21 days
Execution of the deed; collect purchase price into client account | 30 days | high
Apply for Governor's consent; pay consent fees and stamp duties | 45 days | high | deadline
Registration of the deed and delivery of original documents to the client | 120 days`,
  },
  {
    name: "Company incorporation (CAC)", matter_type: "transaction", description: "Registering a private company limited by shares.",
    steps: `Name availability search and reservation on the CAC portal | 1 days | high
Collect directors' and shareholders' details, IDs and PSC information | 3 days
Prepare memorandum and articles of association and statement of compliance | 5 days
File incorporation application and pay fees and stamp duty | 7 days | high
Obtain certificate of incorporation and certified true copies | 14 days
Register for tax (TIN) and advise on post-incorporation filings | 21 days
Open the company in the Company secretarial register and diarise the first annual return | 21 days | deadline`,
  },
  {
    name: "Debt recovery", matter_type: "debt_recovery", description: "From instructions to judgment or settlement.",
    steps: `Confirm the debt: invoices, contract, statement of account | 2 days | high
Letter of demand with a deadline to pay | 3 days | high
Diarise the end of the demand period | 10 days | deadline
Advise the client on the undefended list / summary judgment route | 14 days | partner
Prepare and file the claim if unpaid | 21 days
Explore settlement terms and payment plan | 30 days`,
  },
];
