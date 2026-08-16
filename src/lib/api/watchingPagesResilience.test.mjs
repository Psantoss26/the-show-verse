import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONTINUE = new URL(
  "../../app/continue-watching/ContinueWatchingClient.jsx",
  import.meta.url,
);
const IN_PROGRESS = new URL(
  "../../app/in-progress/InProgressClient.jsx",
  import.meta.url,
);

test("Continuar viendo distingue fallo de red de lista vacía", async () => {
  const source = await readFile(CONTINUE, "utf8");

  // Sin `throwOnError` el `catch` de `load()` es CÓDIGO MUERTO: la función
  // devolvía `[]` ante cualquier fallo, la lista se vaciaba y `writeCache([])`
  // borraba la caché (ver `writeCache`: con lista vacía hace `removeItem`).
  assert.match(source, /getLocalInProgress\(\{ throwOnError: true \}\)/);

  // Y el camino de error NO debe tocar la caché: es lo que hace que el fallo
  // sobreviva a la navegación.
  const bloqueCatch = source.match(/\} catch \{[\s\S]{0,400}?\} finally \{/)?.[0];
  assert.ok(bloqueCatch, "no se localiza el catch de load()");
  assert.doesNotMatch(bloqueCatch, /writeCache/);
});

test("Completadas puede reintentar tras un fallo", async () => {
  const source = await readFile(IN_PROGRESS, "utf8");

  const cuerpo = source.match(
    /const loadCompleted = useCallback\([\s\S]*?\n  \}, \[\]\);/,
  )?.[0];
  assert.ok(cuerpo, "no se localiza loadCompleted");

  // Marcarlo en el `finally` daba por cargada la sección incluso al fallar: la
  // lista se quedaba vacía y ningún efecto volvía a intentarlo.
  const finallyBloque = cuerpo.match(/\} finally \{[\s\S]*$/)?.[0];
  assert.ok(finallyBloque, "no se localiza el finally");
  assert.doesNotMatch(
    finallyBloque,
    /setCompletedLoaded\(true\)/,
    "`completedLoaded` no puede marcarse en el finally: bloquearía el reintento",
  );

  // En el camino bueno sí se marca...
  assert.match(cuerpo, /writeSessionCache\([\s\S]{0,120}?\);\s*setCompletedLoaded\(true\);/);
  // ...y al fallar se recupera lo último cacheado, aunque haya caducado.
  assert.match(cuerpo, /readSessionCache\(COMPLETED_CACHE_KEY, Infinity\)/);
});

test("una caché VACÍA no cuenta como sección cargada", async () => {
  const source = await readFile(IN_PROGRESS, "utf8");

  // `cached.items` es un ARRAY: `[]` es truthy, así que `cached?.items` daba
  // por buena una caché sin contenido y marcaba la sección como cargada. Nada
  // volvía a pedir los datos y quedaba "No tienes series completadas".
  assert.doesNotMatch(source, /if \(cached\?\.items \|\| cached\?\.stats\)/);
  assert.ok(
    (source.match(/cached\?\.items\?\.length \|\| cached\?\.stats/g) || []).length >= 2,
    "todas las lecturas de caché deben exigir contenido real",
  );
});

test("el TTL de quien lee la caché ACORTA, no alarga", async () => {
  const source = await readFile(IN_PROGRESS, "utf8");

  // Con `Math.max(ttl, CACHE_HARD_MAX_AGE)` el TTL que pasaba cada llamada no
  // servía de nada: 10 min contra 7 días daban 7 días, y un dato malo se
  // quedaba pegado una semana. El tope duro es un TECHO, no un suelo.
  assert.match(source, /const maxAge = Math\.min\(ttlMs, CACHE_HARD_MAX_AGE\)/);
  assert.doesNotMatch(source, /Math\.max\(ttlMs, CACHE_HARD_MAX_AGE\)/);
});

test("abrir Completadas revalida si la lista está vacía", async () => {
  const source = await readFile(IN_PROGRESS, "utf8");

  // Sin esto la página dependía de una recarga para recuperarse.
  assert.match(source, /if \(completedItems\.length === 0\) \{\s*void loadCompleted\(\{ background: true \}\);/);
  // La longitud va en las dependencias: es lo que evita el bucle y a la vez
  // permite que el efecto reaccione cuando por fin llegan datos.
  assert.match(source, /completedItems\.length,\s*loadCompleted,\s*\]\);/);
});
