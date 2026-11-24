// `npm run live`: la app en MODO PRODUCCIÓN en :3000, recompilada sola al
// cambiar el código.
//
// Con `next dev`, cada compilación (una edición, otra pestaña que abre una ruta
// nueva) avisa a TODAS las pestañas abiertas y estas se vuelven a pintar enteras
// (Fast Refresh). Con un agente editando, eso pasaba cada pocos segundos y la
// página iba a tirones, sobre todo al pasar el cursor por las tarjetas. Aquí no
// hay recarga en caliente: se sirve un build de producción (React optimizado) y,
// cuando el código deja de cambiar unos segundos, se compila otro en segundo
// plano y se cambia de servidor. La pestaña abierta coge la versión nueva al
// navegar (Next detecta el build distinto y carga la página entera) o con F5.
//
// `next build` limpia `.next` (salvo cache/dev/lock), así que no se puede servir
// desde ahí mientras se compila: cada build se copia a `.next-serve/a|b` y el
// servidor arranca con `distDir` apuntando a esa copia (SHOWVERSE_DIST_DIR).
import { spawn } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setPriority } from 'node:os';
import { root, prepareLocalEnv, webEnv } from './local-env.mjs';

const QUIET_MS = 8000; // espera sin cambios antes de recompilar
const SERVE_ROOT = '.next-serve';
const NEXT_BIN = 'node_modules/next/dist/bin/next';

prepareLocalEnv();
const env = { ...process.env, ...webEnv, NODE_ENV: 'production', SHOWVERSE_LOCAL_DEV: '1' };
const log = (msg) => console.log(`[live ${new Date().toLocaleTimeString('es-ES')}] ${msg}`);

// ---- Firma del código: fecha, tamaño e inodo de cada fichero vigilado. ----
const WATCHED = ['src', 'public', 'next.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.mjs'];
function signature() {
  const parts = [];
  const walk = (path) => {
    let stats;
    try { stats = statSync(path); } catch { return; }
    if (stats.isDirectory()) {
      for (const name of readdirSync(path)) walk(join(path, name));
    } else {
      parts.push(`${path}:${stats.mtimeMs}:${stats.size}:${stats.ino}`);
    }
  };
  for (const entry of WATCHED) walk(resolve(root, entry));
  return parts.sort().join('|');
}

// ---- Servidor ----
let server = null;
let slot = null;
let stopping = false;

function startServer(dir) {
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '--hostname', '127.0.0.1', '--port', '3000'], {
    cwd: root, env: { ...env, SHOWVERSE_DIST_DIR: dir }, stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (child === server && !stopping) log(`El servidor se ha parado (${signal || code}).`);
  });
  server = child;
}

function stopServer() {
  const child = server;
  server = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((done) => {
    child.once('exit', done);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
  });
}

// ---- Build ----
let building = null;

function build() {
  return new Promise((done) => {
    const child = spawn(process.execPath, [NEXT_BIN, 'build'], { cwd: root, env, stdio: 'inherit' });
    // Prioridad mínima: compila con los núcleos libres sin dar tirones al escritorio.
    try { setPriority(child.pid, 19); } catch {}
    building = child;
    child.on('exit', (code) => { building = null; done(code === 0); });
    child.on('error', () => { building = null; done(false); });
  });
}

async function publish() {
  const next = slot === 'a' ? 'b' : 'a';
  const dir = join(SERVE_ROOT, next);
  const target = resolve(root, dir);
  rmSync(target, { recursive: true, force: true });
  // Solo lo que necesita `next start`; fuera la caché de compilación, el dev
  // server, el standalone (copia entera de la app) y los tipos.
  const skip = new Set(['cache', 'dev', 'lock', 'standalone', 'types', 'trace', 'trace-build', 'diagnostics']);
  for (const name of readdirSync(resolve(root, '.next'))) {
    if (!skip.has(name)) cpSync(resolve(root, '.next', name), join(target, name), { recursive: true, dereference: true });
  }
  await stopServer();
  startServer(dir);
  if (slot) rmSync(resolve(root, SERVE_ROOT, slot), { recursive: true, force: true });
  slot = next;
  log(`Versión nueva servida en http://localhost:3000 (${dir}).`);
}

let last = signature();
let changedAt = 0;
let dirty = true; // el primer build siempre

async function loop() {
  if (stopping || building) return;
  if (!dirty || Date.now() - changedAt < QUIET_MS) return;
  dirty = false;
  const before = last;
  log('Compilando la versión nueva (la actual sigue servida)…');
  const ok = await build();
  if (stopping) return;
  if (!ok) {
    log('El build ha fallado: se sigue sirviendo la versión anterior. Se reintenta al guardar otro cambio.');
    return;
  }
  // Si el código cambió durante el build, se publica igual y se vuelve a compilar.
  if (last !== before) dirty = true;
  await publish();
}

// Arranque inmediato con el último build servido, si lo hay.
for (const candidate of ['a', 'b']) {
  const dir = join(SERVE_ROOT, candidate);
  if (!slot && existsSync(resolve(root, dir, 'BUILD_ID'))) {
    slot = candidate;
    startServer(dir);
    log(`Sirviendo el último build (${dir}) mientras se compila el actual.`);
  }
}

const timer = setInterval(() => {
  try {
    const now = signature();
    if (now !== last) { last = now; changedAt = Date.now(); dirty = true; }
  } catch { return; } // a mitad de un checkout
  loop();
}, 2000);
loop();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    stopping = true;
    clearInterval(timer);
    building?.kill('SIGTERM');
    await stopServer();
    process.exit(0);
  });
}
