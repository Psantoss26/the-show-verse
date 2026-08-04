import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSeasonEpisodeMetadata,
  historyEpisodeMetadataKey,
} from "./episodeSeasonMetadata.js";

test("conserva el titulo localizado aunque el episodio no tenga still", () => {
  const metadata = buildSeasonEpisodeMetadata({
    episodes: [
      {
        season_number: 2,
        episode_number: 4,
        name: "El juramento",
        still_path: null,
      },
    ],
  });

  assert.deepEqual(metadata.get(historyEpisodeMetadataKey(2, 4)), {
    title: "El juramento",
    stillPath: null,
  });
});

test("normaliza titulo y still de cada episodio de la temporada", () => {
  const metadata = buildSeasonEpisodeMetadata({
    episodes: [
      {
        season_number: 1,
        episode_number: 1,
        name: "  Se acerca el invierno  ",
        still_path: "/winter.jpg",
      },
      { season_number: null, episode_number: 2, name: "Inválido" },
    ],
  });

  assert.equal(metadata.size, 1);
  assert.deepEqual(metadata.get("1:1"), {
    title: "Se acerca el invierno",
    stillPath: "/winter.jpg",
  });
});
