import "server-only";
import path from "node:path";
import { MIGRATIONS } from "./schema";

/**
 * One database interface for two engines:
 *  - DATABASE_URL set   → PostgreSQL through `pg` (production: any host)
 *  - DATABASE_URL unset → embedded PGlite (real Postgres compiled to WebAssembly)
 *    stored in PORTAL_DATA_DIR/db (default ./data/db), for development, demos
 *    and very small single-server installs.
 * Both speak the same SQL, so nothing else in the portal cares which is used.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export interface Queryable {
  query<T extends object = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface Engine extends Queryable {
  transaction<R>(fn: (tx: Queryable) => Promise<R>): Promise<R>;
  /** Run a script of several statements (migrations) atomically. */
  script(sql: string, after: string, afterParams: unknown[]): Promise<void>;
}

export function dataDir() {
  return process.env.PORTAL_DATA_DIR || path.join(process.cwd(), "data");
}

async function createEngine(): Promise<Engine> {
  if (process.env.DATABASE_URL) {
    const { Pool, types } = await import("pg");
    types.setTypeParser(1082, (v: string) => v); // DATE as "YYYY-MM-DD", never shifted by time zones
    types.setTypeParser(20, (v: string) => Number(v)); // COUNT(*) and BIGSERIAL as numbers
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE || 10),
      ssl: process.env.DATABASE_SSL === "false" ? undefined : process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL !== "no-verify" },
    });
    return {
      query: async (sql, params = []) => {
        const r = await pool.query(sql, params as unknown[]);
        return { rows: r.rows };
      },
      script: async (sql, after, afterParams) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(sql); // no parameters: pg sends it as one simple query
          await client.query(after, afterParams as unknown[]);
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const tx: Queryable = { query: async (s, p = []) => ({ rows: (await client.query(s, p as unknown[])).rows }) };
          const out = await fn(tx);
          await client.query("COMMIT");
          return out;
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      },
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const fs = await import("node:fs/promises");
  const dir = path.join(dataDir(), "db");
  await fs.mkdir(dir, { recursive: true });
  const pg = await PGlite.create(dir, { parsers: { 1082: (v: string) => v, 20: (v: string) => Number(v) } });
  // PGlite has a single connection: run statements one at a time
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <R>(job: () => Promise<R>): Promise<R> => {
    const next = chain.then(job, job);
    chain = next.catch(() => {});
    return next;
  };
  return {
    query: (sql, params = []) => serial(async () => ({ rows: (await pg.query(sql, params as unknown[])).rows as never[] })),
    transaction: (fn) => serial(() => pg.transaction(async (t) => fn({ query: async (s, p = []) => ({ rows: (await t.query(s, p as unknown[])).rows as never[] }) }))),
    script: (sql, after, afterParams) => serial(() => pg.transaction(async (t) => {
      await t.exec(sql);
      await t.query(after, afterParams as unknown[]);
    })),
  };
}

async function migrate(engine: Engine) {
  await engine.query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const done = new Set((await engine.query<{ id: string }>("SELECT id FROM schema_migrations")).rows.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await engine.script(m.sql, "INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    console.log(`[portal] applied migration ${m.id}`);
  }
}

const g = globalThis as unknown as { __portalDb?: Promise<Engine> };

function engine(): Promise<Engine> {
  if (!g.__portalDb) {
    g.__portalDb = (async () => {
      const e = await createEngine();
      await migrate(e);
      return e;
    })().catch((err) => {
      g.__portalDb = undefined;
      throw err;
    });
  }
  return g.__portalDb;
}

export async function q<T extends object = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await (await engine()).query<T>(sql, params)).rows;
}

export async function one<T extends object = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null;
}

export async function tx<R>(fn: (t: Queryable) => Promise<R>): Promise<R> {
  return (await engine()).transaction(fn);
}

export function dbEngineName() {
  return process.env.DATABASE_URL ? "PostgreSQL" : "Embedded PostgreSQL (PGlite)";
}

/** Next yearly number, e.g. nextNumber(t, "SSA/LIT") → "SSA/LIT/2026/0007". */
export async function nextNumber(t: Queryable, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const name = `${prefix}/${year}`;
  const { rows } = await t.query<{ value: number }>(
    "INSERT INTO counters (name, value) VALUES ($1, 1) ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value",
    [name],
  );
  return `${name}/${String(rows[0].value).padStart(4, "0")}`;
}
