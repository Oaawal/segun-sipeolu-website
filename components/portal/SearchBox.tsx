"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, BookUser, FileImage, FileSpreadsheet, FileText, Loader2, Mail, Music, Search, User, Users } from "lucide-react";

type S = { kind: "document" | "matter" | "client" | "contact" | "party" | "staff"; id: string; title: string; detail: string; href: string; snippet?: string | null; ext?: string };

const GROUPS: [S["kind"][], string][] = [[["document"], "Documents"], [["matter"], "Matters"], [["client", "contact", "party", "staff"], "People"]];

function Icon({ s }: { s: S }) {
  const c = "h-4 w-4 flex-none";
  if (s.kind === "matter") return <Briefcase className={`${c} text-maroon`} />;
  if (s.kind === "client") return <Users className={`${c} text-maroon`} />;
  if (s.kind === "contact") return <BookUser className={`${c} text-maroon`} />;
  if (s.kind === "party" || s.kind === "staff") return <User className={`${c} text-maroon`} />;
  const e = s.ext || "";
  if (/^(jpe?g|png|webp|gif|heic|tiff?)$/.test(e)) return <FileImage className={`${c} text-sky-700`} />;
  if (/^(xlsx?|csv|ods)$/.test(e)) return <FileSpreadsheet className={`${c} text-green`} />;
  if (/^(eml|msg)$/.test(e)) return <Mail className={`${c} text-amber-700`} />;
  if (/^(mp3|m4a|wav|webm|ogg|aac|mp4)$/.test(e)) return <Music className={`${c} text-stone-500`} />;
  return <FileText className={`${c} ${e === "pdf" ? "text-red-700" : /^docx?$/.test(e) ? "text-sky-700" : "text-stone-500"}`} />;
}

/** The typed words in bold inside a result's title, the way Windows shows matches. */
function Hi({ text, term }: { text: string; term: string }) {
  const words = term.trim().split(/\s+/).filter((w) => w.length >= 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i} className="font-bold text-maroon-dark">{p}</strong> : <span key={i}>{p}</span>))}</>;
}

function Snippet({ text }: { text: string }) {
  const parts = text.replace(/\s+/g, " ").split(/(«[^»]*»)/g);
  return <div className="mt-0.5 line-clamp-2 text-xs text-stone-500">{parts.map((p, i) => (p.startsWith("«") ? <mark key={i} className="rounded bg-gold/30 px-0.5 text-stone-900">{p.slice(1, -1)}</mark> : <span key={i}>{p}</span>))}</div>;
}

/**
 * Search as you type, like the Windows search box: documents by name, folder
 * or the words inside, matters, and people. Arrow keys and Enter to open;
 * Enter with nothing chosen shows every result. Ctrl+K (⌘K) jumps here.
 */
export function SearchBox({ dark = false, autoFocus = false, initial = "" }: { dark?: boolean; autoFocus?: boolean; initial?: string }) {
  const router = useRouter();
  const [term, setTerm] = useState(initial);
  const [results, setResults] = useState<S[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!dark) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    const onClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [dark]);

  useEffect(() => {
    if (dark) return;
    const onClick = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [dark]);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/portal/api/search/suggest?q=${encodeURIComponent(t)}`, { cache: "no-store" });
        const body = (await res.json()) as { results?: S[] };
        // Ignore answers that arrive after a newer search started
        if (mine === seq.current) { setResults(body.results || []); setActive(-1); setOpen(true); }
      } catch { /* keep the last results */ } finally { if (mine === seq.current) setLoading(false); }
    }, 180);
    return () => clearTimeout(timer);
  }, [term]);

  const ordered = GROUPS.flatMap(([kinds]) => results.filter((r) => kinds.includes(r.kind)));
  const go = (s?: S) => {
    setOpen(false);
    if (!s) { if (term.trim()) router.push(`/portal/search?q=${encodeURIComponent(term.trim())}`); return; }
    if (s.kind === "document") window.open(s.href, "_blank", "noopener");
    else router.push(s.href);
  };

  let n = -1;
  const sections: ReactNode[] = GROUPS.map(([kinds, label]) => {
    const rows = ordered.filter((r) => kinds.includes(r.kind));
    if (!rows.length) return null;
    return (
      <div key={label} className="py-1">
        <div className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</div>
        {rows.map((s) => {
          n++;
          const i = n;
          return (
            <button key={`${s.kind}-${s.id}`} type="button" role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => go(s)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-cream" : "hover:bg-cream/60"}`}>
              <span className="mt-0.5"><Icon s={s} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-stone-800"><Hi text={s.title} term={term} /></span>
                <span className="block truncate text-xs text-stone-500">{s.detail}</span>
                {s.snippet && <Snippet text={s.snippet} />}
              </span>
            </button>
          );
        })}
      </div>
    );
  });

  return (
    <div ref={box} className="relative">
      <form role="search" onSubmit={(e) => { e.preventDefault(); go(active >= 0 ? ordered[active] : undefined); }}>
        <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${dark ? "text-white/40" : "text-stone-400"}`} />
        <input ref={input} name="q" type="search" value={term} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
          onChange={(e) => { setTerm(e.target.value); setActive(-1); if (e.target.value.trim().length < 2) { setResults([]); setOpen(false); } }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, ordered.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
            else if (e.key === "Escape") { setOpen(false); }
          }}
          placeholder={dark ? "Search  ·  Ctrl+K" : "Names, words inside documents, matter or suit numbers…"}
          role="combobox" aria-label="Search everything" aria-controls={dark ? "search-results-side" : "search-results-page"} aria-expanded={open} aria-autocomplete="list"
          className={dark
            ? "w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-white placeholder:text-white/40 focus:border-gold/50 focus:outline-none"
            : "w-full rounded-xl border border-stone-300 bg-white py-3.5 pl-10 pr-10 text-base text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-maroon focus:outline-none focus:ring-2 focus:ring-maroon/15"} />
        {loading && <Loader2 className={`absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin ${dark ? "text-white/50" : "text-stone-400"}`} />}
      </form>
      {open && term.trim().length >= 2 && (
        <div role="listbox" id={dark ? "search-results-side" : "search-results-page"} className={`absolute z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-2xl ${dark ? "left-0 w-[min(30rem,calc(100vw-2rem))]" : "inset-x-0"}`}>
          {ordered.length === 0 ? <div className="px-3 py-4 text-sm text-stone-500">{loading ? "Searching…" : "Nothing you can open matches that yet."}</div> : sections}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go()} className="mt-1 flex w-full items-center gap-2 border-t border-stone-100 px-3 py-2.5 text-left text-sm font-semibold text-maroon hover:bg-cream/60">
            <Search className="h-4 w-4" />See all results for “{term.trim()}”
          </button>
        </div>
      )}
    </div>
  );
}
