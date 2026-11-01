import test from "node:test";
import assert from "node:assert/strict";

import {
  createCinemaPlatformItems,
  describeCinemaStatus,
  formatCinemaDate,
  mapCinemaOffers,
  pickSpainTheatricalDate,
  resolveCinemaStatus,
  todayInMadrid,
} from "./cinema.js";

const offer = (packageId, clearName, standardWebURL, monetizationType = "CINEMA") => ({
  monetizationType,
  standardWebURL,
  package: { packageId, clearName, icon: `/icon/1/s100/${clearName.toLowerCase()}.png` },
});

test("keeps one entry per cinema chain, aggregator last, ignoring streaming offers", () => {
  const chains = mapCinemaOffers([
    offer(1970, "Entradas", "https://cine.entradas.com/pelicula/x"),
    offer(2124, "Cinesa", "https://www.cinesa.es/peliculas/x/1/"),
    offer(2124, "Cinesa", "https://www.cinesa.es/peliculas/x/2/"),
    offer(8, "Netflix", "https://www.netflix.com/title/1", "FLATRATE"),
    offer(2127, "Cine Yelmo", "http://www.yelmocines.es/sinopsis/x"),
  ]);

  assert.deepEqual(chains.map((c) => c.name), ["Cinesa", "Cine Yelmo", "Entradas"]);
  assert.equal(chains[0].url, "https://www.cinesa.es/peliculas/x/1/");
  assert.equal(chains[1].url, "https://www.yelmocines.es/sinopsis/x");
  assert.equal(chains[0].icon, "https://images.justwatch.com/icon/1/s100/cinesa.png");
  assert.equal(chains[2].isAggregator, true);
});

test("drops offers without a usable link", () => {
  assert.deepEqual(mapCinemaOffers([offer(2124, "Cinesa", "javascript:alert(1)")]), []);
  assert.deepEqual(mapCinemaOffers(null), []);
});

test("uses the Spanish theatrical date, falling back to limited release", () => {
  const results = [
    { iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2026-12-11T00:00:00.000Z" }] },
    {
      iso_3166_1: "ES",
      release_dates: [
        { type: 4, release_date: "2027-03-01T00:00:00.000Z" },
        { type: 3, release_date: "2026-12-18T00:00:00.000Z" },
        { type: 2, release_date: "2026-11-20T00:00:00.000Z" },
      ],
    },
  ];
  assert.equal(pickSpainTheatricalDate(results), "2026-12-18");
  assert.equal(
    pickSpainTheatricalDate([{ iso_3166_1: "ES", release_dates: [{ type: 2, release_date: "2026-11-20T00:00:00.000Z" }] }]),
    "2026-11-20",
  );
  assert.equal(pickSpainTheatricalDate([]), null);
});

test("cinema offers before the Spanish release are a pre-sale, not 'in theaters'", () => {
  const chains = mapCinemaOffers([
    offer(2124, "Cinesa", "https://www.cinesa.es/peliculas/x/"),
    offer(1970, "Entradas", "https://cine.entradas.com/pelicula/x"),
  ]);

  const upcoming = resolveCinemaStatus({ chains, releaseDate: "2026-12-18" }, "2026-11-01");
  assert.equal(upcoming.status, "upcoming");
  assert.equal(upcoming.href, "https://cine.entradas.com/pelicula/x");

  assert.equal(resolveCinemaStatus({ chains, releaseDate: "2026-11-01" }, "2026-11-01").status, "now");
  assert.equal(resolveCinemaStatus({ chains, releaseDate: null }, "2026-11-01").status, "now");
  assert.equal(resolveCinemaStatus({ chains: [], releaseDate: null }, "2026-11-01"), null);
  assert.equal(resolveCinemaStatus(null), null);
});

test("today is computed in Madrid time", () => {
  // 23:30 UTC del 31 de octubre ya es 1 de noviembre en Madrid (UTC+1).
  assert.equal(todayInMadrid(new Date("2026-10-31T23:30:00Z")), "2026-11-01");
});

test("describes pre-sales with the Spanish release date", () => {
  const chains = mapCinemaOffers([
    offer(2124, "Cinesa", "https://www.cinesa.es/peliculas/x/"),
    offer(1970, "Entradas", "https://cine.entradas.com/pelicula/x"),
  ]);
  assert.equal(formatCinemaDate("2026-12-18"), "18 dic");
  const upcoming = resolveCinemaStatus({ chains, releaseDate: "2026-12-18" }, "2026-11-01");
  assert.deepEqual(describeCinemaStatus(upcoming), { label: "En cines el 18 dic", detail: "Preventa · Cinesa" });
  const now = resolveCinemaStatus({ chains, releaseDate: "2026-10-01" }, "2026-11-01");
  assert.deepEqual(describeCinemaStatus(now), { label: "En cines", detail: "Cinesa" });
  assert.deepEqual(createCinemaPlatformItems(now).map((i) => i.title), ["Cinesa", "Entradas"]);
  assert.equal(describeCinemaStatus(null), null);
});
