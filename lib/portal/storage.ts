import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { appSecret, sha256 } from "./crypto";
import { dataDir } from "./db";

/**
 * Private file storage for documents and recordings.
 *
 * Files live outside the web root (PORTAL_DATA_DIR/files) and are only served
 * through the authorised download route. Each file is encrypted at rest with
 * AES-256-GCM (key derived from APP_SECRET), and its SHA-256 is recorded so
 * any corruption or tampering is detected on download.
 *
 * IMPORTANT: losing APP_SECRET makes stored files unreadable. Keep a copy of
 * it somewhere safe and separate from the server (see docs/portal/HANDOVER.md).
 */

export const MAX_FILE_BYTES = Number(process.env.PORTAL_MAX_FILE_MB || 100) * 1024 * 1024;

const TYPES: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv", rtf: "application/rtf", eml: "message/rfc822", msg: "application/vnd.ms-outlook", zip: "application/zip",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", webm: "audio/webm", ogg: "audio/ogg", mp4: "video/mp4", aac: "audio/aac",
  vtt: "text/vtt", srt: "text/plain",
};
const INLINE = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);
export const AUDIO_EXT = new Set(["mp3", "m4a", "wav", "webm", "ogg", "mp4", "aac"]);

export function ext(name: string) {
  return (/\.([a-z0-9]+)$/i.exec(name)?.[1] || "").toLowerCase();
}

export function uploadProblem(file: File | null, { audioOnly = false } = {}): string | null {
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) return "Choose a file.";
  if (file.size > MAX_FILE_BYTES) return `That file is larger than ${MAX_FILE_BYTES / 1048576} MB.`;
  const e = ext(file.name);
  if (!TYPES[e]) return "That type of file is not accepted.";
  if (audioOnly && !AUDIO_EXT.has(e)) return "Upload an audio recording (MP3, M4A, WAV, WEBM, OGG, AAC or MP4).";
  return null;
}

export function cleanName(name: string) {
  return name.replace(/[\\/\r\n"<>:|?*]/g, "_").slice(-180) || "file";
}

function fileKey(): Buffer {
  return crypto.createHash("sha256").update(`files:${appSecret()}`).digest();
}

function root() {
  return path.join(dataDir(), "files");
}

function checkKey(key: string) {
  if (!/^[0-9]{4}\/[0-9a-f-]{36}$/.test(key)) throw new Error("Bad storage key");
  return key;
}

// ── Where encrypted files live ───────────────────────────────────
// S3-compatible storage (Cloudflare R2, AWS S3, Supabase...) when STORAGE_S3_BUCKET
// is set; otherwise the local disk under PORTAL_DATA_DIR. Either way the bytes
// are encrypted before they leave this module.
export function s3Enabled() {
  return !!process.env.STORAGE_S3_BUCKET;
}

let s3Client: import("@aws-sdk/client-s3").S3Client | null = null;
async function s3() {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({
      region: process.env.STORAGE_S3_REGION || "auto",
      endpoint: process.env.STORAGE_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.STORAGE_S3_PATH_STYLE === "1",
      credentials: { accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID || "", secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY || "" },
      // R2 does not accept the newer default checksum headers on presigned uploads
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return s3Client;
}
const BUCKET = () => process.env.STORAGE_S3_BUCKET!;

async function rawPut(objectKey: string, body: Buffer) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  await (await s3()).send(new PutObjectCommand({ Bucket: BUCKET(), Key: objectKey, Body: body, ContentType: "application/octet-stream" }));
}

async function rawGet(objectKey: string): Promise<Buffer> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const r = await (await s3()).send(new GetObjectCommand({ Bucket: BUCKET(), Key: objectKey }));
  return Buffer.from(await r.Body!.transformToByteArray());
}

async function rawDelete(objectKey: string) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await (await s3()).send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: objectKey }));
}

function guardServerless() {
  if (process.env.VERCEL && !s3Enabled()) throw new Error("On Vercel, set STORAGE_S3_BUCKET and its keys (Cloudflare R2): Vercel has no permanent disk.");
}

/** Store bytes; returns the storage key and the SHA-256 of the original content. */
export async function putFile(bytes: Buffer): Promise<{ key: string; sha256: string }> {
  guardServerless();
  const key = `${new Date().getFullYear()}/${crypto.randomUUID()}`;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", fileKey(), iv);
  const enc = Buffer.concat([c.update(bytes), c.final()]);
  const out = Buffer.concat([Buffer.from("SSA1"), iv, c.getAuthTag(), enc]);
  if (s3Enabled()) {
    await rawPut(`files/${key}`, out);
  } else {
    const p = path.join(root(), key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, out, { flag: "wx" });
  }
  return { key, sha256: sha256(bytes) };
}

/** Read and decrypt; throws if the file was altered (GCM tag) or does not match its recorded hash. */
export async function getFile(key: string, expectedSha256?: string): Promise<Buffer> {
  checkKey(key);
  const raw = s3Enabled() ? await rawGet(`files/${key}`) : await fs.readFile(path.join(root(), key));
  if (raw.subarray(0, 4).toString() !== "SSA1") throw new Error("Unknown file format");
  const iv = raw.subarray(4, 16);
  const tag = raw.subarray(16, 32);
  const d = crypto.createDecipheriv("aes-256-gcm", fileKey(), iv);
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(raw.subarray(32)), d.final()]);
  if (expectedSha256 && sha256(plain) !== expectedSha256) throw new Error("Integrity check failed");
  return plain;
}

export async function deleteFile(key: string) {
  checkKey(key);
  if (s3Enabled()) await rawDelete(`files/${key}`);
  else await fs.rm(path.join(root(), key), { force: true });
}

// ── Direct uploads (browser → storage) ──────────────────────────
// Vercel refuses request bodies over 4.5 MB, so with S3 storage the browser
// sends each file straight to the bucket through a short-lived link, into a
// staging area (incoming/<person>/<id>). The portal then reads it, checks it,
// encrypts and fingerprints it like any other upload, and deletes the staged
// copy. Staged objects are only ever readable by the server.
export const STAGE_TTL_SECONDS = 15 * 60;

export async function stagedUploadUrl(userId: string, size: number) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const key = `incoming/${userId}/${crypto.randomUUID()}`;
  const url = await getSignedUrl(await s3(), new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentLength: size, ContentType: "application/octet-stream" }), { expiresIn: STAGE_TTL_SECONDS });
  return { key, url };
}

export function isOwnStagedKey(userId: string, key: unknown): key is string {
  return typeof key === "string" && new RegExp(`^incoming/${userId}/[0-9a-f-]{36}$`).test(key);
}

export async function takeStaged(key: string): Promise<Buffer> {
  const bytes = await rawGet(key);
  await rawDelete(key).catch(() => {});
  return bytes;
}

export function mimeFor(name: string) {
  return TYPES[ext(name)] || "application/octet-stream";
}

/** Headers for serving a stored file: type from the extension only; non-previewable types download. */
export function downloadHeaders(name: string, forceDownload = false): Record<string, string> {
  const e = ext(name);
  const inline = INLINE.has(e) && !forceDownload;
  const safe = cleanName(name).replace(/[^\x20-\x7e]/g, "_");
  return {
    "Content-Type": inline ? TYPES[e] : AUDIO_EXT.has(e) ? TYPES[e] : "application/octet-stream",
    "Content-Disposition": `${inline || AUDIO_EXT.has(e) ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
  };
}
