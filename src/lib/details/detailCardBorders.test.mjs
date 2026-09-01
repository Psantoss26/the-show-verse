import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const detailsClient = readFileSync(
  new URL("../../components/DetailsClient.jsx", import.meta.url),
  "utf8",
);

test("las tarjetas de las secciones no dibujan contornos al hacer hover", () => {
  assert.doesNotMatch(detailsClient, /hover:after:shadow-\[inset/);
});

test("la imagen seleccionada conserva su indicador verde", () => {
  assert.match(
    detailsClient,
    /isActive[\s\S]*?after:shadow-\[inset_0_0_0_2px_rgba\(52,211,153,1\)\]/,
  );
});

test("DetailsClient conserva indicadores visibles para el foco de teclado", () => {
  assert.match(detailsClient, /focus-visible:(?:outline|ring)-/);
});

test("premios conserva su elevación y vídeos limita el hover a la imagen", () => {
  const awardCard = detailsClient.slice(
    detailsClient.indexOf("function AwardCard"),
    detailsClient.indexOf("function SectionTitle"),
  );
  const videoCards = detailsClient.slice(
    detailsClient.indexOf("SECCIÓN: TRÁILER Y VÍDEOS"),
    detailsClient.indexOf("key={`${id}-soundtrack-"),
  );
  const soundtrackCards = detailsClient.slice(
    detailsClient.indexOf("key={`${id}-soundtrack-"),
    detailsClient.indexOf('id="section-sentiment"'),
  );

  assert.match(
    detailsClient,
    /const pointerCardHoverEnabled = supportsHover && !isMobileViewport/,
  );
  assert.match(awardCard, /hover:-translate-y-1 hover:brightness-110/);
  assert.match(awardCard, /group-hover:scale-110/);
  assert.doesNotMatch(videoCards, /hover:-translate-y-1/);
  assert.doesNotMatch(videoCards, /hover:brightness-110/);
  assert.match(videoCards, /group-hover:scale-\[1\.05\]/);
  assert.match(videoCards, /group-hover:scale-105/);
  assert.match(soundtrackCards, /group-hover:scale-\[1\.05\]/);
  assert.match(soundtrackCards, /group-hover:scale-105/);
  assert.doesNotMatch(videoCards, /hover:after:shadow-\[inset/);
});

test("los iconos centrales de vídeo y música no dibujan aros", () => {
  const mediaRows = detailsClient.slice(
    detailsClient.indexOf("SECCIÓN: TRÁILER Y VÍDEOS"),
    detailsClient.indexOf('id="section-sentiment"'),
  );

  assert.match(mediaRows, /<Play className=/);
  assert.match(mediaRows, /<Music2 className=/);
  assert.doesNotMatch(
    mediaRows,
    /w-14 h-14 rounded-full bg-yellow-400\/(?:10|15) border/,
  );
});
