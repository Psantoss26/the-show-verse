import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// 1) Valores base del backend (.env). No sobreescribe lo que ya venga del
//    entorno del proceso (p. ej. las variables del contenedor en el NAS).
const runtimeMode = process.env.NODE_ENV;
dotenv.config({ path: resolve(backendRoot, '.env') });

// 2) Overrides de DESARROLLO LOCAL (.env.local): SÍ sobreescriben a .env para
//    apuntar a la Postgres/Redis local sin tocar el .env base. Se ignora en
//    producción y tests, incluso si el fichero existe en la máquina.
if (!['production', 'test'].includes(runtimeMode || process.env.NODE_ENV)) {
  dotenv.config({ path: resolve(backendRoot, '.env.local'), override: true });
}

// 3) .env del directorio de trabajo actual (compatibilidad).
dotenv.config();

// Fail before opening a connection or running migrations in a local dev process.
if (process.env.SHOWVERSE_LOCAL_DEV === '1') {
  for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'REDIS_URL']) {
    let url;
    try { url = new URL(process.env[key]); } catch { /* handled below */ }
    if (!url || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error(`${key} debe apuntar a localhost para desarrollo local.`);
    }
  }
}
