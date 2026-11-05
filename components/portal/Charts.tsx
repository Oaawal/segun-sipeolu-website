/**
 * Plain, server-rendered bar charts. One series per chart, in the firm's
 * maroon, so no legend is needed (the card title names it). Values sit at the
 * bar tip in text colour; every bar has a hover label. A CSV export serves as
 * the table view.
 */
export function HBars({ rows, unit = "" }: { rows: { label: string; value: number; href?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-stone-400">No data yet.</p>;
  return (
    <ul className="space-y-2.5" role="list">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3 text-sm" title={`${r.label}: ${r.value}${unit}`}>
          <span className="truncate text-stone-700">{r.href ? <a href={r.href} className="hover:text-maroon">{r.label}</a> : r.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-4 rounded-r bg-maroon transition-[filter] hover:brightness-125" style={{ width: r.value ? `${Math.max(2, (r.value / max) * 85)}%` : 0 }} aria-hidden />
            <span className="text-xs font-semibold tabular-nums text-stone-700">{r.value}{unit}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Columns({ rows, highlightLast = true }: { rows: { label: string; value: number }[]; highlightLast?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 border-b border-stone-200" role="img" aria-label={rows.map((r) => `${r.label}: ${r.value}`).join(", ")}>
        {rows.map((r, i) => (
          <div key={r.label} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${r.label}: ${r.value}`}>
            <span className={`mb-1 text-[11px] font-semibold tabular-nums text-stone-600 ${r.value === max || (highlightLast && i === rows.length - 1) ? "" : "opacity-0 group-hover:opacity-100"}`}>{r.value}</span>
            <span className="w-full max-w-6 rounded-t bg-maroon transition-[filter] group-hover:brightness-125" style={{ height: `${(r.value / max) * 85}%`, minHeight: r.value ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">{rows.map((r) => <span key={r.label} className="flex-1 text-center text-[10px] text-stone-500">{r.label}</span>)}</div>
    </div>
  );
}
