import "server-only";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
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
  /** Apply one migration atomically, unless another instance already has. Returns true if applied here. */
  migration(id: string, sql: string): Promise<boolean>;
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
      // Serverless instances each hold a pool: keep them small (use Neon's pooled address)
      max: Number(process.env.DATABASE_POOL_SIZE || (process.env.VERCEL ? 3 : 10)),
      ssl: process.env.DATABASE_SSL === "false" ? undefined : process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL !== "no-verify" },
    });
    return {
      query: async (sql, params = []) => {
        const r = await pool.query(sql, params as unknown[]);
        return { rows: r.rows };
      },
      migration: async (id, sql) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          // Several server instances may start at once (e.g. on Vercel): only one migrates, the others wait, then skip
          await client.query("SELECT pg_advisory_xact_lock(7270001)");
          if ((await client.query("SELECT 1 FROM schema_migrations WHERE id = $1", [id])).rows.length) {
            await client.query("COMMIT");
            return false;
          }
          await client.query(sql); // no parameters: pg sends it as one simple query
          await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
          await client.query("COMMIT");
          return true;
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

  if (process.env.VERCEL) {
    throw new Error("On Vercel, set DATABASE_URL to a PostgreSQL database (e.g. Neon from the Vercel Marketplace): Vercel has no permanent disk for the built-in database.");
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
    migration: (id, sql) => serial(() => pg.transaction(async (t) => {
      if ((await t.query("SELECT 1 FROM schema_migrations WHERE id = $1", [id])).rows.length) return false;
      await t.exec(sql);
      await t.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      return true;
    })),
  };
}

async function migrate(engine: Engine) {
  await engine.query("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const done = new Set((await engine.query<{ id: string }>("SELECT id FROM schema_migrations")).rows.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    if (await engine.migration(m.id, m.sql)) console.log(`[portal] applied migration ${m.id}`);
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

// The transaction in progress, if any. Queries made while a transaction is open
// (including from helpers that know nothing about it) run inside it, so they
// see its changes and can never wait on it (the embedded database has a single
// connection, so a query outside the open transaction would wait for ever).
const currentTx = new AsyncLocalStorage<Queryable>();

export async function q<T extends object = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const t = currentTx.getStore();
  if (t) return (await t.query<T>(sql, params)).rows;
  return (await (await engine()).query<T>(sql, params)).rows;
}

export async function one<T extends object = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null;
}

export async function tx<R>(fn: (t: Queryable) => Promise<R>): Promise<R> {
  const open = currentTx.getStore();
  if (open) return fn(open); // already inside one: join it
  return (await engine()).transaction((t) => currentTx.run(t, () => fn(t)));
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
