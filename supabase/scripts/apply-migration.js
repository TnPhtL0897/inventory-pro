// Apply a SQL migration file to Supabase via direct Postgres connection
// Usage:
//   export SUPABASE_DB_HOST=db.<ref>.supabase.co
//   export SUPABASE_DB_USER=postgres
//   export SUPABASE_DB_PASSWORD=<password>
//   export SUPABASE_DB_NAME=postgres
//   cd /tmp && NODE_PATH=/tmp/node_modules node /path/to/apply-migration.js <path-to-sql>
const { Client } = require('pg');
const fs = require('fs');

const HOST = process.env.SUPABASE_DB_HOST;
const PORT = parseInt(process.env.SUPABASE_DB_PORT || '5432', 10);
const USER = process.env.SUPABASE_DB_USER || 'postgres';
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const DATABASE = process.env.SUPABASE_DB_NAME || 'postgres';

if (!HOST || !PASSWORD) {
  console.error('ERROR: Set SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD env vars.');
  process.exit(1);
}

if (process.argv.length < 3) {
  console.error('Usage: node apply-migration.js <path-to-sql-file>');
  process.exit(1);
}

(async () => {
  const client = new Client({
    host: HOST, port: PORT, user: USER, password: PASSWORD, database: DATABASE,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  const sqlPath = process.argv[2];
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`Applying ${sqlPath} (${sql.length} bytes)...`);
  try {
    await client.query(sql);
    console.log('OK');
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exit(1);
  }
  await client.end();
})();
