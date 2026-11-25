import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCommunityRatings,
  ratingBucket,
  formatCommunityAverage,
  formatVoteCount,
} from "./communityRatings.js";

test("normaliza a 10 barras con su cuota y su altura relativa a la mayor", () => {
  const out = normalizeCommunityRatings({
    count: 4,
    average: 8.25,
    histogram: [
      { score: 8, count: 1 },
      { score: 9, count: 2 },
      { score: 10, count: 1 },
    ],
  });
  assert.equal(out.count, 4);
  assert.equal(out.average, 8.25);
  assert.equal(out.bars.length, 10);
  const nine = out.bars.find((b) => b.score === 9);
  assert.equal(nine.count, 2);
  assert.equal(nine.share, 0.5);
  assert.equal(nine.ratio, 1);
  assert.equal(out.bars.find((b) => b.score === 8).ratio, 0.5);
  assert.equal(out.bars.find((b) => b.score === 3).ratio, 0);
});

test("respuesta vacía o rota: cero votos, sin media y barras a cero", () => {
  for (const input of [null, undefined, {}, { histogram: "x" }]) {
    const out = normalizeCommunityRatings(input);
    assert.equal(out.count, 0);
    assert.equal(out.average, null);
    assert.equal(out.bars.length, 10);
    assert.ok(out.bars.every((b) => b.count === 0 && b.ratio === 0 && b.share === 0));
  }
});

test("el recuento total sale de las barras si el campo count falta", () => {
  const out = normalizeCommunityRatings({ histogram: [{ score: 7, count: 3 }], average: 7 });
  assert.equal(out.count, 3);
});

test("la nota del deslizador cae en la barra de su entero inferior", () => {
  assert.equal(ratingBucket(9.5), 9);
  assert.equal(ratingBucket(10), 10);
  assert.equal(ratingBucket(1), 1);
  assert.equal(ratingBucket(null), null);
  assert.equal(ratingBucket("x"), null);
});

test("formatos en español", () => {
  assert.equal(formatCommunityAverage(8.25), "8.3");
  assert.equal(formatCommunityAverage(8), "8");
  assert.equal(formatCommunityAverage(10), "10");
  assert.equal(formatCommunityAverage(8.96), "9");
  assert.equal(formatCommunityAverage(null), "–");
  assert.equal(formatVoteCount(1), "1 voto");
  assert.equal(formatVoteCount(0), "0 votos");
  assert.equal(formatVoteCount(12), "12 votos");
  assert.match(formatVoteCount(43500), /^43,5\s?mil votos$/);
});
