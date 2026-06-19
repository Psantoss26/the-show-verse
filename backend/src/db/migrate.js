// src/db/migrate.js
// Ejecuta las migraciones en la base de datos

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { migrationClient } from './client.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync } from 'fs';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = process.env.MIGRATIONS_FOLDER || join(__dirname, '../../drizzle');

function hasMigrationFiles(folder) {
  if (!existsSync(folder)) return false;

  return readdirSync(folder, { withFileTypes: true }).some((entry) => {
    return entry.isFile() && entry.name.endsWith('.sql');
  });
}

async function hasAppliedMigrations() {
  const [tableResult] = await migrationClient`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'drizzle'
        AND table_name = '__drizzle_migrations'
    ) AS exists
  `;

  if (!tableResult?.exists) return false;

  const [countResult] = await migrationClient`
    SELECT COUNT(*)::int AS count
    FROM drizzle.__drizzle_migrations
  `;

  return Number(countResult?.count || 0) > 0;
}

async function runMigrations() {
  console.log('🔄 Running database migrations...');

  if (!hasMigrationFiles(migrationsFolder)) {
    if (await hasAppliedMigrations()) {
      console.warn(`⚠️ No bundled migration files found at ${migrationsFolder}. Database already has applied migrations; continuing.`);
      await migrationClient.end();
      process.exit(0);
    }

    throw new Error(`No migration files found at ${migrationsFolder} and the database has no applied migrations.`);
  }

  const db = drizzle(migrationClient);

  await migrate(db, {
    migrationsFolder,
  });

  console.log('✅ Migrations completed successfully');
  await migrationClient.end();
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
