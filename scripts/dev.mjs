import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root, prepareLocalEnv, webEnv, backendEnv } from './local-env.mjs';

const backend = process.argv[2] === 'backend';
prepareLocalEnv();
const env = { ...process.env, NODE_ENV: 'development', SHOWVERSE_LOCAL_DEV: '1',
  ...(backend ? backendEnv : webEnv) };

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error('No se pudo preparar el entorno local. Comprueba Docker y sus permisos (docker ps).');
    process.exit(result.status || 1);
  }
}

if (backend) {
  const context = env.DOCKER_CONTEXT;
  const inspected = spawnSync('docker', ['context', 'inspect', ...(context ? [context] : []),
    '--format', '{{.Endpoints.docker.Host}}'], { env, encoding: 'utf8' });
  const endpoint = context ? inspected.stdout?.trim() : env.DOCKER_HOST || inspected.stdout?.trim();
  if (!endpoint?.startsWith('unix://')) {
    console.error('El desarrollo requiere Docker local mediante un socket Unix. Comprueba docker ps y docker context show.');
    process.exit(1);
  }
  run('docker', ['compose', '-f', 'deploy/local/docker-compose.yml', 'up', '-d', '--wait', '--wait-timeout', '90']);
  run(process.execPath, ['backend/src/db/migrate.js']);
}

if (backend) {
  runBackendWithReload();
} else {
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', '3000', ...process.argv.slice(2)],
    { cwd: root, env, stdio: 'inherit' },
  );
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 0 : 1); });
}

// Recarga del backend al cambiar el código.
//
// NO se usa `node --watch`: al cambiar de rama, git REEMPLAZA los ficheros
// (otro inodo) y el vigilante de Node pierde los eventos. El backend se quedaba
// sirviendo el código de la rama anterior (p. ej. tras commit → checkout main →
// merge → checkout develop) hasta reiniciarlo a mano. Comparar cada segundo la
// fecha, el tamaño y el inodo de los ficheros de backend/src no falla nunca y
// cuesta muy poco.
function runBackendWithReload() {
  const cwd = resolve(root, 'backend');
  const srcDir = join(cwd, 'src');
  const args = ['src/server.js', ...process.argv.slice(3)];
  let child = null;
  let stopping = false;

  const signature = () => {
    const parts = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(?:m?js|json)$/.test(entry.name)) {
          const stats = statSync(path);
          parts.push(`${path}:${stats.mtimeMs}:${stats.size}:${stats.ino}`);
        }
      }
    };
    walk(srcDir);
    return parts.sort().join('|');
  };

  const start = () => {
    child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
    child.on('error', (error) => { console.error(error.message); });
    child.on('exit', (code, signal) => {
      if (stopping) process.exit(code ?? (signal === 'SIGINT' ? 0 : 1));
      else if (code && !signal) console.error(`[dev] El backend se ha detenido (código ${code}). Se reiniciará al guardar un cambio.`);
    });
  };

  const alive = () => child && child.exitCode === null && child.signalCode === null;

  let last = signature();
  const timer = setInterval(() => {
    let next;
    try { next = signature(); } catch { return; } // a mitad de un checkout
    if (next === last) return;
    last = next;
    console.log('[dev] Cambios en backend/src: reiniciando el backend…');
    if (alive()) {
      child.once('exit', start);
      child.kill('SIGTERM');
    } else {
      start();
    }
  }, 1000);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stopping = true;
      clearInterval(timer);
      if (alive()) child.kill(signal);
      else process.exit(0);
    });
  }

  start();
}
