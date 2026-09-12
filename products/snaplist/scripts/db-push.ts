/** Applies db/schema.sql. Idempotent, so it is safe to re-run on production. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Put it in .env.local first.');
    process.exit(1);
  }

  const sql = await readFile(join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  const client = new Client({
    connectionString: url,
    ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log('schema applied');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
