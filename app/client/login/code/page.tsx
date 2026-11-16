import { redirect } from "next/navigation";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Field, Note, btn } from "@/components/portal/ui";
import { currentClient } from "@/lib/portal/client-auth";
import { resendClientCode, verifyClientCode } from "../../actions";

export const metadata = { title: "Sign-in code" };
export const dynamic = "force-dynamic";

export default async function ClientCode({ searchParams }: { searchParams: Promise<{ resent?: string }> }) {
  const c = await currentClient();
  if (!c) redirect("/client/login");
  if (c.mfa_passed) redirect("/client");
  const { resent } = await searchParams;
  return (
    <AuthCard title="Check your email" sub={<>We sent a 6-digit code to <strong>{c.email}</strong>.</>} tagline="Client portal">
      {resent && <div className="mb-4"><Note tone="ok">A new code is on its way.</Note></div>}
      <ActionForm action={verifyClientCode} className="space-y-4">
        <Field label="Code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus />
        <SubmitButton className={`${btn.primary} w-full`} pending="Checking…">Continue</SubmitButton>
      </ActionForm>
      <form action={resendClientCode} className="mt-4"><button className="text-xs font-semibold text-maroon">Send a new code</button></form>
    </AuthCard>
  );
}
