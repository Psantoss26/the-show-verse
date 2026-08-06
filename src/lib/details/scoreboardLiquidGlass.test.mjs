import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navbarPath = new URL("../../components/Navbar.jsx", import.meta.url);
const scoreboardPath = new URL(
  "../../components/details/DetailsScoreboardPanel.jsx",
  import.meta.url,
);
const opticalLayersPath = new URL(
  "../../components/ui/LiquidGlassOpticalLayers.jsx",
  import.meta.url,
);
const detailAtomsPath = new URL(
  "../../components/details/DetailAtoms.jsx",
  import.meta.url,
);
const infoTabsPath = new URL(
  "../../components/details/DetailsInfoTabs.jsx",
  import.meta.url,
);
const awardsPanelPath = new URL(
  "../../components/details/AwardsPanel.jsx",
  import.meta.url,
);

const sharedOpticalLayers = [
  "backdrop-blur-[2px] backdrop-brightness-[1.16] backdrop-saturate-[240%]",
  "radial-gradient(112% 128% at 50% 50%, transparent 34%, #000 92%)",
  "radial-gradient(115% 135% at 50% 50%, transparent 40%, #000 95%)",
  "bg-[linear-gradient(125deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.03)_16%,transparent_40%,transparent_60%,rgba(255,255,255,0.03)_86%,rgba(255,255,255,0.07)_100%)]",
  "bg-[radial-gradient(130%_100%_at_50%_0%,rgba(255,255,255,0.08)_0%,transparent_75%)]",
];

test("DetailsScoreboardPanel reutiliza el liquid glass completo del navbar", async () => {
  const [navbar, scoreboard, opticalLayers] = await Promise.all([
    readFile(navbarPath, "utf8"),
    readFile(scoreboardPath, "utf8"),
    readFile(opticalLayersPath, "utf8"),
  ]);

  assert.match(
    scoreboard,
    /import \{ LIQUID_GLASS_BAR \} from "@\/lib\/ui\/liquidGlass"/,
  );
  assert.match(scoreboard, /rounded-2xl \$\{LIQUID_GLASS_BAR\}/);
  assert.match(scoreboard, /<LiquidGlassOpticalLayers \/>/);
  assert.doesNotMatch(scoreboard, /rounded-2xl bg-black\/\[0\.08\]/);

  for (const layer of sharedOpticalLayers) {
    assert.ok(navbar.includes(layer), `El navbar debe incluir: ${layer}`);
    assert.ok(
      opticalLayers.includes(layer),
      `Las capas compartidas deben incluir: ${layer}`,
    );
  }
});

test("cada tarjeta de DetailsInfoTabs comparte el acabado del Scoreboard", async () => {
  const [detailAtoms, infoTabs, awardsPanel] = await Promise.all([
    readFile(detailAtomsPath, "utf8"),
    readFile(infoTabsPath, "utf8"),
    readFile(awardsPanelPath, "utf8"),
  ]);

  assert.match(detailAtoms, /liquidGlass\s*\? LIQUID_GLASS_BAR/);
  assert.match(detailAtoms, /liquidGlass \? \([\s\S]*?<LiquidGlassOpticalLayers/);
  assert.match(
    infoTabs,
    /<BaseVisualMetaCard \{\.\.\.props\} liquidGlass \/>/,
  );
  assert.match(
    infoTabs,
    /rounded-xl \$\{LIQUID_GLASS_BAR\}[\s\S]*?<LiquidGlassOpticalLayers/,
  );
  assert.match(awardsPanel, /rounded-xl[\s\S]*?\$\{LIQUID_GLASS_BAR\}/);
  assert.match(awardsPanel, /<LiquidGlassOpticalLayers \/>/);
});
