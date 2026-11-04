import { requirePermission } from "@/lib/portal/auth";
import { Card, Flash, Note, PageHeader } from "@/components/portal/ui";
import { ClientForm } from "../ClientForm";

export const metadata = { title: "New client" };

export default async function NewClient({ searchParams }: { searchParams: Promise<{ msg?: string; next?: string }> }) {
  await requirePermission("clients.create");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="New client" back={{ href: "/portal/clients", label: "Clients" }} />
      <Flash msg={sp.msg} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card><ClientForm next={sp.next === "matter" ? "matter" : undefined} /></Card>
        <Note tone="lock">Client details are confidential. Only the people who need them can see them, and every view is recorded in the audit trail.</Note>
      </div>
    </>
  );
}
