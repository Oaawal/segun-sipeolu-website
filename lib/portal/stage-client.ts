/**
 * Browser side of direct uploads (Vercel): get a short-lived link from the
 * portal, send the file straight to storage, and return the reference that
 * the portal's form or upload route then accepts as "<field>__staged".
 */
export type Staged = { key: string; name: string; type: string };

export async function stageFile(file: File, onProgress?: (pct: number) => void): Promise<Staged> {
  const res = await fetch("/portal/api/upload/stage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) });
  const body = (await res.json().catch(() => ({}))) as { key?: string; url?: string; error?: string };
  if (!res.ok || !body.url || !body.key) throw new Error(body.error || "The upload could not start.");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", body.url!);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the upload (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Connection lost during upload, or storage is not set to accept uploads from this site (CORS)."));
    xhr.send(file);
  });
  return { key: body.key, name: file.name, type: file.type || "application/octet-stream" };
}
