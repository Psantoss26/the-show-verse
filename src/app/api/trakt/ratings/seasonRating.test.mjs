import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("puntuar una temporada persiste una fila de temporada sin recorrer sus episodios", async () => {
  const route = await readFile(new URL("./route.js", import.meta.url), "utf8");
  const seasonBranch = route.slice(
    route.indexOf('} else if (type === "season") {'),
    route.indexOf('} else {', route.indexOf('} else if (type === "season") {')),
  );

  assert.doesNotMatch(route, /fetchSeasonEpisodes/);
  assert.match(seasonBranch, /mediaType: "season"/);
  assert.doesNotMatch(seasonBranch, /mediaType: "episode"/);
  assert.doesNotMatch(seasonBranch, /for \(const epNum/);
  assert.match(seasonBranch, /\/season\?season=\$\{seasonNumber\}/);
});
