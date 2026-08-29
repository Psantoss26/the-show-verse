import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdjacentEpisodeHrefs,
  getAdjacentSeasonHrefs,
} from "./subrouteNavigation.js";

test("navega por las temporadas existentes, incluidos especiales", () => {
  const seasons = [{ season_number: 2 }, { season_number: 0 }, { season_number: 1 }];

  assert.deepEqual(getAdjacentSeasonHrefs(10, 1, seasons), {
    previousHref: "/details/tv/10/season/0",
    nextHref: "/details/tv/10/season/2",
  });
  assert.deepEqual(getAdjacentSeasonHrefs(10, 0, seasons), {
    previousHref: null,
    nextHref: "/details/tv/10/season/1",
  });
});

test("navega solo por episodios reales de la temporada", () => {
  const episodes = [{ episode_number: 3 }, { episode_number: 1 }, { episode_number: 5 }];

  assert.deepEqual(getAdjacentEpisodeHrefs(10, 2, 3, episodes), {
    previousHref: "/details/tv/10/season/2/episode/1",
    nextHref: "/details/tv/10/season/2/episode/5",
  });
  assert.deepEqual(getAdjacentEpisodeHrefs(10, 2, 5, episodes), {
    previousHref: "/details/tv/10/season/2/episode/3",
    nextHref: null,
  });
});
