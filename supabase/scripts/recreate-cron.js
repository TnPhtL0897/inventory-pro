// Re-create pg_cron job (uses Supabase SQL API, not direct DB)
// Usage:
//   export SUPABASE_MGMT_TOKEN=sbp_xxx
//   export SUPABASE_SERVICE_ROLE_KEY=eyJxxx
//   node recreate-cron.js
const https = require('https');

const SQL_API = 'https://api.supabase.com/v1/projects/ituyoplyuhbdxkhabcpy/database/query';
const MGMT_TOKEN = process.env.SUPABASE_MGMT_TOKEN;
const TOKEN = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!MGMT_TOKEN || !TOKEN) {
  console.error('ERROR: Set SUPABASE_MGMT_TOKEN and SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const SQL = `SELECT cron.schedule('replenishment-month-end', '0 2 25 * *', $$ SELECT net.http_post( url := 'https://ituyoplyuhbdxkhabcpy.supabase.co/functions/v1/replenishment/run', headers := jsonb_build_object( 'Content-Type', 'application/json', 'Authorization', 'Bearer ${TOKEN}' ), body := jsonb_build_object( 'fiscalYear', extract(year from now())::int, 'fiscalMonth', extract(month from now())::int, 'triggeredBy', 'pg_cron' ) ) AS request_id; $$)`;

function callApi(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    const req = https.request(SQL_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  console.log('Re-creating cron job with hardcoded token...');
  const r = await callApi(SQL);
  console.log(`Status: ${r.status}`);
  console.log(`Body: ${r.body}`);
  if (r.status === 200) {
    const v = await callApi('SELECT jobid, jobname, schedule, active, database FROM cron.job');
    console.log(`\nCurrent jobs: ${v.body}`);
  }
})();
