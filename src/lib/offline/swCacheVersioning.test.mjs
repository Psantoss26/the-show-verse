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

test("los datos privados sobreviven al build y los assets solo se podan tras preparar documentos", async () => {
  const source = await read("public/sw.js");
  assert.match(source, /showverse-offline-data-v1-/);
  assert.match(source, /PRUNE_BUILDS/);
  assert.match(source, /k !== SHELL_CACHE/);
  assert.match(source, /k !== ASSET_CACHE/);
});

// ...salvo la IDENTIDAD DE LA APP (manifiesto e iconos), que NO puede caducar.
//
// Iban en la caché de assets del build y cada despliegue la retiraba. Sin
// conexión, el navegador no encontraba el icono `maskable`, se quedaba con el
// de `purpose: any` (cuadrado negro a sangre) y el lanzador lo mostraba
// encogido sobre una placa blanca.
test("el manifiesto y los iconos de la PWA viven en una caché estable", async () => {
  const source = await read("public/sw.js");
  const manifest = JSON.parse(await read("public/site.webmanifest"));

  const cacheName = /const IDENTITY_CACHE = "([^"]+)";/.exec(source)?.[1];
  assert.ok(cacheName, "sw.js debe declarar IDENTITY_CACHE");
  assert.doesNotMatch(cacheName, /\$\{|VERSION/, "la caché de identidad no puede llevar la versión del build");
  assert.ok(
    !cacheName.startsWith("showverse-shell-") && !cacheName.startsWith("showverse-assets-"),
    "PRUNE_BUILDS borra las cachés con esos prefijos",
  );

  const assets = /const IDENTITY_ASSETS = \[([\s\S]*?)\];/.exec(source)?.[1] || "";
  const listed = new Set([...assets.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
  assert.ok(listed.has("/site.webmanifest"), "falta el manifiesto");
  for (const icon of manifest.icons) {
    assert.ok(listed.has(icon.src), `falta ${icon.src} (${icon.purpose}) en IDENTITY_ASSETS`);
  }
  assert.match(source, /isIdentityAsset\(url\)\) \{ event\.respondWith\(identity\(request\)\)/);
  assert.match(source, /addEventListener\("install"[\s\S]*?cacheIdentity\(\)/, "se precargan al instalar");
});
