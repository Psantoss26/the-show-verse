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
const detailsClientPath = new URL(
  "../../components/DetailsClient.jsx",
  import.meta.url,
);
const detailModalPath = new URL(
  "../../components/dashboard/DetailModal.jsx",
  import.meta.url,
);
const sectionMenuPath = new URL(
  "../../components/DetailsSectionMenu.jsx",
  import.meta.url,
);

// Las capas de las FICHAS y las del NAVBAR ya no comparten valores, y es
// deliberado: la barra de móvil flota sobre el contenido y aguanta un canto
// fuerte, mientras que las piezas de la ficha van en grupo y ahí ese mismo
// canto se leía como un contorno dibujado alrededor de cada una. Lo que se
// comprueba es que cada una conserve SU acabado.
const detailOpticalLayers = [
  // Canto: mismo brillo que el cristal (1.06). Subirlo vuelve a marcar el borde
  // y se quema sobre fondos claros.
  "backdrop-blur-[2px] backdrop-brightness-[1.06] backdrop-saturate-[160%]",
  // El aro arranca lejos del centro: franja estrecha, no media pieza.
  "radial-gradient(112% 128% at 50% 50%, transparent 62%, #000 100%)",
  "radial-gradient(115% 135% at 50% 50%, transparent 66%, #000 100%)",
  // Reflejos presentes (sin ellos la pieza se ve plana) pero contenidos.
  "bg-[linear-gradient(125deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.02)_16%,transparent_40%,transparent_60%,rgba(255,255,255,0.02)_86%,rgba(255,255,255,0.04)_100%)]",
  "bg-[radial-gradient(130%_100%_at_50%_0%,rgba(255,255,255,0.05)_0%,transparent_68%)]",
];

const navbarOpticalLayers = [
  "backdrop-blur-[2px] backdrop-brightness-[1.16] backdrop-saturate-[240%]",
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

  for (const layer of detailOpticalLayers) {
    assert.ok(
      opticalLayers.includes(layer),
      `Las capas de la ficha deben incluir: ${layer}`,
    );
  }
  for (const layer of navbarOpticalLayers) {
    assert.ok(navbar.includes(layer), `El navbar debe conservar: ${layer}`);
  }
  // Las tres capas siguen ahí: canto, especular y luz superior.
  assert.equal((opticalLayers.match(/aria-hidden="true"/g) || []).length, 3);
});

test("cada tarjeta de DetailsInfoTabs comparte el acabado del Scoreboard", async () => {
  const [detailAtoms, infoTabs, awardsPanel] = await Promise.all([
    readFile(detailAtomsPath, "utf8"),
    readFile(infoTabsPath, "utf8"),
    readFile(awardsPanelPath, "utf8"),
  ]);

  assert.match(detailAtoms, /liquidGlass\s*\? LIQUID_GLASS_CARD/);
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

test("el liquid glass no hereda opacidad de las animaciones de carga", async () => {
  const [detailsClient, detailModal, detailAtoms] = await Promise.all([
    readFile(detailsClientPath, "utf8"),
    readFile(detailModalPath, "utf8"),
    readFile(detailAtomsPath, "utf8"),
  ]);

  const detailsHero = detailsClient.slice(
    detailsClient.indexOf("{/* --- CONTENIDO PRINCIPAL --- */}"),
    detailsClient.indexOf("MENÚ DE NAVEGACIÓN STICKY"),
  );
  const mobileInfoTabs = detailsClient.slice(
    detailsClient.indexOf("MÓVIL: los metadatos viven en pestañas"),
    detailsClient.indexOf("PANEL DE PUNTUACIONES Y ESTADÍSTICAS"),
  );
  const desktopInfoTabs = detailsClient.slice(
    detailsClient.indexOf("Solo visible cuando NO estamos en modo backdrop"),
    detailsClient.indexOf("Tabs y contenido debajo de la tarjeta"),
  );
  const backdropInfoTabs = detailsClient.slice(
    detailsClient.indexOf("Tabs y contenido debajo de la tarjeta"),
    detailsClient.indexOf("MENÚ DE NAVEGACIÓN STICKY"),
  );
  const modalScoreboardIndex = detailModal.indexOf(
    "<DetailsScoreboardPanel",
    detailModal.indexOf("Panel de puntuaciones + plataformas"),
  );
  const modalInfoTabsIndex = detailModal.indexOf(
    "<DetailsInfoTabs",
    detailModal.indexOf("EPISODIO: pestañas Detalles/Sinopsis"),
  );
  const modalScoreboardParent = detailModal.slice(
    modalScoreboardIndex - 220,
    modalScoreboardIndex,
  );
  const modalInfoTabsParent = detailModal.slice(
    modalInfoTabsIndex - 180,
    modalInfoTabsIndex,
  );

  assert.match(detailsHero, /<motion\.div\s+initial=\{false\}/);
  assert.doesNotMatch(mobileInfoTabs, /<FadeIn/);
  assert.doesNotMatch(desktopInfoTabs, /<FadeIn/);
  assert.doesNotMatch(backdropInfoTabs, /<FadeIn/);
  assert.doesNotMatch(
    modalScoreboardParent,
    /initial=\{\{ opacity: 0/,
  );
  assert.doesNotMatch(
    modalInfoTabsParent,
    /initial=\{\{ opacity: 0/,
  );
  assert.match(detailModal, /hidden: \{ opacity: 1, y: 86, scale: 0\.965 \}/);
  assert.match(
    detailAtoms,
    /initial=\{animateGlassContent \? \{ opacity: 0, y: 4 \} : false\}/,
  );
});

test("DetailsSectionMenu comparte el liquid glass estable de las barras", async () => {
  const sectionMenu = await readFile(sectionMenuPath, "utf8");

  // El menú de secciones lleva el MISMO acabado que el Scoreboard y los paneles
  // de la ficha: base LIQUID_GLASS_BAR más las capas ópticas. Con la variante
  // plana y sin capas se veía transparente y sin cuerpo sobre el backdrop.
  assert.match(
    sectionMenu,
    /import \{ LIQUID_GLASS_BAR \} from "@\/lib\/ui\/liquidGlass"/,
  );
  assert.match(sectionMenu, /rounded-2xl",\s*LIQUID_GLASS_BAR/);
  assert.match(sectionMenu, /<LiquidGlassOpticalLayers \/>/);
  assert.doesNotMatch(
    sectionMenu,
    /initial=\{shouldReduceMotion \? false : \{ opacity: 0/,
  );
  assert.doesNotMatch(sectionMenu, /backdrop-blur-\[50px\]/);
});
