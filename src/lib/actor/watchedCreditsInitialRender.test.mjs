import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actorDetailsPath = new URL(
  "../../components/ActorDetails.jsx",
  import.meta.url,
);
const actorPagePath = new URL(
  "../../app/details/person/[id]/page.jsx",
  import.meta.url,
);

test("la sección Vistos recibe créditos ya resueltos en el render inicial", async () => {
  const [actorDetails, actorPage] = await Promise.all([
    readFile(actorDetailsPath, "utf8"),
    readFile(actorPagePath, "utf8"),
  ]);

  assert.match(actorPage, /initialWatchedCredits=\{initialWatchedCredits\}/);
  assert.match(actorDetails, /initialWatchedCredits = \[\]/);
  assert.match(
    actorDetails,
    /useState\(\(\) =>\s*normalizeWatchedCredits\(initialWatchedCredits\),?\s*\)/,
  );

  const resetEffectStart = actorDetails.indexOf(
    "const defaultCreditFilters = getDefaultCreditFilters(actorDetails);",
  );
  const watchedRefreshEffectStart = actorDetails.indexOf(
    "fetch(`/api/trakt/person/${encodeURIComponent(personId)}/watched`",
  );
  const resetEffect = actorDetails.slice(resetEffectStart, watchedRefreshEffectStart);

  assert.match(resetEffect, /setWatchedCredits\(\[\]\);/);
  assert.doesNotMatch(resetEffect, /initialWatchedCredits/);
});
