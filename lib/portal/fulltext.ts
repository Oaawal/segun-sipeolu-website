import "server-only";
import { after } from "next/server";
import { unzipSync, strFromU8 } from "fflate";
import Anthropic from "@anthropic-ai/sdk";
import { q } from "./db";
import { getFile, ext } from "./storage";
import { checkContentDuplicate } from "./dedupe";

/**
 * Reads the words inside stored documents so search finds what a document
 * says, not just its title. Word, PDF, email, text, PowerPoint and Excel
 * files are read directly. Scanned PDFs and photos are read by Claude
 * (text recognition) when ANTHROPIC_API_KEY is set and PORTAL_OCR is not "off".
 *
 * Runs in the background after uploads, and catches up on the daily jobs,
 * so a slow file never holds up an upload.
 */

const MAX_CHARS = 1_000_000;
const OCR_MAX_BYTES = 20 * 1024 * 1024;
const OCR_MODEL = "claude-opus-5-5";

export function ocrEnabled() {
  return !!process.env.ANTHROPIC_API_KEY && process.env.PORTAL_OCR !== "off";
}

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** Text of Office XML: paragraphs become lines, everything else is dropped. */
function officeXmlText(xml: string) {
  return decode(xml.replace(/<\/(w:p|a:p|si|row)>/g, "\n").replace(/<w:tab\/>|<\/c>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function zipText(bytes: Buffer, pick: (name: string) => boolean) {
  const files = unzipSync(new Uint8Array(bytes), { filter: (f) => pick(f.name) });
  return Object.keys(files).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((k) => officeXmlText(strFromU8(files[k]))).filter(Boolean).join("\n\n");
}

async function ocr(bytes: Buffer, mediaType: string): Promise<string> {
  const client = new Anthropic();
  const data = bytes.toString("base64");
  const block = mediaType === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data } };
  const msg = await client.beta.messages.stream({
    model: OCR_MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: "You transcribe scanned legal documents (Nigerian court processes, letters, title documents, receipts) for a law firm's search index. Output only the text of the document, in reading order, with page breaks as blank lines. Do not summarise, correct, translate or comment. Mark illegible words as [illegible]. Describe stamps or signatures briefly in square brackets, e.g. [stamp: High Court of Lagos State, filed 3 March 2026].",
    messages: [{ role: "user", content: [block, { type: "text", text: "Transcribe this document." }] }],
  }).finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("Text recognition declined this file");
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

export async function extractText(bytes: Buffer, fileName: string): Promise<{ text: string; method: string } | null> {
  const e = ext(fileName);
  if (["docx", "dotx", "docm"].includes(e)) return { text: zipText(bytes, (n) => /^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(n)), method: "docx" };
  if (["pptx"].includes(e)) return { text: zipText(bytes, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)), method: "pptx" };
  if (["xlsx"].includes(e)) return { text: zipText(bytes, (n) => n === "xl/sharedStrings.xml"), method: "xlsx" };
  if (["txt", "md", "csv", "vtt", "srt", "json", "xml", "log"].includes(e)) return { text: bytes.toString("utf8"), method: "text" };
  if (["html", "htm"].includes(e)) return { text: decode(bytes.toString("utf8").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(), method: "text" };
  if (e === "rtf") return { text: bytes.toString("latin1").replace(/\\par[d]?/g, "\n").replace(/\{\\\*[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/g, "").trim(), method: "text" };
  if (e === "eml") {
    const { simpleParser } = await import("mailparser");
    const m = await simpleParser(bytes);
    const addr = (a: unknown) => (Array.isArray(a) ? a : a ? [a] : []).map((x: { text?: string }) => x.text || "").join(", ");
    return { text: [`Subject: ${m.subject || ""}`, `From: ${addr(m.from)}`, `To: ${addr(m.to)}`, `Date: ${m.date?.toISOString() || ""}`, "", m.text || ""].join("\n"), method: "email" };
  }
  if (e === "pdf") {
    let text = "";
    let pages = 1;
    try {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const r = await pdfText(pdf, { mergePages: true });
      text = r.text.trim();
      pages = r.totalPages || 1;
    } catch { /* unreadable as text: try recognition below */ }
    // A scan has little or no text layer: fewer than ~40 characters a page
    if (text.replace(/\s/g, "").length < 40 * pages && ocrEnabled() && bytes.length <= OCR_MAX_BYTES) return { text: await ocr(bytes, "application/pdf"), method: "ocr" };
    return { text, method: "pdf" };
  }
  const img: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  if (img[e]) return ocrEnabled() && bytes.length <= 5 * 1024 * 1024 ? { text: await ocr(bytes, img[e]), method: "ocr" } : null;
  return null;
}

/** Read up to `limit` documents not read yet. Returns how many were done. */
export async function indexPending(limit = 10, budgetMs = 50_000): Promise<number> {
  const started = Date.now();
  const rows = await q<{ id: string; file_name: string; storage_key: string; sha256: string }>(
    `SELECT d.id, d.file_name, d.storage_key, d.sha256 FROM documents d LEFT JOIN document_text t ON t.document_id = d.id
     WHERE t.document_id IS NULL AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC LIMIT $1`, [limit]);
  let n = 0;
  for (const d of rows) {
    if (Date.now() - started > budgetMs) break;
    try {
      // The same file was read before (a duplicate): copy its words instead of reading it again
      const twin = await q<{ status: string; method: string | null; content: string | null }>(
        "SELECT t.status, t.method, t.content FROM document_text t JOIN documents o ON o.id = t.document_id WHERE o.sha256 = $1 AND o.id <> $2 AND t.status IN ('ok','empty','unsupported') LIMIT 1", [d.sha256, d.id]);
      if (twin.length) {
        await q(`INSERT INTO document_text (document_id, status, method, content, tsv) VALUES ($1,$2,$3,$4, to_tsvector('english', COALESCE($4, '')))
                 ON CONFLICT (document_id) DO NOTHING`, [d.id, twin[0].status, twin[0].method, twin[0].content]);
        if (twin[0].content) await checkContentDuplicate(d.id, twin[0].content);
        n++;
        continue;
      }
      const bytes = await getFile(d.storage_key, d.sha256);
      const r = await extractText(bytes, d.file_name);
      if (!r) {
        await q("INSERT INTO document_text (document_id, status) VALUES ($1,'unsupported') ON CONFLICT (document_id) DO NOTHING", [d.id]);
      } else {
        const text = r.text.replace(/\u0000/g, "").slice(0, MAX_CHARS);
        await q(
          `INSERT INTO document_text (document_id, status, method, content, tsv) VALUES ($1,$2,$3,$4, to_tsvector('english', $4))
           ON CONFLICT (document_id) DO UPDATE SET status = $2, method = $3, content = $4, tsv = to_tsvector('english', $4), error = NULL, indexed_at = now()`,
          [d.id, text.trim() ? "ok" : "empty", r.method, text]);
        if (text.trim()) await checkContentDuplicate(d.id, text);
      }
    } catch (err) {
      await q("INSERT INTO document_text (document_id, status, error) VALUES ($1,'failed',$2) ON CONFLICT (document_id) DO UPDATE SET status = 'failed', error = $2, indexed_at = now()", [d.id, String((err as Error).message).slice(0, 300)]);
    }
    n++;
  }
  return n;
}

/** Read new documents in the background once the current request has answered. */
export function indexSoon() {
  try {
    after(() => indexPending(10).catch(() => 0));
  } catch {
    /* outside a request (scripts): the daily job catches up */
  }
}

export async function indexStats() {
  const r = await q<{ status: string | null; n: number }>(
    "SELECT t.status, COUNT(*)::int AS n FROM documents d LEFT JOIN document_text t ON t.document_id = d.id WHERE d.deleted_at IS NULL GROUP BY t.status");
  const get = (s: string | null) => r.find((x) => x.status === s)?.n || 0;
  return { read: get("ok"), empty: get("empty"), unsupported: get("unsupported"), failed: get("failed"), waiting: get(null) };
}
