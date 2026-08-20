import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Zod ELIMINA las claves que el esquema no declara. Si el handler de progreso
// desestructura un campo de `parsed.data` que el esquema no lista, ese campo
// llega siempre `undefined` y cualquier protección que dependa de él queda
// muerta EN SILENCIO: sin error de validación, sin fallo en tiempo de ejecución
// y sin nada en los logs.
//
// Pasó de verdad con `estimated` (la posición deducida por reloj que envía la
// app de Android): al no estar declarado, el servidor daba por vistos episodios
// sin terminar y dejaba que una estimación arrastrase "Continuar viendo" hacia
// atrás, justo las dos cosas que el código dice evitar.
//
// El test no comprueba un campo concreto sino la INVARIANTE, para que el
// próximo campo que se añada al ping no pueda repetirlo.
const source = readFileSync(new URL('./auth.js', import.meta.url), 'utf8');

function schemaKeys(name) {
  const start = source.indexOf(`const ${name} = z.object({`);
  assert.notEqual(start, -1, `no se encontró el esquema ${name}`);
  const end = source.indexOf('\n});', start);
  assert.notEqual(end, -1, `no se encontró el final del esquema ${name}`);
  const body = source.slice(start, end);
  return new Set(
    [...body.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]),
  );
}

function destructuredFields(routePath) {
  const routeStart = source.indexOf(`fastify.post('${routePath}'`);
  assert.notEqual(routeStart, -1, `no se encontró la ruta ${routePath}`);
  const openBrace = source.indexOf('const {', routeStart);
  const closeBrace = source.indexOf('} = parsed.data;', openBrace);
  assert.notEqual(closeBrace, -1, `no se encontró la desestructuración de ${routePath}`);
  const body = source.slice(openBrace + 'const {'.length, closeBrace);
  return body
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith('//'))
    .map((part) => part.split(':')[0].trim());
}

test('el esquema de progreso declara todo lo que el handler desestructura', () => {
  const declared = schemaKeys('netflixProgressSchema');
  const used = destructuredFields('/netflix/progress');

  assert.ok(used.length > 0, 'la desestructuración no debería estar vacía');
  const missing = used.filter((field) => !declared.has(field));
  assert.deepEqual(
    missing,
    [],
    `campos usados por el handler y ausentes del esquema (Zod los borra): ${missing.join(', ')}`,
  );
});

test('la posición deducida sigue declarada en el ping de progreso', () => {
  // Guarda explícita del caso que motivó el test: la app de Android envía
  // `estimated: true` desde SyncClient.sendProgress.
  assert.ok(schemaKeys('netflixProgressSchema').has('estimated'));
});
