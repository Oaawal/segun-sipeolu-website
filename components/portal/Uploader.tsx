"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Copy, FolderUp, Loader2, UploadCloud, XCircle } from "lucide-react";
import { stageFile } from "@/lib/portal/stage-client";

type Item = { key: string; name: string; size: number; progress: number; state: "waiting" | "sending" | "done" | "duplicate" | "error"; note?: string };
type Result = { error?: string; duplicate?: { match: string; of_title: string | null; of_where: string | null } };

const SKIP = /(^|\/)(\.|__MACOSX\/|Thumbs\.db$|desktop\.ini$)/i;
const MAX_ZIP = 500 * 1024 * 1024;

/** Everything inside dropped folders (and their subfolders), with the folder path kept in the name. */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  type Entry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string; file?: (cb: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (cb: (e: Entry[]) => void, err: (e: unknown) => void) => void } };
  const entries = Array.from(dt.items || []).map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.()).filter(Boolean) as Entry[];
  if (!entries.length || !entries.some((e) => e.isDirectory)) return Array.from(dt.files);
  const out: File[] = [];
  const walk = async (e: Entry): Promise<void> => {
    if (e.isFile && e.file) {
      const f = await new Promise<File>((res, rej) => e.file!(res, rej)).catch(() => null);
      if (f) out.push(new File([f], e.fullPath.replace(/^\//, ""), { type: f.type, lastModified: f.lastModified }));
    } else if (e.isDirectory && e.createReader) {
      const reader = e.createReader();
      // readEntries returns at most 100 at a time: keep asking until it returns none
      for (;;) {
        const batch = await new Promise<Entry[]>((res, rej) => reader.readEntries(res, rej)).catch(() => [] as Entry[]);
        if (!batch.length) break;
        for (const c of batch) await walk(c);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

/** The files inside a .zip (e.g. a folder downloaded from Google Drive or OneDrive), unpacked in the browser. */
async function unzipFile(zip: File): Promise<File[]> {
  const { unzip } = await import("fflate");
  const data = new Uint8Array(await zip.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>((res, rej) => unzip(data, { filter: (f) => !f.name.endsWith("/") && !SKIP.test(f.name) && f.originalSize < MAX_ZIP }, (err, out) => (err ? rej(err) : res(out))));
  return Object.entries(files).filter(([, b]) => b.length > 0).map(([name, b]) => new File([b as BlobPart], name));
}

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
export function Uploader({ matters, fixedMatter, direct = false }: { matters?: { id: string; number: string; title: string }[]; fixedMatter?: string; direct?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dest, setDest] = useState(fixedMatter || "inbox");
  const [category, setCategory] = useState("other");
  const [unpack, setUnpack] = useState(true);
  const pick = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function post(fd: FormData, key: string, track: boolean) {
    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/portal/api/upload");
      if (track) xhr.upload.onprogress = (e) => e.lengthComputable && update(key, { progress: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => {
        let body: { error?: string; results?: Result[] } = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
        const err = xhr.status !== 200 ? body.error || "Upload failed" : body.results?.[0]?.error;
        const dup = body.results?.[0]?.duplicate;
        update(key, err ? { state: "error", note: err }
          : dup ? { state: "duplicate", progress: 100, note: `Same ${dup.match === "file" ? "file" : "contents"} as ${dup.of_title ? `“${dup.of_title}” (${dup.of_where})` : "a document already kept"}. Saved without using extra space; review it under Duplicates.` }
          : { state: "done", progress: 100 });
        resolve();
      };
      xhr.onerror = () => { update(key, { state: "error", note: "Connection lost. Try again." }); resolve(); };
      xhr.send(fd);
    });
  }

  async function send(file: File, key: string, source: string) {
    const fd = new FormData();
    fd.append("destination", dest);
    fd.append("category", category);
    fd.append("source", source);
    update(key, { state: "sending" });
    if (!direct) {
      fd.append("file", file);
      return post(fd, key, true);
    }
    // Straight to storage first (no size limit from the host), then the portal checks and files it
    try {
      const ref = await stageFile(file, (p) => update(key, { progress: Math.min(95, p) }));
      fd.append("file__staged", JSON.stringify(ref));
      return post(fd, key, false);
    } catch (err) {
      update(key, { state: "error", note: (err as Error).message });
    }
  }

  async function add(list: FileList | File[] | null, source = "browser") {
    if (!list || !list.length) return;
    // A folder chosen with the picker: carry each file's path inside the folder in its name
    let files = Array.from(list)
      .map((f) => { const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath; return rel && rel !== f.name ? new File([f], rel, { type: f.type, lastModified: f.lastModified }) : f; })
      .filter((f) => f.size > 0 && !SKIP.test(f.name));
    if (unpack && files.some((f) => /\.zip$/i.test(f.name))) {
      setBusy(true);
      const expanded: File[] = [];
      for (const f of files) {
        if (!/\.zip$/i.test(f.name) || f.size > MAX_ZIP) { expanded.push(f); continue; }
        try { expanded.push(...(await unzipFile(f)).map((x) => new File([x], `${f.name.replace(/\.zip$/i, "")}/${x.name}`))); } catch { expanded.push(f); }
      }
      files = expanded;
    }
    const fresh = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, progress: 0, state: "waiting" as const }));
    setItems((xs) => [...fresh, ...xs]);
    setBusy(true);
    // Three at a time: quick on office Wi-Fi, gentle on mobile data
    let next = 0;
    const worker = async () => { while (next < files.length) { const i = next++; await send(files[i], fresh[i].key, source); } };
    await Promise.all([worker(), worker(), worker()]);
    setBusy(false);
    router.refresh();
  }

  const done = items.filter((i) => i.state === "done" || i.state === "duplicate").length;
  const failed = items.filter((i) => i.state === "error").length;
  const dups = items.filter((i) => i.state === "duplicate").length;

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
        onDrop={(e) => { e.preventDefault(); setOver(false); const dt = e.dataTransfer; filesFromDrop(dt).then((fs) => add(fs)); }}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-9 text-center transition ${over ? "border-maroon bg-maroon/5" : "border-stone-300 bg-cream/50"}`}
      >
        <UploadCloud className={`h-10 w-10 ${over ? "text-maroon" : "text-stone-400"}`} />
        <div className="font-semibold text-stone-800">Drop files or folders here</div>
        <div className="text-sm text-stone-500">Any number of files, whole folders with their subfolders, or .zip files · PDF, Word, Excel, images, audio, email and more · up to 100 MB each</div>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => pick.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-maroon px-4 py-2.5 text-sm font-semibold text-white hover:bg-maroon-light"><UploadCloud className="h-4 w-4" />Choose files</button>
          <button type="button" onClick={() => folder.current?.click()} className="hidden items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:border-maroon/40 sm:inline-flex"><FolderUp className="h-4 w-4" />Choose a folder</button>
          <button type="button" onClick={() => camera.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 hover:border-maroon/40 sm:hidden"><Camera className="h-4 w-4" />Scan with camera</button>
        </div>
        <input ref={pick} type="file" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <input ref={folder} type="file" multiple className="sr-only" {...{ webkitdirectory: "", directory: "" }} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        <label className="mt-1 flex items-center gap-2 text-xs text-stone-500"><input type="checkbox" checked={unpack} onChange={(e) => setUnpack(e.target.checked)} className="h-3.5 w-3.5 accent-maroon" />Unpack .zip files into separate documents (e.g. a folder downloaded from Google Drive)</label>
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { add(e.target.files, "camera"); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <div className="mt-4 rounded-xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-2.5 text-sm">
            <span className="font-semibold text-stone-700">{busy ? "Uploading…" : "Finished"}</span>
            <span className="text-stone-500">{done} saved{dups ? ` · ${dups} duplicate${dups === 1 ? "" : "s"} to review` : ""}{failed ? ` · ${failed} failed` : ""} · {items.length} total</span>
          </div>
          <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {i.state === "done" ? <CheckCircle2 className="h-4 w-4 flex-none text-green" /> : i.state === "duplicate" ? <Copy className="h-4 w-4 flex-none text-amber-600" /> : i.state === "error" ? <XCircle className="h-4 w-4 flex-none text-red-600" /> : <Loader2 className={`h-4 w-4 flex-none text-stone-400 ${i.state === "sending" ? "animate-spin" : ""}`} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-stone-800">{i.name}</div>
                  {i.state === "error" ? <div className="text-xs text-red-700">{i.note}</div> : i.state === "duplicate" ? <div className="text-xs text-amber-800">{i.note} <a href="/portal/duplicates" className="font-semibold underline">Review</a></div> : (
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
