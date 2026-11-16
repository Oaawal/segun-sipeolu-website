"use client";

import { useEffect, useState } from "react";

/** Live h:mm:ss since a moment, for the running timer. */
export function Elapsed({ since }: { since: string }) {
  const start = new Date(since).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  if (now === null) return <span>…</span>;
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span>{Math.floor(s / 3600)}:{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}</span>;
}
