import Link from "next/link";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Field, btn } from "@/components/portal/ui";
import { clientForgot } from "../actions";

export const metadata = { title: "Reset password" };

export default function Forgot() {
  return (
    <AuthCard title="Reset your password" sub="Enter the email the firm invited you with." tagline="Client portal">
      <ActionForm action={clientForgot} className="space-y-4">
        <Field label="Email" name="email" type="email" required autoFocus />
        <SubmitButton className={`${btn.primary} w-full`} pending="Sending…">Send me a link</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-xs"><Link href="/client/login" className="font-semibold text-maroon">Back to sign in</Link></p>
    </AuthCard>
  );
}
