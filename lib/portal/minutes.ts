import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { FIRM } from "./vocab";

/**
 * Turns a meeting transcript into structured minutes with Claude, using
 * structured outputs so the result always has the same shape: summary,
 * decisions, action items (owner, due date), deadlines, open questions,
 * risks and a draft follow-up email. Requires ANTHROPIC_API_KEY.
 */

export const MinutesSchema = z.object({
  summary: z.string().describe("Three to six sentences: what the meeting was about and where things stand."),
  attendees: z.array(z.string()).describe("People present, with their role if stated."),
  key_points: z.array(z.string()).describe("Facts, positions and information that came up, one per item."),
  decisions: z.array(z.string()).describe("What was agreed or decided. Empty if nothing was decided."),
  action_items: z.array(z.object({
    task: z.string().describe("A specific action, starting with a verb."),
    owner: z.string().nullable().describe("Who will do it, as named in the meeting, or null if unclear."),
    due_date: z.string().nullable().describe("YYYY-MM-DD if a date or period was stated (work it out from the meeting date), otherwise null."),
    priority: z.enum(["low", "normal", "high"]),
  })),
  deadlines: z.array(z.object({
    what: z.string(),
    date: z.string().nullable().describe("YYYY-MM-DD, or null if not stated."),
  })).describe("Court dates, filing deadlines, limitation periods, payment dates and other dates with consequences."),
  open_questions: z.array(z.string()).describe("Questions left unanswered, or information still needed from the client or others."),
  risks: z.array(z.string()).describe("Legal or practical risks raised or apparent from the discussion."),
  follow_up_email: z.string().describe("A short, professional email from the firm to the client confirming what was discussed and the next steps. Plain text, no subject line. Empty string for internal meetings."),
});
export type Minutes = z.infer<typeof MinutesSchema> & { reviewed_by?: string; reviewed_at?: string };

export const MINUTES_MODEL = "claude-opus-5-5";

export function minutesEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `You prepare meeting minutes for ${FIRM.name}, a Nigerian law firm in Lagos (litigation, corporate, property, arbitration and regulatory work).

Work only from the transcript. Never invent facts, names, amounts or dates; if something is unclear, leave it out or put it under open questions. Keep legal terms as the speakers used them (e.g. "statement of defence", "motion on notice", "C of O", "Governor's consent").

Transcripts come from automatic speech recognition and may label people "Speaker 1", "Speaker 2". Use real names where the conversation makes them clear; otherwise keep the speaker labels. Expect Nigerian English, Yoruba, Pidgin and legal Latin; translate any non-English content into English in the minutes.

Resolve relative dates ("next Tuesday", "within 14 days") against the meeting date given. Flag every deadline that has legal consequences.

Write in clear, concise British English. These minutes are confidential and privileged.`;

export class MinutesRefused extends Error {}

export async function generateMinutes(input: { transcript: string; title: string; heldOn: string; kind: string; participants?: string | null; matter?: string | null }): Promise<Minutes> {
  const client = new Anthropic();
  const header = [
    `Meeting: ${input.title}`,
    `Date: ${input.heldOn}`,
    `Type: ${input.kind}`,
    input.matter ? `Matter: ${input.matter}` : null,
    input.participants ? `Participants listed by the organiser: ${input.participants}` : null,
  ].filter(Boolean).join("\n");

  const response = await client.beta.messages.parse({
    model: MINUTES_MODEL,
    max_tokens: 16000,
    // If the model declines (rare), the request is retried on Anthropic's recommended fallback model
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(MinutesSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `${header}\n\n<transcript>\n${input.transcript}\n</transcript>\n\nPrepare the minutes.` }],
  });

  if (response.stop_reason === "refusal") throw new MinutesRefused("The AI declined to summarise this transcript. Write the minutes by hand.");
  if (response.stop_reason === "max_tokens") throw new Error("The minutes were too long to finish. Try again, or split the transcript.");
  if (!response.parsed_output) throw new Error("The AI response could not be read. Try again.");
  return response.parsed_output;
}
