import test from "node:test";
import assert from "node:assert/strict";
import { audienceScoreBadge, parseMetacriticScores, parseRottenTomatoesScores } from "./ratingScores.js";

const scorecard = (data) => `<script id="media-scorecard-json" data-json="mediaScorecard" type="application/json">${JSON.stringify(data)}</script>`;
const mcBlock = (score, count) => `<a data-testid="global-score-review-count-link" href="/movie/x/user-reviews/" rel="follow"><!--[-->Based on ${count} User Ratings<!--]--></a>`
  + `<div aria-label="User score ${score} out of 10"></div>`;
const userReview = (score) => `<div class="review"><div aria-label="User score ${score} out of 10"></div></div>`;

test("Rotten Tomatoes: Popcornmeter en escala 10 y recuento en tramo", () => {
  const html = scorecard({ audienceScore: { scorePercent: "91%", bandedRatingCount: "250,000+ Ratings" }, criticsScore: { scorePercent: "86%" } });
  assert.deepEqual(parseRottenTomatoesScores(html), { audienceScore: 9.1, audienceCount: 250000, audienceCountBanded: true });
  const noCount = scorecard({ audienceScore: { scorePercent: "100%", bandedRatingCount: "Fewer than 50 Ratings" } });
  assert.deepEqual(parseRottenTomatoesScores(noCount), { audienceScore: 10, audienceCount: null, audienceCountBanded: true });
});

test("Rotten Tomatoes: sin Popcornmeter o con datos rotos no hay nota", () => {
  assert.equal(parseRottenTomatoesScores(""), null);
  assert.equal(parseRottenTomatoesScores(scorecard({ audienceScore: { scorePercent: "" } })), null);
  assert.equal(parseRottenTomatoesScores(scorecard({ audienceScore: { scorePercent: "250%" } })), null);
  assert.equal(parseRottenTomatoesScores('<script data-json="mediaScorecard">{roto</script>'), null);
});

test("Metacritic: User Score y recuento, repetidos de escritorio y móvil", () => {
  const html = userReview(3) + mcBlock("9.4", "3,666") + mcBlock("9.4", "3,666") + userReview(10);
  assert.deepEqual(parseMetacriticScores(html), { audienceScore: 9.4, audienceCount: 3666, audienceCountBanded: false });
  assert.deepEqual(parseMetacriticScores(mcBlock("7", "12")), { audienceScore: 7, audienceCount: 12, audienceCountBanded: false });
});

test("Metacritic: sin nota (tbd), solo reseñas sueltas o bloques contradictorios no hay nota", () => {
  assert.equal(parseMetacriticScores("<div>tbd</div>"), null);
  assert.equal(parseMetacriticScores(userReview(10)), null);
  assert.equal(parseMetacriticScores(mcBlock("null", "10")), null);
  assert.equal(parseMetacriticScores(mcBlock("9.4", "10") + mcBlock("8.1", "10")), null);
});

test("insignia: un decimal, sin % y recuento con + si es tramo", () => {
  assert.deepEqual(audienceScoreBadge({ audienceScore: 9, audienceCount: 250000, audienceCountBanded: true }, "u"), { value: "9.0", sub: "250K+", href: "u" });
  assert.deepEqual(audienceScoreBadge({ audienceScore: 8.8, audienceCount: null, audienceCountBanded: false }), { value: "8.8", sub: undefined, href: undefined });
  assert.equal(audienceScoreBadge(null), null);
});
