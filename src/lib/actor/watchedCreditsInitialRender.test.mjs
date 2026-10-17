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

  // Inicio del efecto que reinicia la ficha al cambiar de persona (los
  // filtros de créditos ya no viven aquí: cada sección guarda los suyos).
  const resetEffectStart = actorDetails.indexOf(
    "setExternalIds(initialExternalIds);",
  );
  assert.ok(resetEffectStart > 0, "no se encuentra el efecto de reinicio");
  const watchedRefreshEffectStart = actorDetails.indexOf(
    "  useEffect(() => {\n    if (!personId)",
    resetEffectStart,
  );
  const resetEffect = actorDetails.slice(resetEffectStart, watchedRefreshEffectStart);

  assert.match(resetEffect, /setWatchedCredits\(normalizeWatchedCredits\(initialWatchedCredits\)\);/);
  assert.doesNotMatch(resetEffect, /setWatchedCredits\(\[\]\);/);
});
