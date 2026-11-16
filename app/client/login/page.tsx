import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Field, btn } from "@/components/portal/ui";
import { currentClient } from "@/lib/portal/client-auth";
import { clientLogin } from "../actions";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function ClientLogin() {
  const c = await currentClient();
  if (c?.mfa_passed) redirect("/client");
  return (
    <AuthCard title="Client sign in" sub="See your matters, documents, invoices and messages with your lawyers." tagline="Client portal">
      <ActionForm action={clientLogin} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton className={`${btn.primary} w-full`} pending="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-xs text-stone-500"><Link href="/client/forgot" className="font-semibold text-maroon">Forgotten your password?</Link> · Access is by invitation from the firm.</p>
    </AuthCard>
  );
}
