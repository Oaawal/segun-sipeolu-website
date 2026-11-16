"use server";

import { redirect } from "next/navigation";
import { q } from "@/lib/portal/db";
import { audit } from "@/lib/portal/audit";
import { requirePermission } from "@/lib/portal/auth";
import { askAssistant, assistantEnabled, ASSISTANT_MODEL } from "@/lib/portal/assistant";

type State = { error?: string } | undefined;

export async function ask(_: State, fd: FormData): Promise<State> {
  const u = await requirePermission("assistant.use");
  if (!assistantEnabled()) return { error: "The assistant is not switched on (ANTHROPIC_API_KEY)." };
  const question = String(fd.get("question") || "").trim().slice(0, 1000);
  if (question.length < 4) return { error: "Type a question." };
  const recent = await q<{ n: number }>("SELECT COUNT(*)::int AS n FROM assistant_log WHERE user_id = $1 AND created_at > now() - interval '1 hour'", [u.id]);
  if (Number(recent[0]?.n) >= 60) return { error: "That is a lot of questions in an hour. Please wait a little." };
  let result;
  try {
    result = await askAssistant(u, question);
  } catch (err) {
    return { error: (err as Error).message.startsWith("The assistant") ? (err as Error).message : "The assistant could not answer just now. Try again in a minute." };
  }
  const id = crypto.randomUUID();
  const used = result.sources.filter((s) => result.answer.sources.includes(s.key)).map(({ key, kind, label, href }) => ({ key, kind, label, href }));
  await q("INSERT INTO assistant_log (id, user_id, question, answer, sources, model) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, u.id, question, JSON.stringify(result.answer), JSON.stringify({ used, all: result.sources.map(({ key, kind, label, href }) => ({ key, kind, label, href })) }), ASSISTANT_MODEL]);
  await audit({ userId: u.id, actor: u.email, action: "assistant.asked", entityType: "assistant", entityId: id, detail: { sources: used.map((s) => s.label) } });
  redirect(`/portal/ask?id=${id}`);
}
