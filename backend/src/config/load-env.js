import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// 1) Valores base del backend (.env). No sobreescribe lo que ya venga del
//    entorno del proceso (p. ej. las variables del contenedor en el NAS).
dotenv.config({ path: resolve(backendRoot, '.env') });

// 2) Overrides de DESARROLLO LOCAL (.env.local): SÍ sobreescriben a .env para
//    apuntar a la Postgres/Redis local sin tocar el .env base. En producción
//    este fichero no existe (está en .dockerignore), así que no afecta al NAS.
dotenv.config({ path: resolve(backendRoot, '.env.local'), override: true });

// 3) .env del directorio de trabajo actual (compatibilidad).
dotenv.config();
