import Link from "next/link";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import type { ConflictHit } from "@/lib/portal/data";
import { PARTY_ROLES } from "@/lib/portal/vocab";
import { Badge } from "@/components/portal/ui";

export function ConflictResults({ groups }: { groups: { query: string; hits: ConflictHit[] }[] }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.query} className="rounded-xl border border-stone-200">
          <div className={`flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold ${g.hits.length ? "bg-amber-50 text-amber-900" : "bg-green/5 text-green"}`}>
            {g.hits.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            “{g.query}”: {g.hits.length ? `${g.hits.length} possible match${g.hits.length === 1 ? "" : "es"}` : "no matches"}
          </div>
          {g.hits.map((h, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-stone-100 px-4 py-2.5 text-sm">
              {h.restricted ? <Lock className="h-4 w-4 flex-none text-stone-400" /> : null}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-stone-800">{h.name} <span className="font-normal text-stone-500">· {PARTY_ROLES[h.role as keyof typeof PARTY_ROLES] || h.role}</span></div>
                <div className="text-xs text-stone-500">
                  {h.matter_number ? (h.matter_id ? <Link href={`/portal/matters/${h.matter_id}`} className="text-maroon hover:underline">{h.matter_number} · {h.matter_title}</Link> : <>{h.matter_number} · restricted matter: ask the responsible partner</>) : "Client record without matters"}
                </div>
              </div>
              <Badge tone={h.overlap >= 0.99 ? "red" : h.overlap >= 0.5 ? "amber" : "grey"}>{h.overlap >= 0.99 ? "Exact" : h.overlap >= 0.5 ? "Close" : "Partial"}</Badge>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
