import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const modalPath = new URL(
  "../../components/dashboard/DetailModal.jsx",
  import.meta.url,
);

test("el atajo a la temporada solo existe si se sabe a dónde ir", async () => {
  const source = await readFile(modalPath, "utf8");

  // Sin `showId` (un episodio suelto) no hay ruta posible: mejor no pintar el
  // botón que pintarlo roto.
  assert.match(
    source,
    /isEpisode &&\s*episodeMeta\?\.showId != null &&\s*episodeMeta\?\.seasonNumber != null/,
  );
  assert.match(source, /\{seasonHref && \(/);
});

test("la ruta de temporada sigue la convención del proyecto", async () => {
  const source = await readFile(modalPath, "utf8");

  assert.match(
    source,
    /`\/details\/tv\/\$\{episodeMeta\.showId\}\/season\/\$\{episodeMeta\.seasonNumber\}`/,
  );
});

test("los dos destinos comparten la transición y solo uno marca el apretón de manos", async () => {
  const source = await readFile(modalPath, "utf8");

  // Una sola función de navegación: si se duplicara, una de las dos se quedaría
  // atrás al tocar la animación.
  assert.match(source, /const goToDetailsRoute = async \(href, transitionKey\)/);
  assert.match(source, /const goToFullDetails = \(\) =>\s*goToDetailsRoute\(/);
  // Desde «Continuar viendo» la temporada va a su ficha completa; en el resto,
  // al panel de la temporada.
  assert.match(
    source,
    /const goToSeasonDetails = \(\) =>\s*fromContinueWatching\s*\? goToDetailsRoute\(seasonHref\)\s*: openDetailModal\?\.\(\{ media_type: "season"/,
  );

  // `DETAILS_ROUTE_TRANSITION_KEY` lo consume DetailsClient para reconocer que
  // viene del modal. La temporada NO participa, así que no debe escribirlo:
  // una clave que nadie lee se queda colgada en sessionStorage.
  const llamadaTemporada = source.match(
    /goToDetailsRoute\(seasonHref[^)]*\)/,
  )?.[0];
  assert.ok(llamadaTemporada, "no se localiza la navegación a la temporada");
  assert.doesNotMatch(llamadaTemporada, /,/);
});

test("los controles superiores se agrupan para no solaparse al expandirse", async () => {
  const source = await readFile(modalPath, "utf8");

  // Las píldoras crecen en hover; con dos posiciones absolutas fijas se
  // pisarían. El contenedor va anclado solo por `right` para crecer hacia la
  // izquierda.
  assert.match(
    source,
    /<div className="absolute right-4 top-4 z-30 flex items-center gap-2">/,
  );
  // Y ninguno de los dos conserva su propio anclaje absoluto.
  assert.doesNotMatch(source, /absolute right-4 top-4 z-30 group flex/);
});

test("desde Continuar viendo, el episodio ofrece «Ver serie» en el mismo panel", async () => {
  const source = await readFile(modalPath, "utf8");

  assert.match(
    source,
    /const fromContinueWatching =\s*isEpisode && item\?\.previewSource === "continue-watching";/,
  );
  // La serie se APILA (drill): Atrás vuelve al episodio, y el provider decide
  // si va centrada o en el lateral según la configuración.
  assert.match(
    source,
    /openDetailModal\?\.\(\s*\{ media_type: "tv", id: episodeMeta\.showId \},\s*\{ drill: true \},?\s*\)/,
  );
  assert.match(source, /\{openSeriesPreview && \(/);
  assert.match(source, /aria-label="Ver serie"/);
});

test("la fila Continuar viendo marca sus episodios y el Calendario no", async () => {
  const source = await readFile(
    new URL("../../components/ContinueWatchingSection.jsx", import.meta.url),
    "utf8",
  );
  const helper = source.match(/function previewItemFor\(show, mode\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, "no se localiza previewItemFor");
  assert.match(helper, /mode !== "calendar"/);
  assert.match(helper, /previewSource: "continue-watching"/);
});

test("en la vista teléfono, la temporada del episodio de Continuar viendo va a la ficha completa", async () => {
  const source = await readFile(
    new URL("../../components/dashboard/SubrouteDetailsPanel.jsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /next\?\.media_type === "season" && item\.previewSource === "continue-watching"\) openRouteFromFrame\(url\.pathname\)/,
  );
  assert.match(source, /const goToFullDetails = \(\) => goToDetailsRoute\(href\);/);
});
