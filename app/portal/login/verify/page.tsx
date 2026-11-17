import { redirect } from "next/navigation";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { btn, inputCls } from "@/components/portal/ui";
import { logoutAction, resendLoginCodeAction, verifyCodeAction } from "../../auth-actions";
import { currentUser, mfaRequired } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { emailCodesOn } from "@/lib/portal/login-code";

export const metadata = { title: "Sign-in code" };
export const dynamic = "force-dynamic";

export default async function Verify() {
  const u = await currentUser();
  if (!u) redirect("/portal/login");
  if (u.mfa_passed) redirect("/portal");
  const byEmail = !u.totp_enabled;
  if (byEmail && mfaRequired(u.role)) redirect("/portal/security/two-factor?required=1");
  if (byEmail && !emailCodesOn()) {
    // Email codes were switched off after this sign-in started: the password was enough
    await q("UPDATE sessions SET mfa_passed = TRUE WHERE token_hash = $1", [u.token_hash]);
    redirect("/portal");
  }
  return (
    <AuthCard
      title="Enter your code"
      sub={byEmail
        ? <>We have emailed a 6-digit code to <strong>{u.email}</strong>. It works for 10 minutes. (Set up an authenticator app under Account to use that instead.)</>
        : <>Open your authenticator app and enter the 6-digit code for <strong>{u.email}</strong>.</>}
    >
      <ActionForm action={verifyCodeAction} className="space-y-4">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus aria-label="6-digit code" className={`${inputCls} text-center text-2xl font-semibold tracking-[0.5em]`} />
        <SubmitButton className={`${btn.primary} w-full`} pending="Checking…">Continue</SubmitButton>
      </ActionForm>
      {byEmail && (
        <ActionForm action={resendLoginCodeAction} className="mt-4 text-center">
          <button className="text-sm font-semibold text-maroon hover:underline">Email me a new code</button>
        </ActionForm>
      )}
      <form action={logoutAction} className="mt-4 text-center"><button className="text-sm text-stone-500 hover:text-maroon">Use a different account</button></form>
    </AuthCard>
  );
}
