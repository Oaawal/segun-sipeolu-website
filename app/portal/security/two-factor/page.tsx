import { redirect } from "next/navigation";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Note, btn, inputCls } from "@/components/portal/ui";
import { confirmTwoFactorAction, logoutAction } from "../../auth-actions";
import { currentUser, mfaRequired } from "@/lib/portal/auth";
import { pendingTwoFactor } from "@/lib/portal/twofactor";

export const metadata = { title: "Two-factor sign-in" };
export const dynamic = "force-dynamic";

export default async function TwoFactor({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const u = await currentUser();
  if (!u) redirect("/portal/login");
  if (u.totp_enabled) redirect(u.mfa_passed ? "/portal/account" : "/portal/login/verify");
  const setup = await pendingTwoFactor(u.id, u.email);
  if (!setup) redirect("/portal");
  const { required } = await searchParams;
  const grouped = setup.secret.match(/.{1,4}/g)!.join(" ");
  return (
    <AuthCard title="Protect your account" sub="Two-factor sign-in means a stolen password alone cannot open client files.">
      {required && mfaRequired(u.role) && <div className="mb-4"><Note tone="lock">Your role needs two-factor sign-in before you can continue.</Note></div>}
      <ol className="space-y-4 text-sm text-stone-700">
        <li><strong>1.</strong> Install an authenticator app on your phone: Google Authenticator, Microsoft Authenticator or 1Password.</li>
        <li>
          <strong>2.</strong> In the app, add an account and scan this code:
          <div className="mx-auto mt-3 w-48 rounded-xl border border-stone-200 p-2" dangerouslySetInnerHTML={{ __html: setup.svg }} />
          <div className="mt-2 text-center text-xs text-stone-500">Can&apos;t scan? Enter this key: <code className="font-mono text-stone-800">{grouped}</code></div>
        </li>
        <li><strong>3.</strong> Enter the 6-digit code the app shows:</li>
      </ol>
      <ActionForm action={confirmTwoFactorAction} className="mt-3 space-y-4">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required aria-label="6-digit code" className={`${inputCls} text-center text-2xl font-semibold tracking-[0.5em]`} />
        <SubmitButton className={`${btn.primary} w-full`} pending="Checking…">Turn on two-factor</SubmitButton>
      </ActionForm>
      {!mfaRequired(u.role) && u.mfa_passed && <a href="/portal" className="mt-4 block text-center text-sm text-stone-500 hover:text-maroon">Not now</a>}
      <form action={logoutAction} className="mt-3 text-center"><button className="text-sm text-stone-500 hover:text-maroon">Sign out</button></form>
    </AuthCard>
  );
}
