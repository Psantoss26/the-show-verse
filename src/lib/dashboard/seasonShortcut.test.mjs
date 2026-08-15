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
  assert.match(source, /const goToSeasonDetails = \(\) => goToDetailsRoute\(seasonHref\)/);

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
