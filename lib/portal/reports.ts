import "server-only";
import { one, q } from "./db";
import { matterAccessSql, type Actor } from "./permissions";

/** Figures for the partners' reports. Only matters the reader may open are counted. */
export async function reportData(u: Actor) {
  const acc = matterAccessSql(u);
  const [kpi, monthly, byLawyer, byArea, outcomes, overdueByPerson, filings] = await Promise.all([
    one<Record<string, number>>(`SELECT
      (SELECT COUNT(*) FROM matters m WHERE m.status != 'closed' AND ${acc}) AS open_matters,
      (SELECT COUNT(*) FROM matters m WHERE m.opened_on >= date_trunc('month', CURRENT_DATE) AND ${acc}) AS new_this_month,
      (SELECT COUNT(*) FROM matters m WHERE m.opened_on >= date_trunc('month', CURRENT_DATE) - interval '1 month' AND m.opened_on < date_trunc('month', CURRENT_DATE) AND ${acc}) AS new_last_month,
      (SELECT COUNT(*) FROM hearings h JOIN matters m ON m.id = h.matter_id WHERE h.status = 'scheduled' AND h.sitting_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 AND ${acc}) AS sittings_30,
      (SELECT COUNT(*) FROM hearings h JOIN matters m ON m.id = h.matter_id WHERE h.status = 'scheduled' AND h.sitting_on < CURRENT_DATE AND ${acc}) AS results_missing,
      (SELECT COUNT(*) FROM tasks t LEFT JOIN matters m ON m.id = t.matter_id WHERE t.status = 'open' AND t.due_on < CURRENT_DATE AND (t.matter_id IS NULL OR ${acc})) AS overdue_tasks,
      (SELECT COUNT(*) FROM service_register s LEFT JOIN matters m ON m.id = s.matter_id WHERE s.status = 'open' AND s.response_due < CURRENT_DATE AND (s.matter_id IS NULL OR ${acc})) AS overdue_responses,
      (SELECT COUNT(*) FROM entity_filings f WHERE f.status = 'due' AND f.due_on < CURRENT_DATE) AS overdue_filings,
      (SELECT COUNT(*) FROM entity_filings f WHERE f.status = 'due' AND f.due_on BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS filings_30`, [u.id]),
    q<{ month: string; n: number }>(`SELECT to_char(g.m, 'YYYY-MM') AS month,
        (SELECT COUNT(*) FROM matters m WHERE date_trunc('month', m.opened_on) = g.m AND ${acc}) AS n
      FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '11 months', date_trunc('month', CURRENT_DATE), interval '1 month') AS g(m) ORDER BY g.m`, [u.id]),
    q<{ id: string; full_name: string; n: number; overdue: number }>(`SELECT u.id, u.full_name,
        (SELECT COUNT(*) FROM matter_members mm JOIN matters m ON m.id = mm.matter_id WHERE mm.user_id = u.id AND mm.role = 'lead' AND m.status != 'closed' AND ${acc}) AS n,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.status = 'open' AND t.due_on < CURRENT_DATE) AS overdue
      FROM users u WHERE u.active AND u.role != 'front_desk' ORDER BY n DESC, u.full_name`, [u.id]),
    q<{ practice_area: string; n: number }>(`SELECT m.practice_area, COUNT(*) AS n FROM matters m WHERE m.status != 'closed' AND ${acc} GROUP BY m.practice_area ORDER BY n DESC`, [u.id]),
    q<{ status: string; n: number }>(`SELECT h.status, COUNT(*) AS n FROM hearings h JOIN matters m ON m.id = h.matter_id
      WHERE h.sitting_on BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE AND h.status != 'scheduled' AND ${acc} GROUP BY h.status`, [u.id]),
    q<{ full_name: string; tasks: number; responses: number }>(`SELECT * FROM (SELECT u.full_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.status = 'open' AND t.due_on < CURRENT_DATE) AS tasks,
        (SELECT COUNT(*) FROM service_register s WHERE s.handled_by = u.id AND s.status = 'open' AND s.response_due < CURRENT_DATE) AS responses
      FROM users u WHERE u.active) x ORDER BY x.tasks + x.responses DESC, x.full_name`),
    q<{ id: string; entity_id: string; name: string; title: string; due_on: string; responsible: string | null }>(`SELECT f.id, f.entity_id, e.name, f.title, f.due_on, u.full_name AS responsible
      FROM entity_filings f JOIN entities e ON e.id = f.entity_id LEFT JOIN users u ON u.id = f.responsible
      WHERE f.status = 'due' AND f.due_on <= CURRENT_DATE + 30 ORDER BY f.due_on LIMIT 20`),
  ]);
  return { kpi: kpi || {}, monthly, byLawyer, byArea, outcomes, overdueByPerson: overdueByPerson.filter((r) => r.tasks + r.responses > 0), filings };
}
