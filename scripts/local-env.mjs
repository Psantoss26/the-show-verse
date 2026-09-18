import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const databaseUrl = 'postgresql://tsv:tsv@127.0.0.1:5432/theshowverse?sslmode=disable';
export const webEnv = {
  BACKEND_API_BASE_URL: 'http://localhost:3001',
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001',
  NEXT_PUBLIC_BACKEND_URL: 'http://localhost:3001',
  APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/auth/google/callback',
  TRAKT_REDIRECT_URI: 'http://localhost:3000/api/trakt/auth/callback',
  SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:3000/api/spotify/callback',
  SHOWVERSE_PRIVATE_ACCESS_KEY: '',
};
export const backendEnv = {
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: '3001',
  DATABASE_URL: databaseUrl,
  DATABASE_URL_UNPOOLED: databaseUrl,
  REDIS_URL: 'redis://127.0.0.1:6379',
  FRONTEND_URL: 'http://localhost:3000',
  FRONTEND_URLS: 'http://localhost:3000,http://127.0.0.1:3000',
  GOOGLE_REDIRECT_URI: webEnv.GOOGLE_REDIRECT_URI,
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  RESEND_API_KEY: '',
};

// Update only managed values; preserve API keys and other personal settings.
export function updateEnvFile(path, values, secrets = []) {
  let content = existsSync(path) ? readFileSync(path, 'utf8') : '# Desarrollo local (no versionar)\n';
  for (const key of secrets) {
    if (!new RegExp(`^${key}=.+$`, 'm').test(content)) {
      values = { ...values, [key]: randomBytes(48).toString('hex') };
    }
  }
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^(?:export\\s+)?${key}=.*$`, 'gm');
    const line = `${key}=${value}`;
    content = pattern.test(content)
      ? content.replace(pattern, () => line)
      : `${content.trimEnd()}\n${line}\n`;
  }
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function prepareLocalEnv() {
  updateEnvFile(resolve(root, '.env.development.local'), webEnv);
  updateEnvFile(resolve(root, 'backend/.env.local'), backendEnv,
    ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']);
}
