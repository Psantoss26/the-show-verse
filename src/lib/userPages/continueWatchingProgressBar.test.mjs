import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const continueWatchingPath = path.resolve(
  currentDirectory,
  "../../app/continue-watching/ContinueWatchingClient.jsx",
);
const inProgressPath = path.resolve(
  currentDirectory,
  "../../app/in-progress/InProgressClient.jsx",
);

test("Continuar viendo replica el diseño de barra de progreso exterior bajo la portada de En progreso", async () => {
  const [cwSource, ipSource] = await Promise.all([
    readFile(continueWatchingPath, "utf8"),
    readFile(inProgressPath, "utf8"),
  ]);

  // Ambos componentes deben tener la barra de progreso centrada al 85% y con altura h-1 fuera de la imagen
  const progressTrackClass = 'mx-auto mt-2 h-1 w-[85%] overflow-hidden rounded-full bg-white/25';
  assert.ok(
    cwSource.includes(progressTrackClass),
    "ContinueWatchingClient debe incluir la clase de barra centrada al 85% de En progreso",
  );
  assert.ok(
    ipSource.includes(progressTrackClass),
    "InProgressClient debe mantener la clase de barra centrada al 85%",
  );

  // En la vista de póster de Continuar viendo se renderiza la barra con el degradado de color
  const cwPosterSection = cwSource.slice(
    cwSource.indexOf('if (viewMode === "poster")'),
    cwSource.indexOf('// ==== CARDS (por defecto) ===='),
  );

  assert.match(cwPosterSection, /role="progressbar"/);
  assert.match(cwPosterSection, /className="mx-auto mt-2 h-1 w-\[85%\] overflow-hidden rounded-full bg-white\/25"/);
  assert.match(cwPosterSection, /className={`h-full rounded-full bg-gradient-to-r \${colors\.bar}`}/);
  assert.match(cwPosterSection, /style={{ width: `\${pct}%` }}/);
});

test("los indicadores hover de póster en Continuar viendo, En progreso y Completadas usan padding simétrico sin w-10 fijo", async () => {
  const [cwSource, ipSource] = await Promise.all([
    readFile(continueWatchingPath, "utf8"),
    readFile(inProgressPath, "utf8"),
  ]);

  // En ContinueWatchingClient, el porcentaje del bocadillo de hover usa pl-1.5 pr-2 igualando el margen izquierdo
  const cwIndicator = cwSource.slice(
    cwSource.indexOf("function ContinueWatchingPosterHoverIndicator"),
    cwSource.indexOf("const ProgressCard = memo"),
  );
  assert.doesNotMatch(cwIndicator, /w-10 shrink-0 items-center justify-center text-xl font-black/);
  assert.match(cwIndicator, /pl-1\.5 pr-2 text-xl font-black/);

  // En InProgressClient, el porcentaje de InProgressPosterHoverIndicator y la nota de CompletedHoverIndicator usan pl-1.5 pr-2
  const ipIndicator = ipSource.slice(
    ipSource.indexOf("function InProgressPosterHoverIndicator"),
    ipSource.indexOf("// ----------------------------\n// IN-PROGRESS CARD"),
  );
  assert.doesNotMatch(ipIndicator, /w-10 shrink-0 items-center justify-center text-xl font-black/);
  assert.match(ipIndicator, /pl-1\.5 pr-2 text-xl font-black/);
});


test("el difuminado oscuro sobre el backdrop en la vista de tarjetas completas está suavizado en En progreso y Continuar viendo", async () => {
  const [cwSource, ipSource] = await Promise.all([
    readFile(continueWatchingPath, "utf8"),
    readFile(inProgressPath, "utf8"),
  ]);

  // Ninguno debe usar el difuminado oscuro agresivo anterior (from-black/75 via-black/25 to-black/10)
  assert.doesNotMatch(cwSource, /from-black\/75 via-black\/25 to-black\/10/);
  assert.doesNotMatch(ipSource, /from-black\/75 via-black\/25 to-black\/10/);

  // Ambos deben usar el gradiente suavizado que despeja la imagen
  const softenedGradient = "bg-gradient-to-t from-black/45 via-black/15 to-transparent";
  assert.ok(
    cwSource.includes(softenedGradient),
    "Continuar viendo debe usar el gradiente de backdrop suavizado",
  );
  assert.ok(
    ipSource.includes(softenedGradient),
    "En progreso / Completadas debe usar el gradiente de backdrop suavizado",
  );

  // InProgressClient reduce también la viñeta superior para no oscurecer las caras/cabezas
  assert.doesNotMatch(ipSource, /from-black\/35 to-transparent/);
  assert.match(ipSource, /from-black\/20 to-transparent/);
});

test("la vista de tarjetas completas en Continuar viendo no superpone el título encima del backdrop", async () => {
  const cwSource = await readFile(continueWatchingPath, "utf8");

  const cwCardsSection = cwSource.slice(
    cwSource.indexOf('// ==== CARDS (por defecto) ===='),
    cwSource.indexOf('// ----------------------------\n// CACHÉ LOCAL'),
  );

  // No debe existir el bloque de título absoluto sobre la imagen backdrop
  assert.doesNotMatch(cwCardsSection, /<h3[^>]*>{title}<\/h3>/);
  assert.doesNotMatch(cwCardsSection, /absolute bottom-0 left-0 right-0 p-4/);
  // El enlace accesible mantiene aria-label={title}
  assert.match(cwCardsSection, /aria-label={title}/);
});


