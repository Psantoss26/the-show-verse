import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
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

const args = backend
  ? ['--watch', 'src/server.js', ...process.argv.slice(3)]
  : ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', '3000', ...process.argv.slice(2)];
const child = spawn(process.execPath, args, {
  cwd: backend ? resolve(root, 'backend') : root, env, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 0 : 1); });
