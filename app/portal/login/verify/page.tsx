import { redirect } from "next/navigation";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { btn, inputCls } from "@/components/portal/ui";
import { logoutAction, verifyCodeAction } from "../../auth-actions";
import { currentUser } from "@/lib/portal/auth";

export const metadata = { title: "Two-factor code" };
export const dynamic = "force-dynamic";

export default async function Verify() {
  const u = await currentUser();
  if (!u) redirect("/portal/login");
  if (u.mfa_passed) redirect("/portal");
  if (!u.totp_enabled) redirect("/portal/security/two-factor?required=1");
  return (
    <AuthCard title="Enter your code" sub={<>Open your authenticator app and enter the 6-digit code for <strong>{u.email}</strong>.</>}>
      <ActionForm action={verifyCodeAction} className="space-y-4">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus aria-label="6-digit code" className={`${inputCls} text-center text-2xl font-semibold tracking-[0.5em]`} />
        <SubmitButton className={`${btn.primary} w-full`} pending="Checking…">Continue</SubmitButton>
      </ActionForm>
      <form action={logoutAction} className="mt-4 text-center"><button className="text-sm text-stone-500 hover:text-maroon">Use a different account</button></form>
    </AuthCard>
  );
}
