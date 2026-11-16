import { notFound } from "next/navigation";
import { CheckCircle2, Download, FileSignature, ShieldCheck, XCircle } from "lucide-react";
import { q } from "@/lib/portal/db";
import { signRequestByToken } from "@/lib/portal/signatures";
import { fmtDateTime } from "@/lib/portal/format";
import { Field, Note, btn } from "@/components/portal/ui";
import { declineDocument, signDocument } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const r = await signRequestByToken(token);
  if (!r) notFound();
  if (r.status === "sent" && !r.signed_at) await q("UPDATE signature_requests SET viewed_at = COALESCE(viewed_at, now()) WHERE id = $1", [r.id]);
  const changed = r.current_sha !== r.doc_sha256;
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold/40 bg-maroon font-serif text-lg font-bold text-gold">S</span>
        <div><div className="font-serif text-lg font-semibold leading-tight text-maroon-dark">Segun Sipeolu &amp; Associates</div><div className="text-xs text-stone-500">Electronic signature</div></div>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
        {r.status === "signed" ? (
          <div className="text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-green" /><h1 className="mt-3 font-serif text-2xl text-maroon-dark">Signed</h1><p className="mt-2 text-sm text-stone-600">&ldquo;{r.title}&rdquo; was signed by {r.signed_name} on {fmtDateTime(r.signed_at)}. Thank you.</p></div>
        ) : r.status !== "sent" ? (
          <div className="text-center"><XCircle className="mx-auto h-12 w-12 text-stone-400" /><h1 className="mt-3 font-serif text-2xl text-maroon-dark">This link is no longer active</h1><p className="mt-2 text-sm text-stone-600">The request was {r.status === "expired" ? "not completed in time" : r.status}. Please contact {r.requested_by || "the firm"} if you still need to sign.</p></div>
        ) : changed ? (
          <Note tone="danger">The document has changed since this request was sent, so it cannot be signed. Please ask {r.requested_by || "the firm"} for a new request.</Note>
        ) : (
          <>
            <FileSignature className="h-10 w-10 text-maroon" />
            <h1 className="mt-3 font-serif text-2xl text-maroon-dark">{r.title}</h1>
            <p className="mt-1 text-sm text-stone-500">For {r.signer_name}{r.requested_by ? `, sent by ${r.requested_by}` : ""}{r.matter_number ? ` (our ref. ${r.matter_number})` : ""}. Link valid until {fmtDateTime(r.expires_at)}.</p>
            {r.message && <p className="mt-4 whitespace-pre-line rounded-xl bg-cream p-4 text-sm text-stone-700">{r.message}</p>}
            <a href={`/sign/${token}/file`} className={`${btn.ghost} mt-5 w-full`}><Download className="h-4 w-4" />Download and read the document ({r.file_name})</a>
            {sp.e && <div className="mt-4"><Note tone="danger">Type your full name exactly as shown ({r.signer_name}) and tick the box to sign.</Note></div>}
            <form action={signDocument} className="mt-6 space-y-4 border-t border-stone-100 pt-5">
              <input type="hidden" name="token" value={token} />
              <Field label="Type your full name to sign" name="signed_name" required autoComplete="name" placeholder={r.signer_name} />
              <label className="flex items-start gap-2.5 text-sm text-stone-700"><input type="checkbox" name="agree" value="1" required className="mt-0.5 h-4 w-4 accent-maroon" /><span>I have read &ldquo;{r.title}&rdquo; and I agree to sign it electronically. I understand my typed name is my signature.</span></label>
              <button className={`${btn.primary} w-full`}>Sign the document</button>
            </form>
            <details className="mt-5 text-sm">
              <summary className="cursor-pointer text-stone-500">I do not want to sign</summary>
              <form action={declineDocument} className="mt-3 space-y-3">
                <input type="hidden" name="token" value={token} />
                <Field label="Reason (optional, shared with the firm)" name="reason" />
                <button className={btn.danger}>Decline</button>
              </form>
            </details>
            <p className="mt-6 flex items-start gap-1.5 text-xs text-stone-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-none" />We record the time, your network address and a fingerprint (SHA-256) of the exact file, as evidence of your signature under the Evidence Act 2011, section 93.</p>
          </>
        )}
      </div>
    </div>
  );
}
