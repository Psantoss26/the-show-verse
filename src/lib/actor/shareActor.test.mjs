import assert from "node:assert/strict";
import test from "node:test";

import { buildActorShare, departmentLabel, uniqueCredits } from "./shareActor.js";
import { listStorySceneIds, sanitizeListShareCard } from "../lists/shareList.js";

const person = {
  name: "Pedro Pascal",
  profile_path: "/pedro.jpg",
  known_for_department: "Acting",
};

const credit = (id, extra = {}) => ({
  id,
  media_type: "movie",
  title: `Película ${id}`,
  poster_path: `/p${id}.jpg`,
  vote_average: 7,
  vote_count: 500,
  ...extra,
});

test("translates the known-for department", () => {
  assert.equal(departmentLabel("Acting"), "Interpretación");
  assert.equal(departmentLabel("Directing"), "Dirección");
  assert.equal(departmentLabel("Something"), "Something");
  assert.equal(departmentLabel(""), "Persona");
});

test("counts each title once even with several credits", () => {
  const credits = [credit(1), credit(1, { kind: "crew" }), credit(1, { media_type: "tv" }), credit(2)];
  assert.equal(uniqueCredits(credits).length, 3);
});

test("builds a list-style card with the profile photo as cover", () => {
  const knownFor = [credit(10), credit(11, { media_type: "tv", name: "Serie", title: undefined })];
  const { card } = buildActorShare({
    person,
    credits: [credit(1), credit(1, { kind: "crew" }), credit(2)],
    knownFor,
    careerYears: "1996 - 2026",
  });
  const clean = sanitizeListShareCard(card);
  assert.equal(clean.title, "Pedro Pascal");
  assert.equal(clean.label, "Interpretación");
  assert.equal(clean.coverPath, "/pedro.jpg");
  assert.equal(clean.layout, "cover");
  assert.equal(clean.count, 2);
  assert.deepEqual(clean.meta, ["1996 - 2026"]);
  assert.deepEqual(clean.preview.map((item) => item.posterPath), ["/p10.jpg", "/p11.jpg"]);
  assert.deepEqual(card.preview.map((item) => item.mediaType), ["movie", "tv"]);
});

test("drops an empty career range and low-vote titles from the video ranking", () => {
  const credits = [credit(1, { vote_count: 2, vote_average: 10 }), credit(2), credit(3)];
  const { card, story } = buildActorShare({
    person,
    biography: "Actor chileno-estadounidense.",
    credits,
    careerYears: "—",
    score: (item) => Number(item.id),
    facts: [
      { icon: "film", label: "Películas", value: "3" },
      { icon: "calendar", label: "Trayectoria", value: "1996 - 2026" },
    ],
  });
  assert.deepEqual(card.meta, []);
  assert.deepEqual(story.items.map((item) => item.id), [3, 2]);
  assert.ok(!story.top.some((item) => item.id === 1));
  assert.deepEqual(listStorySceneIds(card, story), ["top", "stats", "about"]);
});
