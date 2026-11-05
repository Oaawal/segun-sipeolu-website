import { redirect } from "next/navigation";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Field, Note, btn } from "@/components/portal/ui";
import { loginAction } from "../auth-actions";
import { currentUser, hasUsers } from "@/lib/portal/auth";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ locked?: string; share?: string }> }) {
  if (!(await hasUsers())) redirect("/portal/setup");
  const u = await currentUser();
  if (u?.mfa_passed) redirect("/portal");
  const { locked, share } = await searchParams;
  return (
    <AuthCard title="Sign in" sub="Use your firm email address and password.">
      {share && <div className="mb-4"><Note tone="info">Sign in, then share the file again. For your security, nothing is saved before you sign in.</Note></div>}
      {locked && <div className="mb-4"><Note tone="warn">Too many wrong codes. The account is locked for 15 minutes.</Note></div>}
      <ActionForm action={loginAction} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton className={`${btn.primary} w-full`} pending="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-xs text-stone-500">Forgotten your password? Ask the Managing Partner to send you a new sign-in link.</p>
    </AuthCard>
  );
}
