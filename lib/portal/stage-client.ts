/**
 * Browser side of direct uploads (Vercel): get a short-lived link from the
 * portal, send the file straight to storage, and return the reference that
 * the portal's form or upload route then accepts as "<field>__staged".
 */
export type Staged = { key: string; name: string; type: string };

export async function stageFile(file: File, onProgress?: (pct: number) => void): Promise<Staged> {
  const res = await fetch("/portal/api/upload/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) });
  const body = (await res.json().catch(() => ({}))) as { key?: string; url?: string; token?: string; error?: string };
  if (!res.ok || !body.key || !(body.url || body.token)) throw new Error(body.error || "The upload could not start.");
  if (body.token) {
    // Vercel Blob: the token only allows this one path, this size, for 15 minutes
    const { put } = await import("@vercel/blob/client");
    await put(body.key, file, {
      access: "private", token: body.token, contentType: "application/octet-stream", multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: (p) => onProgress?.(Math.round(p.percentage)),
    }).catch((e: Error) => { throw new Error(`Storage refused the upload: ${e.message}`); });
    return { key: body.key, name: file.name, type: file.type || "application/octet-stream" };
  }
  return { key: body.key, name: file.name, type: file.type || "application/octet-stream" };
}
