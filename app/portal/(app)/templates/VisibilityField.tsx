"use client";

import { useState } from "react";

/** "Who can see it": everyone, or only the roles ticked (the Managing Partner always can). */
export function VisibilityField({ roles, current }: { roles: string[][]; current?: string[] | null }) {
  const [some, setSome] = useState(!!current?.length);
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold text-stone-700">Who can see it</legend>
      <div className="space-y-1.5 text-sm text-stone-700">
        <label className="flex items-center gap-2"><input type="radio" name="visibility" value="all" checked={!some} onChange={() => setSome(false)} className="accent-maroon" />Everyone in the firm</label>
        <label className="flex items-center gap-2"><input type="radio" name="visibility" value="some" checked={some} onChange={() => setSome(true)} className="accent-maroon" />Only:</label>
        {some && (
          <div className="grid grid-cols-2 gap-1.5 pl-6">
            {roles.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name="visible_role" value={k} defaultChecked={current ? current.includes(k) : k === "partner"} className="h-4 w-4 accent-maroon" />{l.split(" /")[0]}</label>)}
          </div>
        )}
      </div>
    </fieldset>
  );
}
