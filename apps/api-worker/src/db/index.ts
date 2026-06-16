/**
 * Database connection (Drizzle + postgres.js)
 * Connection pool per Worker isolate
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb(databaseUrl: string) {
  if (!_db) {
    _client = postgres(databaseUrl, {
      max: 5, // CF Workers connection limit
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

export { schema };
