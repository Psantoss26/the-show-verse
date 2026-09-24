import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShareData,
  composeDescription,
  formatRuntime,
  pickShareBackdrop,
  renderShareHtml,
  shareMetadata,
} from "./shareMeta.js";

const img = (file_path, iso_639_1, width = 1920, vote_count = 1) => ({
  file_path, iso_639_1, width, height: Math.round(width * 0.5625), vote_count,
});

test("backdrop con idioma: inglés, luego español, luego sin texto, luego el de por defecto", () => {
  assert.deepEqual(pickShareBackdrop([img("/xx.jpg", null), img("/es.jpg", "es"), img("/en.jpg", "en")], "/d.jpg"), { path: "/en.jpg", lang: "en" });
  assert.deepEqual(pickShareBackdrop([img("/xx.jpg", null), img("/es.jpg", "es")], "/d.jpg"), { path: "/es.jpg", lang: "es" });
  assert.deepEqual(pickShareBackdrop([img("/xx.jpg", null)], "/d.jpg"), { path: "/xx.jpg", lang: null });
  assert.deepEqual(pickShareBackdrop([], "/d.jpg"), { path: "/d.jpg", lang: null });
  assert.equal(pickShareBackdrop([], null), null);
});

test("dentro de un idioma manda la resolución", () => {
  const out = pickShareBackdrop([img("/small.jpg", "en", 800, 50), img("/big.jpg", "en", 3840, 1)]);
  assert.equal(out.path, "/big.jpg");
});

test("descripción: datos básicos + sinopsis, recortada", () => {
  assert.equal(composeDescription(["★ 8,1", "2 h 16 min", ""], "Un hacker descubre la verdad."), "★ 8,1 · 2 h 16 min. Un hacker descubre la verdad.");
  const long = composeDescription(["★ 8"], "palabra ".repeat(80));
  assert.ok(long.length <= 200);
  assert.ok(long.endsWith("…"));
  assert.equal(formatRuntime(136), "2 h 16 min");
  assert.equal(formatRuntime(45), "45 min");
  assert.equal(formatRuntime(0), "");
});

test("película: título con año, tipo y backdrop con idioma a w780", () => {
  const data = buildShareData({
    kind: "movie",
    item: {
      id: 603, title: "Matrix", release_date: "1999-03-30", vote_average: 8.2, runtime: 136,
      genres: [{ name: "Acción" }, { name: "Ciencia ficción" }, { name: "Otro" }],
      overview: "Un hacker descubre la verdad.", backdrop_path: "/def.jpg",
      images: { backdrops: [img("/en.jpg", "en")] },
    },
  });
  assert.equal(data.title, "Matrix (1999)");
  assert.equal(data.path, "/details/movie/603");
  assert.equal(data.ogType, "video.movie");
  assert.equal(data.image.url, "https://image.tmdb.org/t/p/w780/en.jpg");
  assert.match(data.description, /^★ 8,2 · 2 h 16 min · Acción, Ciencia ficción\. Un hacker/);
});

test("temporada y episodio usan el arte de la serie y dicen de qué serie son", () => {
  const show = { id: 1396, name: "Breaking Bad", images: { backdrops: [img("/bb-en.jpg", "en")] }, poster_path: "/p.jpg" };
  const season = buildShareData({ kind: "season", show, seasonNumber: 3, item: { name: "Temporada 3", episodes: [{}, {}], air_date: "2010-03-21" } });
  assert.equal(season.title, "Breaking Bad · Temporada 3");
  assert.equal(season.path, "/details/tv/1396/season/3");
  assert.match(season.description, /2 episodios · 2010/);
  assert.equal(season.image.url, "https://image.tmdb.org/t/p/w780/bb-en.jpg");

  const episode = buildShareData({ kind: "episode", show, seasonNumber: 3, episodeNumber: 7, item: { name: "Un minuto", runtime: 47, still_path: "/still.jpg" } });
  assert.equal(episode.title, "Breaking Bad · T3·E07 · Un minuto");
  assert.equal(episode.ogType, "video.episode");
  assert.equal(episode.path, "/details/tv/1396/season/3/episode/7");
  assert.equal(episode.image.url, "https://image.tmdb.org/t/p/w780/bb-en.jpg");

  // Sin arte de la serie: la imagen del propio episodio.
  const bare = buildShareData({ kind: "episode", show: { id: 1, name: "X" }, seasonNumber: 1, episodeNumber: 1, item: { still_path: "/still.jpg" } });
  assert.equal(bare.image.url, "https://image.tmdb.org/t/p/w780/still.jpg");
});

test("HTML para rastreadores: una sola og:image, escapado y con redirección", () => {
  const html = renderShareHtml(
    { title: 'A "B" <C>', description: "d", path: "/details/movie/1", ogType: "video.movie", image: { url: "https://i/x.jpg", width: 780, height: 439 } },
    "https://theshowverse.com",
  );
  assert.equal((html.match(/property="og:image"/g) || []).length, 1);
  assert.match(html, /A &quot;B&quot; &lt;C&gt;/);
  assert.match(html, /og:url" content="https:\/\/theshowverse.com\/details\/movie\/1"/);
  assert.match(html, /http-equiv="refresh" content="0;url=https:\/\/theshowverse.com\/details\/movie\/1"/);
});

test("metadata de Next con openGraph y tarjeta grande", () => {
  const meta = shareMetadata({ title: "T", description: "D", ogType: "video.tv_show", image: { url: "u", width: 780, height: 439 } }, "F");
  assert.equal(meta.openGraph.images[0].url, "u");
  assert.equal(meta.twitter.card, "summary_large_image");
  assert.deepEqual(shareMetadata(null, "F"), { title: "F" });
});
