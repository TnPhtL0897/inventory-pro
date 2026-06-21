/**
 * Database connection (Drizzle + postgres.js)
 *
 * CF Workers có I/O isolation: mỗi request handler có context riêng.
 * Singleton connection (shared across requests) bị LEAK giữa contexts.
 *
 * Fix: mỗi request tạo connection mới + close sau khi xong.
 * Dùng withDb() wrapper để auto-cleanup.
 *
 * Trade-off: tạo connection mỗi request (~50ms overhead) so với safety.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * Tạo Drizzle instance mới cho 1 request.
 * Caller PHẢI gọi `await client.end()` sau khi xong (hoặc dùng `withDb`).
 */
export function createDb(databaseUrl: string): {
  db: Db;
  client: ReturnType<typeof postgres>;
} {
  const client = postgres(databaseUrl, {
    max: 1, // 1 connection per request
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false, // disable prepared statements for CF Workers
  });
  const db = drizzle(client, { schema });
  return { db, client };
}

/**
 * Wrap async function: tạo db, chạy callback, cleanup sau.
 *
 * Usage:
 *   return withDb(c.env.DATABASE_URL, async (db) => {
 *     const rows = await db.select().from(products)...;
 *     return c.json({ data: rows });
 *   });
 */
export async function withDb<T>(
  databaseUrl: string,
  fn: (db: Db) => Promise<T>
): Promise<T> {
  const { db, client } = createDb(databaseUrl);
  try {
    return await fn(db);
  } finally {
    await client.end();
  }
}

export { schema };
