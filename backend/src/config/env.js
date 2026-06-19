import 'dotenv/config';

const DEV_SECRET_PREFIX = 'dev_';

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAllowedOrigins() {
  return [
    ...splitCsv(process.env.FRONTEND_URLS),
    ...splitCsv(process.env.FRONTEND_URL),
  ];
}

export function validateRuntimeEnv() {
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

  if (process.env.NODE_ENV === 'production') {
    required.push('FRONTEND_URL', 'TMDB_API_KEY');
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = process.env[key] || '';
      if (value.startsWith(DEV_SECRET_PREFIX) || value.length < 32) {
        throw new Error(`${key} must be a strong production secret`);
      }
    }
  }
}

