import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// La ficha de TELÉFONO del DetailModal es una COPIA de las secciones de la
// vista móvil de DetailsClient: se decidió así a sabiendas de que duplica el
// JSX. Lo que no puede pasar desapercibido es que una de las dos gane o pierda
// una sección — ahí la copia deja de ser una copia y nadie se entera hasta
// abrirlas una al lado de la otra. Estos tests son esa alarma.
const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

// Orden de arriba abajo, el mismo en las dos superficies.
const SECTIONS = [
  "cast",
  "recs",
  "collection",
  "awards",
  "media",
  "sentiment",
  "seasons",
  "episodes",
  "comments",
  "lists",
];

function orderOf(source, prefix) {
  return SECTIONS.filter((id) => source.includes(`${prefix}${id}"`));
}

test("el panel de teléfono tiene las MISMAS secciones que la ficha móvil", async () => {
  const [phone, details] = await Promise.all([
    read("../../components/dashboard/PhoneDetailsSections.jsx"),
    read("../../components/DetailsClient.jsx"),
  ]);

  // En la ficha completa los ids son `section-<id>`; en el panel llevan el
  // prefijo `phone-` para no chocar si alguna vez conviven en el mismo DOM.
  assert.deepEqual(
    orderOf(phone, 'id="phone-section-'),
    orderOf(details, 'id="section-'),
  );
  assert.deepEqual(orderOf(phone, 'id="phone-section-'), SECTIONS);
});

test("el menú de secciones ofrece exactamente esas secciones", async () => {
  const phone = await read("../../components/dashboard/PhoneDetailsSections.jsx");

  // Una entrada de menú sin sección a la que saltar deja un botón muerto; una
  // sección sin entrada es contenido al que no se llega desde el menú.
  const menuIds = [...phone.matchAll(/items\.push\(\{\s*\n?\s*id: "([a-z]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual([...menuIds].sort(), [...SECTIONS].sort());
});

test("las piezas compartidas no se reimplementan en el panel", async () => {
  const phone = await read("../../components/dashboard/PhoneDetailsSections.jsx");

  // Encabezado, tarjeta de premio y menú salen del MISMO sitio que la ficha
  // completa. Si alguien los copiara aquí, el diseño empezaría a divergir por
  // el sitio menos visible.
  assert.match(phone, /from "@\/components\/details\/SectionTitle"/);
  assert.match(phone, /from "@\/components\/details\/AwardCard"/);
  assert.match(phone, /from "@\/components\/DetailsSectionMenu"/);
  assert.doesNotMatch(phone, /function SectionTitle\(/);
  assert.doesNotMatch(phone, /function AwardCard\(/);
});

test("la galería escribe la selección donde la lee la ficha completa", async () => {
  const phone = await read("../../components/dashboard/PhoneDetailsSections.jsx");

  // Misma clave local, misma instantánea de AuthContext y misma cola de
  // guardado: una portada elegida en el panel tiene que verse en la ficha, y al
  // revés. Sin esto cada superficie recordaría su propia selección.
  assert.match(phone, /showverse:\$\{overrideType\}:\$\{id\}:mobilePoster/);
  assert.match(phone, /showverse:\$\{overrideType\}:\$\{id\}:logo/);
  assert.match(phone, /cacheArtworkOverrides\?\.\(/);
  assert.match(phone, /saveArtworkOverride\(/);
});

test("el menú y el resaltado miran el scroll DEL PANEL, no la ventana", async () => {
  const phone = await read("../../components/dashboard/PhoneDetailsSections.jsx");

  // El recorrido ocurre dentro del contenedor con scroll del drawer; contra
  // `window` el menú nunca se enteraría de nada.
  assert.match(phone, /scrollContainerRef\?\.current/);
  assert.doesNotMatch(phone, /window\.addEventListener\("scroll"/);
  assert.doesNotMatch(phone, /window\.scrollY/);
});

test("la sección de soundtrack no pide las pistas en cada render", async () => {
  const phone = await read("../../components/dashboard/PhoneDetailsSections.jsx");

  // `onEnsureLoaded` llega dentro de un objeto literal y es una función
  // declarada en el cuerpo de DetailModal: cambia de identidad en CADA render.
  // Con ella en las dependencias, el efecto se disparaba siempre, la petición
  // ponía `loading` a true, eso re-renderizaba y vuelta a empezar --
  // `/api/soundtrack` en bucle. Se lee por ref y se pide una vez por consulta.
  const effect = phone.slice(
    phone.indexOf("requestedSoundtrackRef.current === soundtrackQuery"),
  );
  const deps = effect.slice(0, effect.indexOf("]")).match(/\}, \[([^\]]*)/);
  assert.ok(deps, "no se encontró la lista de dependencias del efecto");
  assert.equal(deps[1].trim(), "soundtrackQuery");
  assert.doesNotMatch(deps[1], /ensureSoundtrack|onEnsureLoaded/);
});

test("una misma petición de soundtrack no se lanza dos veces", async () => {
  const modal = await read("../../components/dashboard/DetailModal.jsx");

  // El botón de la fila, el reproductor y la sección llaman todos a
  // `loadSoundtrack`. Comparten la PROMESA en vuelo en vez de encadenar
  // consultas, y un fallo limpia la referencia para poder reintentar.
  assert.match(modal, /soundtrackRequestRef/);
  assert.match(
    modal,
    /if \(!force && pending\.key === requestKey && pending\.promise\) \{\s*\n\s*return pending\.promise;/,
  );
  assert.match(
    modal,
    /soundtrackRequestRef\.current = \{ key: null, promise: null \};/,
  );
});
