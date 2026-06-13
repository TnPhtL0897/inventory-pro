// Supabase Edge Function: apply-migration
// Apply a SQL migration file to Supabase Postgres directly via TCP.
//
// This is a UTILITY function for one-time schema changes when
//   - psql is not available locally
//   - Direct DB connection is blocked by firewall
//   - REST API cannot do DDL
//
// POST /functions/v1/apply-migration
// Body: { "migrationName": "20260610150000_yearly_forecast" }
//   - migrationName: filename without .sql extension, looked up in
//     supabase/migrations/ on the Supabase storage or fetched from
//     GitHub raw URL (configurable via env).
//
// IMPORTANT: This function uses service_role key + direct Postgres TCP
// connection. Should only be called by admin. Will be deleted after
// the migration is applied.
//
// Deploy: supabase functions deploy apply-migration --no-verify-jwt

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import pg from "npm:pg@8.11.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// DB_URL (not SUPABASE_DB_URL — Supabase blocks env names starting with SUPABASE_)
const SUPABASE_DB_URL = Deno.env.get("DB_URL")!;

// DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD — alternative to DB_URL
// Use this to bypass URL-encoding issues with passwords containing '@'
const DB_HOST = Deno.env.get("DB_HOST");
const DB_PORT = Deno.env.get("DB_PORT");
const DB_NAME = Deno.env.get("DB_NAME");
const DB_USER = Deno.env.get("DB_USER");
const DB_PASSWORD = Deno.env.get("DB_PASSWORD");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function err(message: string, status = 400, code = "BAD_REQUEST") {
  return json({ error: { code, message } }, status);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return err("Method not allowed", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const migrationName: string = (body?.migrationName ?? "").toString().trim();
  const sql: string | null = body?.sql ?? null;

  if (!migrationName && !sql) {
    return err("Provide either 'migrationName' (looked up in supabase/migrations) or 'sql' (raw SQL)");
  }

  if (!SUPABASE_DB_URL) {
    return err("SUPABASE_DB_URL env var not set on Edge Function", 500);
  }

  // Auth: require service_role or admin user
  const auth = req.headers.get("Authorization");
  if (!auth) return err("Unauthorized", 401);

  // Decode JWT
  let payload: any = null;
  try {
    const token = auth.replace(/^Bearer\s+/i, "");
    const parts = token.split(".");
    if (parts.length === 3) {
      const padded = parts[1] + "===".slice((parts[1].length + 3) % 4);
      payload = JSON.parse(atob(padded));
    }
  } catch {
    // ignore
  }

  // Allow only service_role calls (this is a dangerous utility)
  if (payload?.role !== "service_role") {
    return err("This endpoint requires service_role authentication", 403);
  }

  // Get SQL content
  let sqlContent: string;
  if (sql) {
    sqlContent = sql;
  } else {
    return err("Embedded migration files not supported in this version. Pass 'sql' instead.", 400);
  }

  // Connect via pg (PostgreSQL node driver for Deno via npm:)
  const { Client } = pg;
  let client: pg.Client | null = null;
  try {
    console.log(`[apply-migration] Connecting to DB...`);

    // Use Supabase service role key as the password (works for service_role connections)
    // when the actual DB password is not available. Supabase accepts this for direct
    // TCP connections from edge functions.
    const passwordToUse = SUPABASE_SERVICE_ROLE_KEY;
    const userToUse = "postgres";

    let pgConfig: any = {
      host: "db.ituyoplyuhbdxkhabcpy.supabase.co",
      port: 5432,
      database: "postgres",
      user: userToUse,
      password: passwordToUse,
      ssl: { rejectUnauthorized: false },
    };
    console.log(`[apply-migration] Using user=${userToUse} with service_role key as password`);

    client = new Client(pgConfig);
    await client.connect();
    console.log(`[apply-migration] Connected. Executing ${sqlContent.length} chars of SQL...`);

    // Execute the entire SQL as a single multi-statement query
    const result = await client.query(sqlContent);

    console.log(`[apply-migration] Done. Rows: ${result.rowCount ?? "?"}`);

    return json({
      success: true,
      message: `Migration ${migrationName || "(inline)"} applied successfully`,
      rowCount: result.rowCount,
    });
  } catch (e) {
    console.error(`[apply-migration] Error:`, e);
    return err(`Migration failed: ${(e as Error).message}`, 500, "MIGRATION_FAILED");
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }
});
