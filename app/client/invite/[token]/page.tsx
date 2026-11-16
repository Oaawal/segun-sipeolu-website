import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Field, Note, btn } from "@/components/portal/ui";
import { one } from "@/lib/portal/db";
import { sha256 } from "@/lib/portal/crypto";
import { acceptClientInvite } from "../../actions";

export const metadata = { title: "Set your password" };
export const dynamic = "force-dynamic";

export default async function ClientInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await one<{ full_name: string; email: string; client_name: string; purpose: string }>(
    `SELECT cu.full_name, cu.email, c.name AS client_name, t.purpose FROM client_tokens t JOIN client_users cu ON cu.id = t.client_user_id JOIN clients c ON c.id = cu.client_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND cu.active`, [sha256(token)]);
  if (!row) return <AuthCard title="Link expired" tagline="Client portal"><Note tone="warn">This link has expired or was already used. Ask the firm for a new one, or use &ldquo;Forgotten your password?&rdquo; on the sign-in page.</Note></AuthCard>;
  return (
    <AuthCard title={row.purpose === "reset" ? "Choose a new password" : `Welcome, ${row.full_name.split(" ")[0]}`} sub={<>Client portal for <strong>{row.client_name}</strong>, signing in as <strong>{row.email}</strong>.</>} tagline="Client portal">
      <ActionForm action={acceptClientInvite} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={row.email} autoComplete="username" />
        <Field label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 12 characters. A short sentence works well." autoFocus />
        <Field label="Confirm password" name="confirm" type="password" required autoComplete="new-password" />
        <SubmitButton className={`${btn.primary} w-full`} pending="Saving…">Save and continue</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-xs text-stone-500">Everything you see and send here is confidential between you and the firm, and every access is recorded.</p>
    </AuthCard>
  );
}
