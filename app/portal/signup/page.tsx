import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/portal/AuthCard";
import { ActionForm, SubmitButton } from "@/components/portal/ActionForm";
import { Field, Note, Select, TextArea, btn } from "@/components/portal/ui";
import { currentUser, hasUsers } from "@/lib/portal/auth";
import { signupAction } from "../auth-actions";

export const metadata = { title: "Create an account" };
export const dynamic = "force-dynamic";

export default async function Signup({ searchParams }: { searchParams: Promise<{ sent?: string; code?: string }> }) {
  if (!(await hasUsers())) redirect("/portal/setup");
  if ((await currentUser())?.mfa_passed) redirect("/portal");
  const sp = await searchParams;
  if (sp.sent) {
    return (
      <AuthCard title="Request sent" footer="Nothing is opened to you until your account is approved">
        <Note tone="ok">Your account has been created and is waiting for approval by the Managing Partner, who will also decide your access. You can sign in once it is approved.</Note>
        <p className="mt-5 text-sm"><Link href="/portal/login" className="font-semibold text-maroon">Back to sign in</Link></p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Create your account" sub="For staff of Segun Sipeolu & Associates.">
      <ActionForm action={signupAction} className="space-y-4">
        <Field label="Invitation code (if you have one)" name="code" defaultValue={sp.code || ""} autoComplete="off" placeholder="SSA-XXXX-XXXX-XXXX" hint="From the Managing Partner, a partner, Senior Counsel or the Head of Litigation. Without one, your account waits for approval." className="[&_input]:font-mono [&_input]:uppercase" />
        <Field label="Full name" name="full_name" required autoComplete="name" />
        <Field label="Work email" name="email" type="email" required autoComplete="username" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title" name="title" placeholder="e.g. Associate" />
          <Field label="Mobile" name="phone" type="tel" autoComplete="tel" />
        </div>
        <Select label="Your position (if you have no code)" name="requested_role" options={{ lawyer: "Lawyer / associate", litigation: "Litigation team", front_desk: "Front desk", partner: "Partner" }} defaultValue="lawyer" />
        <TextArea label="Note for the Managing Partner (optional)" name="note" rows={2} placeholder="e.g. Joined the litigation team on 3 November" />
        <Field label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 12 characters. A short sentence works well." />
        <Field label="Confirm password" name="confirm" type="password" required autoComplete="new-password" />
        <SubmitButton className={`${btn.primary} w-full`} pending="Creating…">Create account</SubmitButton>
      </ActionForm>
      <p className="mt-5 text-xs text-stone-500">Already have an account? <Link href="/portal/login" className="font-semibold text-maroon">Sign in</Link></p>
    </AuthCard>
  );
}
