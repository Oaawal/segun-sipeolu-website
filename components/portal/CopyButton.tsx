"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { btn } from "./ui";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={btn.small} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* the field stays selectable */ }
    }}>
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? "Copied" : label}
    </button>
  );
}

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className={btn.ghost}><Printer className="h-4 w-4" />{label}</button>;
}
