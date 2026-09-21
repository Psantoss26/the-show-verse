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

test("nada se recorta contra los bordes del panel", async () => {
  const [phone, modal] = await Promise.all([
    read("../../components/dashboard/PhoneDetailsSections.jsx"),
    read("../../components/dashboard/DetailModal.jsx"),
  ]);

  // MENÚ: diez secciones rotuladas no caben en el ancho de un teléfono. Cada
  // botón lleva `overflow-hidden`, así que al encogerse cortaba su propio texto
  // a media palabra.
  assert.match(phone, /iconsOnly/);

  // CARRUSELES: sin desbordamiento visible, o las tarjetas que no caben se
  // pintan fuera y las corta el borde redondeado del panel. Se busca en los
  // `className`, no en el archivo entero: el comentario que explica esto lo
  // nombra y haría fallar al test por citarse a sí mismo.
  //
  // Solo los CARRUSELES: la baraja de portadas de una lista sí necesita
  // desbordar, pero lo hace dentro de su tarjeta, que está en el margen del
  // contenido y nunca llega al canto del panel.
  const carousels = [...phone.matchAll(/<DetailsArrowCarousel([\s\S]*?)>/g)].map(
    (match) => match[1],
  );
  assert.ok(carousels.length > 0, "no se encontró ningún carrusel");
  assert.ok(
    carousels.every((props) => !props.includes("overflow-visible")),
    "algún carrusel deja desbordar sus tarjetas fuera del panel",
  );

  // TARJETAS DE INFORMACIÓN: `mobileLayout` las apila. La fila horizontal es
  // `lg:flex-row`, y ese `lg:` mira el VIEWPORT: en el drawer casa siempre.
  assert.match(modal, /mobileLayout=\{mobileDetails\}/);

  // MARCADOR: las insignias ceden el ancho y se recorren, para que los botones
  // de la derecha queden siempre completos.
  assert.match(modal, /compactToolbar=\{mobileDetails\}/);
});

test("el marcador del teléfono deja fuera Rotten Tomatoes y Metacritic", async () => {
  const modal = await read("../../components/dashboard/DetailModal.jsx");

  // Cinco insignias no caben en ese ancho; se conservan las tres que llevan
  // votos (TMDb, Trakt, IMDb).
  assert.match(modal, /data\.rtScore != null && !mobileDetails/);
  assert.match(modal, /data\.mcScore != null && !mobileDetails/);
});

test("las filas de portadas muestran TRES tarjetas completas", async () => {
  const phone = await read("../../components/dashboard/PhoneDetailsSections.jsx");

  // Tres enteras, como la ficha móvil. Un valor fraccionario ("insinuar" una
  // cuarta a medias) estrecha las tres primeras y la fila se lee recortada.
  const poster = phone.slice(
    phone.indexOf("const PHONE_POSTER_CAROUSEL"),
    phone.indexOf("const PHONE_WIDE_CAROUSEL"),
  );
  const values = [...poster.matchAll(/slidesPerView: ([\d.]+)/g)].map((m) => m[1]);
  assert.ok(values.length > 0, "no se encontró la configuración del carrusel");
  assert.ok(
    values.every((value) => value === "3"),
    `se esperaban 3 tarjetas enteras, hay: ${values.join(", ")}`,
  );
});

test("las tarjetas de Duración y Premios reciben su valor", async () => {
  const modal = await read("../../components/dashboard/DetailModal.jsx");

  // `formatValue` significa cosas distintas en cada disposición de
  // <DetailsInfoTabs>: en la ancha es la duración (solo series) y en la de
  // teléfono es la duración en películas y el FORMATO en series. El modal monta
  // UNA instancia y conmuta, así que el valor tiene que conmutar con ella.
  assert.match(modal, /formatValue=\{\s*\n\s*mobileDetails/);
  // Duración del episodio y premios llegan por sus propias props; sin ellas las
  // tarjetas se quedaban en "—".
  assert.match(modal, /durationValue=\{/);
  assert.match(modal, /awardsValue=\{/);
});

test("los indicadores de la galería son los mismos que en la ficha", async () => {
  const [phone, details] = await Promise.all([
    read("../../components/dashboard/PhoneDetailsSections.jsx"),
    read("../../components/DetailsClient.jsx"),
  ]);

  // La resolución y el botón de copiar URL solo aparecen al pasar por encima.
  // Al portar la tarjeta les quité esa condición razonando que en un teléfono
  // no se verían nunca -- y es cierto --, pero dejarlos fijos añade a cada
  // tarjeta un rótulo y un botón permanentes que la ficha no tiene.
  const shared = [
    "opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0",
    "scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100",
    "bg-zinc-400 shadow-[0_0_6px_rgba(255,255,255,0.4)]",
    "group-hover/link:delay-[2000ms]",
  ];

  for (const fragment of shared) {
    assert.ok(phone.includes(fragment), `el panel perdió: ${fragment}`);
    assert.ok(details.includes(fragment), `la ficha perdió: ${fragment}`);
  }
});

test("las secciones no se montan durante la animación de entrada", async () => {
  const modal = await read("../../components/dashboard/DetailModal.jsx");

  // Diez secciones con sus carruseles y nueve consultas de red montándose
  // encima de los 320ms de la entrada se llevan por delante los fotogramas.
  assert.match(modal, /mobileDetails && phoneSectionsReady && \(/);
  // Y con red de seguridad: si la animación se interrumpe y
  // `onAnimationComplete` no llega, no pueden quedarse sin montar nunca.
  assert.match(modal, /setTimeout\(\(\) => setPhoneSectionsReady\(true\)/);
});

test("el arrastre no repite trabajo que no ha cambiado", async () => {
  const [provider, phone, css] = await Promise.all([
    read("../../components/dashboard/DetailModalProvider.jsx"),
    read("../../components/dashboard/PhoneDetailsSections.jsx"),
    read("../../app/globals.css"),
  ]);

  // El tirador devuelve fracciones de píxel en cada fotograma. Sin filtro, se
  // reescribía una propiedad personalizada de <html> sesenta veces por segundo
  // para dejar el mismo píxel la mitad de las veces.
  assert.match(provider, /if \(next === publishedDrawerInset\) return;/);

  // El alto del menú no cambia al arrastrar: redondeado, deja de provocar un
  // render (y el remontaje del efecto de sección activa) por fotograma.
  assert.match(phone, /current === next \? current : next/);

  // Y las decenas de superficies de cristal de las secciones dejan de
  // remuestrear el fondo mientras el panel cambia de tamaño.
  assert.match(
    css,
    /:root\[data-sv-drawer-resizing\] \.sv-phone-sections[\s\S]*?backdrop-filter: none !important;/,
  );
  // La contención evita que un cambio dentro de una sección invalide el resto.
  assert.match(css, /\.sv-phone-section \{\s*\n\s*contain: layout paint style;/);
});
