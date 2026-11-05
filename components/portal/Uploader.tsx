"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, FolderUp, Loader2, UploadCloud, XCircle } from "lucide-react";

type Item = { key: string; name: string; size: number; progress: number; state: "waiting" | "sending" | "done" | "error"; note?: string };

const CATEGORIES: [string, string][] = [
  ["other", "Other"], ["pleading", "Pleading / process"], ["court_order", "Court order / judgment"], ["evidence", "Evidence / exhibit"],
  ["correspondence", "Correspondence"], ["contract", "Contract / agreement"], ["opinion", "Legal opinion / memo"], ["id", "Identity / KYC"], ["title", "Title document"],
];

function size(n: number) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Drop files or whole folders, pick them, or scan with the phone camera.
 * Each file uploads on its own with a progress bar, to the person's inbox or
 * to a matter. Files go straight to encrypted storage; nothing stays in the browser.
 */
export function Uploader({ matters, fixedMatter }: { matters?: { id: string; number: string; title: string }[]; fixedMatter?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dest, setDest] = useState(fixedMatter || "inbox");
  const [category, setCategory] = useState("other");
  const pick = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function send(file: File, key: string, source: string) {
    return new Promise<void>((resolve) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("destination", dest);
      fd.append("category", category);
      fd.append("source", source);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/portal/api/upload");
      xhr.upload.onprogress = (e) => e.lengthComputable && update(key, { progress: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        let body: { error?: string; results?: { error?: string }[] } = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
        const err = xhr.status !== 200 ? body.error || "Upload failed" : body.results?.[0]?.error;
        update(key, err ? { state: "error", note: err } : { state: "done", progress: 100 });
        resolve();
      };
      xhr.onerror = () => { update(key, { state: "error", note: "Connection lost. Try again." }); resolve(); };
      update(key, { state: "sending" });
      xhr.send(fd);
    });
  }

  async function add(list: FileList | File[] | null, source = "browser") {
    if (!list || !list.length) return;
    const files = Array.from(list).filter((f) => f.size > 0 && !f.name.startsWith("."));
    const fresh = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, size: f.size, progress: 0, state: "waiting" as const }));
    setItems((xs) => [...fresh, ...xs]);
    setBusy(true);
    // Three at a time: quick on office Wi-Fi, gentle on mobile data
    let next = 0;
    const worker = async () => { while (next < files.length) { const i = next++; await send(files[i], fresh[i].key, source); } };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
    router.refresh();
  }

  const done = items.filter((i) => i.state === "done").length;
  const failed = items.filter((i) => i.state === "error").length;

  return (
    <div>
      {!fixedMatter && matters && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Save to</span>
            <select value={dest} onChange={(e) => setDest(e.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm">
              <option value="inbox">My inbox (file to a matter later)</option>
              {matters.map((m) => <option key={m.id} value={m.id}>{m.number} · {m.title}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-stone-700">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm">
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-9 text-center transition ${over ? "border-maroon bg-maroon/5" : "border-stone-300 bg-cream/50"}`}
      >
        <UploadCloud className={`h-10 w-10 ${over ? "text-maroon" : "text-stone-400"}`} />
        <div className="font-semibold text-stone-800">Drop files or folders here</div>
        <div className="text-sm text-stone-500">PDF, Word, Excel, images, audio, email files and more · up to 100 MB each</div>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => pick.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-maroon px-4 py-2.5 text-sm font-semibold text-white hover:bg-maroon-light"><UploadCloud className="h-4 w-4" />Choose files</button>
          <button type="button" onClick={() => folder.current?.click()} className="hidden items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:border-maroon/40 sm:inline-flex"><FolderUp className="h-4 w-4" />Choose a folder</button>
          <button type="button" onClick={() => camera.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:border-maroon/40 sm:hidden"><Camera className="h-4 w-4" />Scan with camera</button>
        </div>
        <input ref={pick} type="file" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <input ref={folder} type="file" multiple className="sr-only" {...{ webkitdirectory: "", directory: "" }} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { add(e.target.files, "camera"); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <div className="mt-4 rounded-xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5 text-sm">
            <span className="font-semibold text-stone-700">{busy ? "Uploading…" : "Finished"}</span>
            <span className="text-stone-500">{done} saved{failed ? ` · ${failed} failed` : ""} · {items.length} total</span>
          </div>
          <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {i.state === "done" ? <CheckCircle2 className="h-4 w-4 flex-none text-green" /> : i.state === "error" ? <XCircle className="h-4 w-4 flex-none text-red-600" /> : <Loader2 className={`h-4 w-4 flex-none text-stone-400 ${i.state === "sending" ? "animate-spin" : ""}`} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-stone-800">{i.name}</div>
                  {i.state === "error" ? <div className="text-xs text-red-700">{i.note}</div> : (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-gradient-to-r from-maroon to-gold transition-all" style={{ width: `${i.progress}%` }} /></div>
                  )}
                </div>
                <span className="flex-none text-xs text-stone-400">{size(i.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
