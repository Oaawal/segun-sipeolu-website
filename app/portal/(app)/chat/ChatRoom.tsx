"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

interface Msg { id: number; sender_id: string; sender: string; body: string; created_at: string }

const time = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ChatRoom({ channel, me, title, initial }: { channel: string; me: string; title: string; initial: Msg[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const last = useRef(initial.length ? initial[initial.length - 1].id : 0);
  const box = useRef<HTMLDivElement>(null);

  const add = useCallback((more: Msg[]) => {
    if (!more.length) return;
    setMsgs((cur) => { const seen = new Set(cur.map((m) => m.id)); return [...cur, ...more.filter((m) => !seen.has(m.id))]; });
    last.current = Math.max(last.current, more[more.length - 1].id);
  }, []);

  const fetchNew = useCallback(async () => {
    const res = await fetch(`/portal/api/chat?channel=${encodeURIComponent(channel)}&after=${last.current}&seen=${document.visibilityState === "visible" ? 1 : 0}`, { cache: "no-store" });
    if (res.status === 401) { setError("You have been signed out. Reload the page to sign in again."); return false; }
    if (res.ok) add((await res.json()).messages);
    return true;
  }, [channel, add]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const go = await fetchNew().catch(() => true);
      if (!stop && go) timer = setTimeout(tick, document.visibilityState === "visible" ? 4000 : 20000);
    };
    timer = setTimeout(tick, 4000);
    return () => { stop = true; clearTimeout(timer); };
  }, [fetchNew]);

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs.length]);

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/portal/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, text }) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Not sent. Try again."); return; }
      setText("");
      await fetchNew();
    } catch { setError("Not sent. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="flex h-[70vh] min-w-0 flex-col rounded-2xl border border-stone-200/80 bg-white">
      <div className="border-b border-stone-100 px-5 py-3 font-semibold text-stone-800">{title}</div>
      <div ref={box} className="flex-1 space-y-3 overflow-y-auto px-5 py-4" data-chat-messages>
        {msgs.length === 0 && <p className="py-10 text-center text-sm text-stone-400">No messages yet.</p>}
        {msgs.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className="mb-0.5 text-[11px] text-stone-400">{mine ? "You" : m.sender} · {time(m.created_at)}</div>
              <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-maroon text-white" : "bg-cream text-stone-800"}`}>{m.body}</div>
            </div>
          );
        })}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2 border-t border-stone-100 p-3">
        <textarea
          name="text" value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={4000} placeholder="Write a message"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="max-h-40 min-h-[2.5rem] flex-1 resize-y rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-maroon focus:outline-none"
        />
        <button disabled={busy || !text.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-maroon px-4 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" />Send</button>
      </form>
      {error && <p className="px-4 pb-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}
