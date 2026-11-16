/** Next.js calls onRequestError for every unhandled server error: record it and alert the administrator. */
export async function onRequestError(err: unknown, request: { path: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const e = err as Error & { digest?: string };
    // Redirects and not-found are normal control flow, not errors
    if (e?.digest && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(e.digest)) return;
    const { recordError } = await import("./lib/portal/errors");
    await recordError(String(e?.message || err), (request?.path || "").split("?")[0], e?.digest ?? null);
  } catch {
    /* the error log must never cause another error */
  }
}
