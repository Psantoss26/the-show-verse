import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seasonDetailsSource = await readFile(
  new URL("../../components/SeasonDetailsClient.jsx", import.meta.url),
  "utf8",
);

test("el modal de una temporada conserva el total y el estado de rewatch", () => {
  assert.match(
    seasonDetailsSource,
    /season_number: Number\(seasonNumber\),\s*episode_count: totalEp/,
    "el modal debe recibir el total real de episodios para poder contar los vistos",
  );
  assert.match(
    seasonDetailsSource,
    /seasons=\{seasonModalSeasons\}/,
    "el modal debe seguir limitado a la temporada mostrada",
  );
  assert.match(
    seasonDetailsSource,
    /useTraktEpisodesWatched\(/,
    "SeasonDetails debe reutilizar la misma máquina de rewatch que DetailsClient",
  );

  [
    "showPlays={seasonEpisodesMachine.showPlays}",
    "rewatchRuns={seasonEpisodesMachine.rewatchRuns}",
    "activeView={seasonEpisodesMachine.activeEpisodesView}",
    "watchedBySeasonRewatch={seasonEpisodesMachine.rewatchWatchedBySeason}",
    "onToggleEpisodeRewatch={seasonEpisodesMachine.toggleEpisodeRewatch}",
  ].forEach((prop) => {
    assert.ok(
      seasonDetailsSource.includes(prop),
      `falta pasar ${prop} al modal de temporada`,
    );
  });
});
