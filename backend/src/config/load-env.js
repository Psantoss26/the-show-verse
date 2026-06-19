import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

dotenv.config({ path: resolve(backendRoot, '.env') });
dotenv.config();
