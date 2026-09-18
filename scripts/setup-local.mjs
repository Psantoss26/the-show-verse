import { prepareLocalEnv } from './local-env.mjs';

prepareLocalEnv();
console.log('Configuración local preparada. Conservadas las claves externas de .env.');
console.log('Ejecuta npm run dev en la raíz y en backend/ (requiere Docker).');
