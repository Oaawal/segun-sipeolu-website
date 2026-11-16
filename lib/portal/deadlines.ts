import "server-only";
import { q } from "./db";
import { addDays } from "./format";

/**
 * Deadline arithmetic. The day of the event is not counted. In "calendar"
 * mode every day counts, and a period ending on a Saturday, Sunday or public
 * holiday runs to the next working day. In "working" mode only working days
 * count. The rule of court that applies always governs: each rule must be
 * confirmed by a lawyer before the portal will use it.
 */

const isWeekend = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

export async function holidaySet(from: string, to: string) {
  const rows = await q<{ day: string; name: string }>("SELECT day::text AS day, name FROM holidays WHERE day BETWEEN $1 AND $2", [from, to]);
  return new Map(rows.map((r) => [r.day.slice(0, 10), r.name]));
}

export async function computeDeadline(start: string, days: number, mode: "calendar" | "working") {
  const holidays = await holidaySet(start, addDays(start, days * 2 + 60));
  const skipped: string[] = [];
  const off = (d: string) => isWeekend(d) || holidays.has(d);
  let d = start;
  if (mode === "working") {
    let n = 0;
    while (n < days) {
      d = addDays(d, 1);
      if (off(d)) { if (holidays.has(d)) skipped.push(`${d} (${holidays.get(d)})`); continue; }
      n++;
    }
  } else {
    d = addDays(start, days);
    while (off(d)) {
      skipped.push(`${d} (${holidays.get(d) || (new Date(`${d}T12:00:00Z`).getUTCDay() === 0 ? "Sunday" : "Saturday")})`);
      d = addDays(d, 1);
    }
  }
  return { due: d, skipped };
}

/** Easter Sunday (Gregorian), for Good Friday and Easter Monday. */
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Nigeria's public holidays with fixed or calculable dates. Eid and Mawlid
 * dates depend on the moon and are declared by the Federal Government each
 * year: add them by hand when announced, with any extra days declared.
 */
export function fixedHolidays(year: number): { day: string; name: string }[] {
  const e = easter(year);
  return [
    { day: `${year}-01-01`, name: "New Year's Day" },
    { day: addDays(e, -2), name: "Good Friday" },
    { day: addDays(e, 1), name: "Easter Monday" },
    { day: `${year}-05-01`, name: "Workers' Day" },
    { day: `${year}-06-12`, name: "Democracy Day" },
    { day: `${year}-10-01`, name: "Independence Day" },
    { day: `${year}-12-25`, name: "Christmas Day" },
    { day: `${year}-12-26`, name: "Boxing Day" },
  ];
}
