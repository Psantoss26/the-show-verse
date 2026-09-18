import { defineConfig } from 'drizzle-kit';
import './src/config/load-env.js';

export default defineConfig({
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
