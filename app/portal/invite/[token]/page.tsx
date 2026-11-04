import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Field, Note, btn } from "@/components/portal/ui";
import { acceptInviteAction } from "../../auth-actions";
import { one } from "@/lib/portal/db";
import { sha256 } from "@/lib/portal/crypto";
import { ROLES, type Role } from "@/lib/portal/permissions";

export const metadata = { title: "Set your password" };
export const dynamic = "force-dynamic";

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await one<{ full_name: string; email: string; role: Role; purpose: string }>(
    `SELECT u.full_name, u.email, u.role, t.purpose FROM user_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.active`,
    [sha256(token)],
  );
  if (!row) {
    return <AuthCard title="Link expired"><Note tone="warn">This link has expired or was already used. Ask the Managing Partner for a new one.</Note></AuthCard>;
  }
  return (
    <AuthCard title={row.purpose === "reset" ? "Choose a new password" : `Welcome, ${row.full_name.split(" ")[0]}`} sub={<>You are joining as <strong>{ROLES[row.role].label}</strong> with <strong>{row.email}</strong>.</>}>
      <ActionForm action={acceptInviteAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={row.email} autoComplete="username" />
        <Field label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 12 characters. A short sentence works well." autoFocus />
        <Field label="Confirm password" name="confirm" type="password" required autoComplete="new-password" />
        <SubmitButton className={`${btn.primary} w-full`} pending="Saving…">Save and continue</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
