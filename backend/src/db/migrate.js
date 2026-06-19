// src/db/migrate.js
// Ejecuta las migraciones en la base de datos

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { migrationClient } from './client.js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  console.log('🔄 Running database migrations...');

  const db = drizzle(migrationClient);

  await migrate(db, {
    migrationsFolder: join(__dirname, '../../drizzle'),
  });

  console.log('✅ Migrations completed successfully');
  await migrationClient.end();
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
