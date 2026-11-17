import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { q } from "@/lib/portal/db";
import { invitableRoles, ROLES } from "@/lib/portal/permissions";
import { CODE_DAYS } from "@/lib/portal/accounts";
import { fmtDateTime } from "@/lib/portal/format";
import { Badge, Card, Empty, Field, Flash, Note, PageHeader, Row, Select, btn } from "@/components/portal/ui";
import { CopyButton } from "@/components/portal/CopyButton";
import { createCode, revokeCode } from "./actions";

/** Where people reach the portal: PORTAL_URL if set, otherwise the address this page was opened on. */
async function portalOrigin() {
  if (process.env.PORTAL_URL) return process.env.PORTAL_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  return host ? `${h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")}://${host}` : "";
}

export const metadata = { title: "Invitation codes" };

export default async function Invitations({ searchParams }: { searchParams: Promise<{ msg?: string; new?: string }> }) {
  const u = await requireUser();
  const roles = invitableRoles(u);
  if (!roles.length) redirect("/portal?denied=1");
  const sp = await searchParams;
  const fresh = sp.new ? (await cookies()).get("ssa_new_code")?.value : undefined;
  const rows = await q<{ code_hash: string; hint: string; role: keyof typeof ROLES; note: string | null; created_at: string; expires_at: string; used_at: string | null; revoked_at: string | null; used_by_name: string | null; creator: string }>(
    `SELECT c.code_hash, c.hint, c.role, c.note, c.created_at, c.expires_at, c.used_at, c.revoked_at, ub.full_name AS used_by_name, cb.full_name AS creator
     FROM invite_codes c LEFT JOIN users ub ON ub.id = c.used_by JOIN users cb ON cb.id = c.created_by
     ${u.role === "admin" ? "" : "WHERE c.created_by = $1"} ORDER BY c.created_at DESC LIMIT 100`, u.role === "admin" ? [] : [u.id]);
  const signupUrl = `${await portalOrigin()}/portal/signup`;
  const inviteLink = fresh ? `${signupUrl}?code=${encodeURIComponent(fresh)}` : "";
  return (
    <>
      <PageHeader title="Invitation codes" sub={`Give a new colleague a code to create their own account. Each code works once, for one role, for ${CODE_DAYS} days.`} />
      <Flash msg={sp.msg} />
      {fresh && (
        <div className="mb-6 rounded-2xl border-2 border-gold bg-gold/10 p-5">
          <div className="font-semibold text-maroon-dark">New invitation code</div>
          <p className="mt-1 text-sm text-stone-700">Send the link below to the person privately (for example on WhatsApp). It opens the account form with the code filled in; once they finish, they are signed in. It works once, and is shown only now.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3"><code className="select-all break-all rounded-lg bg-white px-4 py-2.5 font-mono text-sm text-maroon-dark">{inviteLink}</code><CopyButton text={inviteLink} /></div>
          <p className="mt-3 text-xs text-stone-600">Or they go to {signupUrl} and type the code: <code className="select-all font-mono font-semibold tracking-wider text-maroon-dark">{fresh}</code> <CopyButton text={fresh} /></p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card title={u.role === "admin" ? "All codes" : "Codes you have made"} pad={false}>
          {rows.length === 0 ? <Empty icon={<KeyRound className="h-8 w-8" />} title="No codes yet" /> : rows.map((c) => {
            const state = c.used_at ? ["Used", "green"] : c.revoked_at ? ["Withdrawn", "grey"] : new Date(c.expires_at) < new Date() ? ["Expired", "grey"] : ["Waiting", "amber"];
            return (
              <Row key={c.code_hash}>
                <code className="font-mono text-sm text-stone-500">…{c.hint}</code>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{ROLES[c.role].label}{c.note ? <span className="font-normal text-stone-500"> · for {c.note}</span> : null}</div>
                  <div className="text-xs text-stone-500">Made {fmtDateTime(c.created_at)}{u.role === "admin" ? ` by ${c.creator}` : ""}{c.used_at ? ` · used by ${c.used_by_name} on ${fmtDateTime(c.used_at)}` : c.revoked_at ? "" : ` · expires ${fmtDateTime(c.expires_at)}`}</div>
                </div>
                <Badge tone={state[1] as "green" | "grey" | "amber"}>{state[0]}</Badge>
                {state[0] === "Waiting" && <form action={revokeCode}><input type="hidden" name="code" value={c.code_hash} /><button className={btn.small}>Withdraw</button></form>}
              </Row>
            );
          })}
        </Card>
        <div className="space-y-6">
          <Card title="Make a code">
            <form action={createCode} className="space-y-3">
              <Select label="Role" name="role" options={roles.map((r) => [r, ROLES[r].label])} />
              <Field label="For (optional)" name="note" placeholder="e.g. Tolu Bakare, new associate" />
              <button className={btn.primary}><KeyRound className="h-4 w-4" />Make invitation code</button>
            </form>
          </Card>
          <Note tone="lock">You can only invite into roles with no more access than your own; partners and Managing Partners are invited only by the Managing Partner. Two-factor sign-in is optional for new accounts for now; remind people to turn it on under Account. Without a code, people can still create an account, but it waits for the Managing Partner&apos;s approval.</Note>
        </div>
      </div>
    </>
  );
}
