import Link from "next/link";
import { Users } from "lucide-react";
import { requireUser } from "@/lib/portal/auth";
import { dmChannel, FIRM, firmUnread, markRead, messages, openChannel, people } from "@/lib/portal/chat";
import { Card, PageHeader } from "@/components/portal/ui";
import { ChatRoom } from "./ChatRoom";

export const metadata = { title: "Chat" };

export default async function Chat({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const list = await people(u.id);
  const other = sp.with ? list.find((p) => p.id === sp.with) : undefined;
  const channel = (other && (await openChannel(u.id, dmChannel(u.id, other.id)))) || FIRM;
  const initial = await messages(channel);
  if (initial.length) await markRead(u.id, channel, initial[initial.length - 1].id);
  const firmNew = channel === FIRM ? 0 : await firmUnread(u.id);
  const item = (active: boolean) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-maroon text-white" : "text-stone-700 hover:bg-cream"}`;
  const dot = (n: number) => n > 0 && <span className="ml-auto rounded-full bg-gold px-1.5 py-px text-[11px] font-bold text-maroon-dark">{n}</span>;

  return (
    <>
      <PageHeader title="Chat" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card pad={false} className="h-fit">
          <nav className="max-h-[70vh] space-y-0.5 overflow-y-auto p-2">
            <Link href="/portal/chat" className={item(channel === FIRM)}><Users className="h-4 w-4" />Everyone{dot(firmNew)}</Link>
            {list.map((p) => (
              <Link key={p.id} href={`/portal/chat?with=${p.id}`} className={item(other?.id === p.id)}>
                <span className="min-w-0 truncate">{p.full_name}</span>{other?.id === p.id ? null : dot(p.unread)}
              </Link>
            ))}
          </nav>
        </Card>
        <ChatRoom key={channel} channel={channel} me={u.id} title={other ? other.full_name : "Everyone at the firm"} initial={initial} />
      </div>
    </>
  );
}
