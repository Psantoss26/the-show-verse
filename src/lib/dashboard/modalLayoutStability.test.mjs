import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MODAL = new URL(
  "../../components/dashboard/DetailModal.jsx",
  import.meta.url,
);
const HOOK = new URL(
  "../../components/dashboard/useDetailModalData.js",
  import.meta.url,
);

// EL PROBLEMA. Las filas de plataformas y de premios se resuelven DESPUÉS del
// resto (consultas independientes), y se montaban solo cuando llegaba su dato.
// Al aparecer, empujaban hacia abajo todo lo que va debajo: características,
// DetailsScoreboardPanel y DetailsInfoTabs. La cura es reservarles el hueco
// mientras no se sabe si tendrán contenido -- y liberarlo cuando se sabe que no.

test("las filas tardías reservan su hueco en vez de aparecer de golpe", async () => {
  const modal = await readFile(MODAL, "utf8");

  // Un `&&` monta la fila solo cuando hay dato: no hay hueco reservado y el
  // contenido de debajo salta. Tiene que ser un ternario con rama de reserva.
  assert.doesNotMatch(modal, /\{hasProviders && \(/);
  assert.equal((modal.match(/\{hasProviders \? \(/g) || []).length, 2);
  assert.equal(
    (modal.match(/!data\.providersResolved \? \(/g) || []).length,
    2,
    "las dos filas de plataformas (episodio y película/serie) deben reservar hueco",
  );

  assert.doesNotMatch(modal, /\{data\.awards && \(/);
  assert.match(modal, /\{data\.awards \? \(/);
  assert.match(modal, /!data\.imdbRatingResolved \? \(/);
});

test("el hueco de premios se clona de la fila real, sin alturas a mano", async () => {
  const modal = await readFile(MODAL, "utf8");

  // Fijar un `h-[Npx]` a ojo se descuadra en cuanto cambie la tipografía; el
  // clon invisible mide siempre lo mismo que la fila de verdad.
  const reserva = modal.match(
    /!data\.imdbRatingResolved \? \([\s\S]{0,2000}?\) : null\}/,
  )?.[0];
  assert.ok(reserva, "no se localiza la reserva de premios");
  assert.match(reserva, /invisible/);
  assert.match(reserva, /<Award className="h-4 w-4 shrink-0" \/>/);
  assert.match(reserva, /aria-hidden="true"/);
});

test("`providersResolved` se marca SIEMPRE, no solo si hay plataformas", async () => {
  const hook = await readFile(HOOK, "utf8");

  assert.match(hook, /providersResolved: false/);
  // En un `finally`: si se marcara solo en el camino feliz, los títulos sin
  // plataformas (o con la consulta caída) se quedarían con el hueco para
  // siempre -- que es peor que el salto original.
  assert.match(
    hook,
    /\} finally \{\s*if \(!cancelled\) \{\s*setData\(\(prev\) => \(\{ \.\.\.prev, providersResolved: true \}\)\);/,
  );
});

test("la señal de premios cubre las dos salidas del efecto de OMDb", async () => {
  const hook = await readFile(HOOK, "utf8");

  // `imdbRatingResolved` es la señal reutilizada para los premios. Hay DOS
  // ramas —episodio y película/serie— y cada una tiene TRES salidas: sin
  // imdbId, éxito y `catch`. Las seis deben marcarla; si alguna se queda sin
  // hacerlo, el hueco reservado no se libera nunca en ese camino.
  //
  // La rama de episodio no pide premios (un episodio no los tiene), así que
  // liberar el hueco ahí es lo correcto.
  assert.equal(
    (hook.match(/imdbRatingResolved: true/g) || []).length,
    6,
    "alguna salida dejó de marcar la señal: el hueco de premios no se liberaría",
  );
  // Y en la rama que SÍ trae premios, van en el mismo `setData`: no puede
  // liberarse el hueco un instante antes de tener el dato.
  assert.match(hook, /awards: awards \?\? prev\.awards,[\s\S]{0,400}?imdbRatingResolved: true/);
});

const PANEL = new URL(
  "../../components/details/DetailsScoreboardPanel.jsx",
  import.meta.url,
);

test("el marcador nace con su alto final, sin esperar a las stats de Trakt", async () => {
  const [panel, modal] = await Promise.all([
    readFile(PANEL, "utf8"),
    readFile(MODAL, "utf8"),
  ]);

  // El pie de estadísticas se montaba solo al llegar los números: el panel
  // crecía y empujaba hacia abajo las pestañas.
  assert.match(panel, /pending = false,/);
  assert.match(panel, /if \(!hasStats && !pending\) return null;/);
  // Y el panel entero debe montarse aunque aún no haya nada más que el hueco.
  assert.match(
    panel,
    /if \(!hasToolbar && !hasStats && !statsPending && !children\) return null;/,
  );
  assert.match(panel, /pending=\{statsPending\}/);

  assert.match(modal, /statsPending=\{!data\.scoreboardResolved\}/);
});

test("cargando no es lo mismo que no haber dato", async () => {
  const panel = await readFile(PANEL, "utf8");

  // Ni "0" (sería un dato: "no lo sigue nadie") ni "-" (sería "no hay dato").
  // Durante la carga no se sabe ninguna de las dos cosas, así que el hueco se
  // reserva con un valor INVISIBLE y no se afirma nada.
  assert.match(panel, /hasStats \? formatShortNumber\(value \?\? 0\)\?\.toUpperCase\(\) \|\| "0" : null/);
  assert.match(
    panel,
    /\{pending \? \(\s*<span className="invisible" aria-hidden="true">/,
    "el valor pendiente debe reservar hueco sin mostrar nada",
  );
  // El guion sigue existiendo, pero solo para el caso resuelto-y-sin-dato.
  assert.match(panel, /value \|\| "-"/);

  for (const campo of ["watchers", "plays", "lists", "favorited"]) {
    assert.match(panel, new RegExp(`value=\\{statValue\\(stats\\?\\.${campo}\\)\\}`));
    assert.match(panel, /pending=\{!hasStats && pending\}/);
  }
});

test("las tarjetas de información no muestran guion mientras cargan", async () => {
  const tabs = await readFile(
    new URL("../../components/details/DetailsInfoTabs.jsx", import.meta.url),
    "utf8",
  );

  // Todos los campos deben pasar por la puerta de carga. Los que no la tenían
  // pintaban "—" desde el primer fotograma, afirmando que no hay dato cuando
  // todavía no se había preguntado.
  assert.equal(
    (tabs.match(/value=\{[a-zA-Z]+ \|\| "—"\}/g) || []).length,
    0,
    "algún campo muestra el guion sin esperar a `metadataLoading`",
  );
});

test("`scoreboardResolved` se marca en TODAS las salidas de su consulta", async () => {
  const hook = await readFile(HOOK, "utf8");

  // Dos ramas (episodio y película/serie) x cuatro salidas: no encontrado,
  // éxito con datos, éxito sin datos y `catch`. Si una dejara de marcarlo, el
  // hueco reservado no se liberaría nunca en ese camino.
  assert.equal(
    (hook.match(/scoreboardResolved: true/g) || []).length,
    8,
    "alguna salida dejó de marcar la señal: el marcador se quedaría con el hueco",
  );
});

test("ninguna tarjeta de la fila puede quedarse sola y estirarse", async () => {
  const tabs = await readFile(
    new URL("../../components/details/DetailsInfoTabs.jsx", import.meta.url),
    "utf8",
  );

  // Las tarjetas comparten la fila con `lg:flex-auto`: su ancho depende de
  // CUÁNTAS haya. Si una se pinta mientras las demás aún no existen, se lleva
  // todo el ancho y luego encoge. Por eso todas las de la ruta de series pasan
  // por la misma puerta de carga y aparecen juntas.
  const lineas = tabs.split("\n");
  const sinPuerta = [];
  for (let i = 215; i < Math.min(lineas.length, 315); i += 1) {
    if (!lineas[i].includes("VisualMetaCard")) continue;
    const bloque = lineas.slice(Math.max(0, i - 6), i + 11).join("\n");
    const propia = lineas.slice(i, i + 11).join("\n");
    const tienePuerta =
      bloque.includes("metadataLoading ?") || bloque.includes("!metadataLoading");
    const creceSola = propia.includes("flex-auto");
    const soloPelicula = /budget|revenue/i.test(bloque);
    if (creceSola && !tienePuerta && !soloPelicula) sinPuerta.push(i + 1);
  }
  assert.deepEqual(
    sinPuerta,
    [],
    `estas tarjetas se estirarían solas durante la carga: ${sinPuerta.join(", ")}`,
  );
});
