// Dump Postgres schema to SQL file via raw queries
// Usage:
//   export SUPABASE_DB_HOST=db.<ref>.supabase.co
//   export SUPABASE_DB_USER=postgres
//   export SUPABASE_DB_PASSWORD=<password>
//   export SUPABASE_DB_NAME=postgres
//   cd /tmp && NODE_PATH=/tmp/node_modules node /path/to/dump-schema.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const HOST = process.env.SUPABASE_DB_HOST;
const PORT = parseInt(process.env.SUPABASE_DB_PORT || '5432', 10);
const USER = process.env.SUPABASE_DB_USER || 'postgres';
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const DATABASE = process.env.SUPABASE_DB_NAME || 'postgres';

if (!HOST || !PASSWORD) {
  console.error('ERROR: Set SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD env vars.');
  console.error('See header comment for required vars.');
  process.exit(1);
}

// Supabase requires SSL
const client = new Client({
  host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

async function query(sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows;
}

async function main() {
  await client.connect();
  console.log('Connected');

  // 1. List all tables in public schema (exclude views for now)
  const tables = await query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  console.log(`Tables: ${tables.length}`);

  // 2. List all views
  const views = await query(`
    SELECT viewname, definition FROM pg_views
    WHERE schemaname = 'public'
    ORDER BY viewname
  `);
  console.log(`Views: ${views.length}`);

  // 3. List RLS policies (Supabase uses pg_policies)
  const policies = await query(`
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);
  console.log(`RLS policies: ${policies.length}`);

  // 4. RLS enabled status per table
  const rlsStatus = await query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);

  // 5. Columns per table
  const columns = await query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  console.log(`Columns: ${columns.length}`);

  // 6. Functions in public schema
  const funcs = await query(`
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  `);
  console.log(`Functions: ${funcs.length}`);

  // 7. Triggers
  const triggers = await query(`
    SELECT event_object_table as tablename, trigger_name, event_manipulation, action_timing, action_statement
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name
  `);
  console.log(`Triggers: ${triggers.length}`);

  // 8. Indexes
  const indexes = await query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  console.log(`Indexes: ${indexes.length}`);

  // 9. Foreign keys
  const fks = await query(`
    SELECT tc.table_name, tc.constraint_name, kcu.column_name,
           ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name
  `);
  console.log(`Foreign keys: ${fks.length}`);

  // 10. Supabase auth schema (for users table)
  const authTables = await query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'auth' ORDER BY tablename
  `);
  console.log(`Auth tables: ${authTables.length}`);

  // Write JSON dump
  const out = {
    tables: tables.map(t => t.tablename),
    views: views.map(v => ({ name: v.viewname, definition: v.definition })),
    rlsStatus,
    policies,
    columns,
    functions: funcs,
    triggers,
    indexes,
    foreignKeys: fks,
    authTables: authTables.map(t => t.tablename),
  };

  const outFile = path.join(__dirname, '..', 'schema-dump.json');
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${outFile} (${fs.statSync(outFile).size} bytes)`);

  // Print summary table
  console.log('\n=== TABLE SUMMARY ===');
  for (const t of tables) {
    const rls = rlsStatus.find(r => r.tablename === t.tablename);
    const pCnt = policies.filter(p => p.tablename === t.tablename).length;
    const cCnt = columns.filter(c => c.table_name === t.tablename).length;
    const iCnt = indexes.filter(i => i.tablename === t.tablename).length;
    const tCnt = triggers.filter(t2 => t2.tablename === t.tablename).length;
    console.log(`  ${t.tablename.padEnd(30)} RLS=${rls.rowsecurity ? 'ON ' : 'off'}  policies=${String(pCnt).padStart(2)}  cols=${String(cCnt).padStart(2)}  idx=${String(iCnt).padStart(2)}  trg=${String(tCnt).padStart(2)}`);
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
