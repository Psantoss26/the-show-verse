import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// LAS CACHÉS DEL SERVICE WORKER TIENEN QUE CADUCAR CON EL BUILD.
//
// El fallo que esto vigila: el SW nombraba sus cachés con una constante a mano
// (`VERSION = "v2"`). Nadie la sube al desplegar, así que `activate` no borraba
// nada y las cachés se llenaban de documentos y chunks de builds anteriores (104
// MB medidos en un navegador real). Como el documento cae a caché ante un 5xx
// del origen —rutina con el NAS detrás del túnel— y los chunks de `/_next/static`
// se sirven cache-first, la app arrancaba ENTERA en una versión antigua: de ahí
// que reapareciera el navbar de antes, con las secciones como iconos fijos
// delante de la foto de perfil y sin desplegable.

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, "../../..");

const read = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("el SW saca el nombre de sus cachés de la URL con la que se registra", async () => {
  const source = await read("public/sw.js");

  assert.match(
    source,
    /searchParams\.get\("v"\)/,
    "sw.js debe leer el sello de build de su propia URL",
  );
  assert.doesNotMatch(
    source,
    /^const VERSION = "v\d+";$/m,
    'sw.js ha vuelto a una constante a mano (`const VERSION = "vN"`): las cachés dejarían de caducar con el build',
  );
});

test("PwaManager registra el SW con el sello de build", async () => {
  const source = await read("src/components/PwaManager.jsx");

  assert.match(
    source,
    /\/sw\.js\?v=\$\{/,
    "PwaManager debe registrar /sw.js?v=<build>, o el navegador no busca SW nuevo",
  );
  assert.doesNotMatch(
    source,
    /register\("\/sw\.js"/,
    "PwaManager registra /sw.js sin sello: el SW viejo seguiría controlando",
  );
});

test("PwaManager no recarga el documento cuando el SW toma el control", async () => {
  const source = await read("src/components/PwaManager.jsx");

  assert.doesNotMatch(
    source,
    /window\.location\.reload\(\)/,
    "activar o actualizar el service worker no debe provocar una segunda carga visible de la página",
  );
});

test("next.config expone el sello al cliente", async () => {
  const source = await read("next.config.ts");

  assert.match(source, /NEXT_PUBLIC_SW_BUILD/);
  assert.match(
    source,
    /env:\s*\{/,
    "el sello se inlinea vía `env` para que cliente y SW vean el mismo valor",
  );
});

test("activate sigue retirando toda caché showverse que no sea la del build actual", async () => {
  const source = await read("public/sw.js");

  // Es lo que se lleva por delante las cachés del build anterior (y las `v2`
  // heredadas). Sin este filtro, versionar los nombres solo acumularía más.
  assert.match(source, /k\.startsWith\("showverse-"\)/);
  assert.match(source, /k !== SHELL_CACHE/);
  assert.match(source, /k !== ASSET_CACHE/);
});
