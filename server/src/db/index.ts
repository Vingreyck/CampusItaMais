import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { env } from '../env';
import * as schema from './schema';

export type DB = NodePgDatabase<typeof schema>;

// Atribuído em initDb(); os módulos que importam `db` enxergam o valor via live binding.
export let db: DB;

export async function initDb() {
  if (env.databaseUrl) {
    const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 });
    db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: env.migrationsDir });
    console.log('[db] PostgreSQL conectado e migrado');
    return;
  }

  // Desenvolvimento: Postgres embutido (PGlite), persistido em disco.
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const dir = path.join(env.dataDir, 'pglite');
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const local = drizzle(client, { schema });
  await migrate(local, { migrationsFolder: env.migrationsDir });
  db = local as unknown as DB;
  console.log(`[db] PGlite local em ${dir}`);
}
