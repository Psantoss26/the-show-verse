import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authContext = new URL("./AuthContext.jsx", import.meta.url);

// El servidor no ve localStorage: pinta con DEFAULT_PREFERENCES. Si el primer
// render del cliente lee ya la copia local, todo lo que dependa de una
// preferencia (p. ej. «Puntuaciones en el móvil» en el marcador de la ficha)
// sale distinto y React tira el HTML con «Hydration failed».
test("las preferencias arrancan con los valores por defecto, igual que en el servidor", async () => {
  const source = await readFile(authContext, "utf8");

  assert.match(source, /useState\(DEFAULT_PREFERENCES\)/);
  assert.doesNotMatch(source, /useState\(readAuthPreferencesCache\)/);
  assert.doesNotMatch(source, /useState\(\(\) => readAuthPreferencesCache\(\)\)/);
});

test("la copia local de preferencias se aplica tras hidratar, en la transición de arranque", async () => {
  const source = await readFile(authContext, "utf8");

  const boot = source.match(
    /useLayoutEffect\(\(\) => \{\s*const cachedUser = readAuthUserCache\(\);[\s\S]*?\n  \}, \[\]\);/,
  );
  assert.ok(boot, "falta el useLayoutEffect de arranque");
  assert.match(boot[0], /readAuthPreferencesCache\(\)/);
  assert.match(boot[0], /startTransition\(\(\) => \{[\s\S]*setPreferences\(/);
});
