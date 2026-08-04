import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const profileClientPath = path.resolve(
  currentDirectory,
  "../../app/u/[username]/ProfileClient.jsx",
);
const posterTilePath = path.resolve(
  currentDirectory,
  "../../components/social/PosterTile.jsx",
);

test("oculta solo los indicadores fijos móviles de favoritos en el perfil propio", async () => {
  const [profileSource, posterTileSource] = await Promise.all([
    readFile(profileClientPath, "utf8"),
    readFile(posterTilePath, "utf8"),
  ]);

  const ownProfileOverrides =
    profileSource.match(/showFixedIndicator={!isSelf}/g) || [];
  assert.equal(ownProfileOverrides.length, 2);
  assert.match(
    posterTileSource,
    /showFixedIndicator && fixedIndicator && hasViewerIndicators/,
  );
});

test("conserva el indicador favorito para el hover de escritorio", async () => {
  const profileSource = await readFile(profileClientPath, "utf8");
  const favoriteIndicators =
    profileSource.match(/fixedIndicator="favorite"/g) || [];

  assert.equal(favoriteIndicators.length, 2);
});

test("identifica el resumen lateral como datos del mes actual", async () => {
  const profileSource = await readFile(profileClientPath, "utf8");

  assert.match(
    profileSource,
    /<SectionHeader\s+label="Este mes"\s+onClick=\{\(\) => navigateToTab\("statistics"\)\}/,
  );
});
