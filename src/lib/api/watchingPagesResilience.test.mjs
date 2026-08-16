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
