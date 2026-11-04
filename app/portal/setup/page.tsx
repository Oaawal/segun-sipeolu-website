import { redirect } from "next/navigation";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Field, Note, btn } from "@/components/portal/ui";
import { setupAction } from "../auth-actions";
import { hasUsers } from "@/lib/portal/auth";

export const metadata = { title: "Set up the portal" };
export const dynamic = "force-dynamic";

export default async function Setup() {
  if (await hasUsers()) redirect("/portal/login");
  const prod = process.env.NODE_ENV === "production";
  return (
    <AuthCard title="Set up the portal" sub="Create the first account. It becomes the Managing Partner / administrator, who then invites everyone else.">
      <ActionForm action={setupAction} className="space-y-4">
        {prod && <Field label="Setup code" name="setup_token" required hint="The PORTAL_SETUP_TOKEN value set on the server. Stops anyone else claiming the portal first." autoComplete="off" />}
        <Field label="Full name" name="full_name" required autoComplete="name" />
        <Field label="Job title" name="title" defaultValue="Managing Partner" />
        <Field label="Email" name="email" type="email" required autoComplete="username" />
        <Field label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 12 characters. A short sentence is easy to remember and hard to guess." />
        <Field label="Confirm password" name="confirm" type="password" required autoComplete="new-password" />
        <Note tone="lock">Next you will set up two-factor sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator or similar).</Note>
        <SubmitButton className={`${btn.primary} w-full`} pending="Creating…">Create account</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
