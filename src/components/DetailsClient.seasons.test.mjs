import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./DetailsClient.jsx", import.meta.url), "utf8");
const section = await readFile(new URL("./details/SeasonsSection.jsx", import.meta.url), "utf8");
// Ejecuta la selección real con Trakt pendiente, fallido y resuelto.
const selection = source.match(/const visible(?:Trakt)?Seasons = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[/)[1];
const numberBody = source.match(/function getSeasonNumber\(season\) \{([\s\S]*?)\n\}/)[1];
const selectSeasons = new Function("data", "tSeasons", "getSeasonNumber", selection);
const getSeasonNumber = new Function("season", numberBody);
const tmdb = [{ season_number: 0 }, { season_number: 1, poster_path: "/one.jpg" }, { season_number: 2 }];

test("las temporadas de TMDb aparecen antes de que Trakt responda y sobreviven a errores", () => {
  for (const state of [{ loading: false, items: [] }, { loading: true, items: [] }, { error: "Timeout", items: [] }]) {
    assert.deepEqual(selectSeasons({ seasons: tmdb }, state, getSeasonNumber), tmdb.slice(1));
  }
});

test("la respuesta de Trakt no cambia la estructura de temporadas de TMDb", () => {
  assert.deepEqual(selectSeasons({ seasons: tmdb }, { items: [{ number: 1 }] }, getSeasonNumber), tmdb.slice(1));
});

test("Trakt sigue disponible como respaldo cuando faltan temporadas de TMDb", () => {
  const items = [{ number: 0 }, { number: 1 }, { number: 2 }, {}];
  assert.deepEqual(selectSeasons({}, { items }, getSeasonNumber), items.slice(1, 3));
  assert.deepEqual(selectSeasons({}, {}, getSeasonNumber), []);
});

test("la sección empieza en pósteres y no oculta contenido durante cargas adicionales", () => {
  assert.match(section, /\[view, setView\] = useState\("posters"\)/);
  assert.match(section, /loading && items\.length === 0 \?/);
  assert.match(section, /if \(saved\) setView\(saved\)/);
});
