import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const assistantPath = new URL("../../components/WatchNextAssistant.jsx", import.meta.url);
const pagePath = new URL("../../app/assistant/page.jsx", import.meta.url);

test("la página del asistente usa el cristal compartido y LiquidButton", async () => {
  const assistant = await readFile(assistantPath, "utf8");

  assert.match(assistant, /import \{ LIQUID_GLASS_BAR, LIQUID_GLASS_PANEL \} from "@\/lib\/ui\/liquidGlass"/);
  assert.match(assistant, /import LiquidButton from "@\/components\/LiquidButton"/);
  // La receta a mano del panel antiguo no vuelve.
  assert.doesNotMatch(assistant, /backdrop-blur-3xl|bg-black\/45/);
  // Ya no es un modal.
  assert.doesNotMatch(assistant, /role="dialog"|createPortal|useModalGuard/);
});

test("la caja de texto: Enter envía y Shift+Enter hace salto de línea", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  assert.match(assistant, /<textarea/);
  assert.match(
    assistant,
    /event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing/,
  );
});

test("las recomendaciones son tarjetas de título de la app con ficha rápida", async () => {
  const [assistant, page] = await Promise.all([
    readFile(assistantPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);
  assert.match(assistant, /<PosterTile item=\{\{ \.\.\.item, posterPath: /);
  // Solo el póster: nada de título, año, nota ni motivo debajo.
  const card = assistant.slice(
    assistant.indexOf("function TitleCard"),
    assistant.indexOf("// VISTA DE LISTA"),
  );
  assert.doesNotMatch(card, /item\?\.(title|year|voteAverage|reason)|<p\b/);
  // Mismo póster por idioma que la lista; hueco del mismo tamaño mientras
  // llega el lote, no el póster del motor.
  assert.match(card, /const ladder = useLadderPoster\(type, item\?\.id\);/);
  assert.match(card, /ladder\.pending \? \(/);
  assert.match(card, /posterPath: ladder\.path \|\| item\?\.posterPath \|\| null/);
  assert.match(page, /<DetailModalProvider placement="right">/);
});

test("la página descuenta las barras de la app y sigue al teclado del móvil", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  assert.match(assistant, /useFitViewportPage\(\)/);
  assert.match(assistant, /100svh-9rem-var\(--sv-safe-top,0px\)-var\(--sv-safe-bottom,0px\)/);
  assert.match(assistant, /desktop:h-\[calc\(100svh-4rem-var\(--sv-safe-top,0px\)\)\]/);
  assert.match(assistant, /window\.visualViewport/);
});

test("el fondo llega bajo la barra superior y la lateral, como en las páginas de usuario", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  const favorites = await readFile(
    new URL("../../app/favorites/FavoritesClient.jsx", import.meta.url),
    "utf8",
  );
  // La misma capa que Favoritos: fija a toda la ventana, no dentro del hueco
  // de la página (que empieza bajo la barra superior y junto a la lateral).
  assert.match(favorites, /fixed inset-0 pointer-events-none overflow-hidden z-0/);
  assert.match(assistant, /pointer-events-none fixed inset-0 z-0/);
  assert.doesNotMatch(assistant, /absolute inset-0 -z-10 bg-\[radial-gradient/);
  // Degradados en % de la ventana, no manchas con ancho máximo: con
  // `max-w-[800px]` en una pantalla ancha el centro quedaba negro y la violeta
  // hacía una franja bajo la barra superior.
  const fondo = assistant.slice(assistant.indexOf("FONDO DE PÁGINA"), assistant.indexOf("Barra de conversaciones (escritorio)"));
  assert.match(fondo, /radial-gradient\(\d+% \d+% at/);
  assert.doesNotMatch(fondo, /max-w-\[|blur-\[/);
  // Un solo color: el azul de los acentos de la página (sky-400), también en
  // los extremos.
  const colores = new Set(fondo.match(/rgba\(\d+,\d+,\d+/g));
  assert.deepEqual([...colores], ["rgba(56,189,248"]);
  assert.match(fondo, /at 0% 50%, rgba\(56,189,248,/);
  assert.match(fondo, /at 100% 50%, rgba\(56,189,248,/);
});

test("la barra de conversaciones es un panel independiente, separado de las barras", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  const aside = assistant.match(/<aside[\s\S]*?>/)?.[0];
  assert.ok(aside, "no se localiza la barra de conversaciones");
  // Separada 4rem de la barra lateral,
  // con las cuatro esquinas redondeadas y el cristal de la barra lateral.
  assert.match(aside, /ml-16/);
  assert.match(aside, /w-80/);
  // Alto según la pantalla (90% con tope de 50rem), centrado a la altura de la
  // barra lateral de la app en vez de estirado de arriba abajo.
  assert.match(aside, /h-\[min\(50rem,90%\)\] max-h-\[calc\(100%-7rem\)\]/);
  assert.match(aside, /self-center/);
  assert.match(aside, /-top-8/);
  assert.doesNotMatch(aside, /my-6/);
  assert.match(aside, /rounded-\[2rem\]/);
  assert.match(aside, /\$\{LIQUID_GLASS_BAR\}/);
  // Ya no se cuela bajo las barras de la app: así no les tapa el fondo.
  assert.doesNotMatch(assistant, /desktop:-ml-\[4\.5rem\]|desktop:-mt-\[calc\(4rem/);
  assert.doesNotMatch(aside, /pl-\[4\.5rem\]|pt-\[calc\(4rem/);
});

test("el chat se centra en la ventana, no en el hueco a la derecha del panel", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  // 28.5rem = barra lateral (4.5rem) + margen (4rem) + panel (20rem); el tope
  // 100% − 74rem evita estrechar la columna de 48rem en pantallas medianas.
  assert.match(
    assistant,
    /<section className="relative z-10 flex min-w-0 flex-1 flex-col desktop:pr-\[clamp\(0px,calc\(100%-74rem\),28\.5rem\)\]">/,
  );
});

test("vista de lista como la de Favoritos, con selector y preferencia guardada", async () => {
  const assistant = await readFile(assistantPath, "utf8");
  const row = assistant.slice(
    assistant.indexOf("function TitleListRow"),
    assistant.indexOf("function ViewModeSwitch"),
  );
  // La misma fila que Favoritos (TitleRow) con sus datos: duración y géneros,
  // nota de TMDb y de IMDb, y el mismo clic (ficha rápida / ficha completa).
  assert.match(row, /<TitleRow/);
  assert.match(row, /showTitleMeta/);
  assert.match(row, /showImdb\s+imdbRating=\{imdbRating\}\s+imdbLoading=\{imdbLoading\}/);
  // Póster (no backdrop) con la escalera de idioma de las tarjetas, por lote;
  // TitleRow antepone la portada elegida en la ficha.
  assert.doesNotMatch(row, /media=\{/);
  assert.match(row, /const ladder = useLadderPoster\(type, item\?\.id\);/);
  assert.match(row, /posterPath=\{ladder\.pending \? "" : ladder\.path \|\| item\?\.posterPath \|\| ""\}/);
  assert.match(assistant, /requestListArtwork\(type, id\)/);
  // Notas de IMDb: el cargador de Favoritos y Pendientes, solo en lista.
  assert.match(assistant, /useImdbScoreLoader\(\{\s*items: scoreItems,\s*enabled: viewMode === "list",/);
  assert.match(assistant, /setImdbScores\(readScoreCache\("imdb"\)\)/);
  assert.match(row, /onClick=\{previewClick\(target, \{ mediaType: type \}\)\}/);
  assert.match(row, /detail=\{item\?\.reason \|\| null\}/);
  // Se elige en el panel (escritorio) o con el botón de la cabecera (móvil) y
  // se recuerda en el dispositivo.
  assert.match(assistant, /<ViewModeSwitch value=\{viewMode\} onChange=\{setViewMode\} \/>/);
  assert.match(assistant, /aria-label=\{viewMode === "list" \? "Ver como pósters" : "Ver como lista"\}/);
  assert.match(assistant, /const VIEW_MODE_KEY = "showverse:assistant:viewMode";/);
  assert.match(assistant, /<Message\s+message=\{message\}\s+viewMode=\{viewMode\}\s+imdbScores=\{imdbScores\}\s+imdbLoading=\{imdbLoading\}/);
});

test("la página se llama Asistente", async () => {
  const [assistant, page] = await Promise.all([
    readFile(assistantPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);
  assert.match(page, /title: "Asistente",/);
  assert.match(assistant, /<h1 className="truncate text-base font-bold text-white">Asistente<\/h1>/);
  assert.match(assistant, /const activeTitle = empty \? "Asistente"/);
});
