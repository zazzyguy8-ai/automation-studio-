/**
 * Applies supabase/migrations/0001_init.sql to the database in DATABASE_URL.
 * The migration is idempotent (create table if not exists), so re-running is safe.
 *
 *   npm run db:push
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local (Supabase → Project Settings → Database).');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });

  try {
    const sql = await readFile(join(process.cwd(), 'supabase/migrations/0001_init.sql'), 'utf8');
    await pool.query(sql);

    const { rows } = await pool.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' order by table_name`,
    );
    // Never print the connection string - it carries the password.
    console.log(`Applied 0001_init.sql. Tables now present: ${rows.map((r) => r.table_name).join(', ')}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
