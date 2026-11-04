import { ScanSearch } from "lucide-react";
import { requirePermission } from "@/lib/portal/auth";
import { conflictSearch } from "@/lib/portal/data";
import { audit } from "@/lib/portal/audit";
import { Card, Note, PageHeader, TextArea, btn } from "@/components/portal/ui";
import { ConflictResults } from "../matters/ConflictResults";

export const metadata = { title: "Conflict check" };

export default async function Conflicts({ searchParams }: { searchParams: Promise<{ names?: string }> }) {
  const u = await requirePermission("conflicts.check");
  const raw = String((await searchParams).names || "");
  const names = raw.split("\n").map((s) => s.trim()).filter((s) => s.length >= 2).slice(0, 20);
  const groups = names.length ? await Promise.all(names.map(async (n) => ({ query: n, hits: await conflictSearch(u, n) }))) : [];
  if (names.length) await audit({ userId: u.id, actor: u.email, action: "conflict.checked", detail: { names, hits: groups.reduce((n, g) => n + g.hits.length, 0) } });
  return (
    <>
      <PageHeader title="Conflict check" sub="Searches every client and every party on every matter, including walled-off matters, ignoring titles, word order and “Ltd/Plc”" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <form className="space-y-3">
            <TextArea label="Names to check" name="names" defaultValue={raw} rows={6} placeholder={"One per line, e.g.\nLagos Homes Ltd\nChief Tunde Adeyemi\nAdeola Bakare"} />
            <button className={btn.primary}><ScanSearch className="h-4 w-4" />Check</button>
          </form>
          <div className="mt-4"><Note tone="lock">Each check is recorded in the audit trail with the names searched, as evidence that conflicts were checked before the firm took instructions.</Note></div>
        </Card>
        <div>{groups.length ? <ConflictResults groups={groups} /> : <Note tone="info">Enter the prospective client and every other party, director or guarantor you know of.</Note>}</div>
      </div>
    </>
  );
}
