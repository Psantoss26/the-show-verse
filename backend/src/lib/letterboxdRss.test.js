import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchLetterboxdFeed,
  nextSeenGuids,
  normalizeLetterboxdUsername,
  parseLetterboxdRss,
  pendingLetterboxdEntries,
} from './letterboxdRss.js';

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>Letterboxd - Ana</title>
<item>
  <title>Am&#233;lie, 2001 - ★★★★½</title>
  <link>https://letterboxd.com/ana/film/amelie/</link>
  <guid isPermaLink="false">letterboxd-review-2</guid>
  <pubDate>Tue, 2 Jan 2024 21:00:00 +1300</pubDate>
  <letterboxd:watchedDate>2024-01-02</letterboxd:watchedDate>
  <letterboxd:rewatch>Yes</letterboxd:rewatch>
  <letterboxd:filmTitle><![CDATA[Amélie & co]]></letterboxd:filmTitle>
  <letterboxd:filmYear>2001</letterboxd:filmYear>
  <letterboxd:memberRating>4.5</letterboxd:memberRating>
  <tmdb:movieId>194</tmdb:movieId>
  <description><![CDATA[<p>Hola</p>]]></description>
</item>
<item>
  <title>Heat, 1995</title>
  <guid isPermaLink="false">letterboxd-watch-1</guid>
  <pubDate>Mon, 1 Jan 2024 10:00:00 +0000</pubDate>
  <letterboxd:watchedDate>2024-01-01</letterboxd:watchedDate>
  <letterboxd:rewatch>No</letterboxd:rewatch>
  <letterboxd:filmTitle>Heat</letterboxd:filmTitle>
  <letterboxd:filmYear>1995</letterboxd:filmYear>
  <tmdb:movieId>949</tmdb:movieId>
</item>
<item>
  <title>Mi lista</title>
  <guid isPermaLink="false">letterboxd-list-9</guid>
  <pubDate>Mon, 1 Jan 2024 09:00:00 +0000</pubDate>
</item>
</channel>
</rss>`;

test('normaliza el usuario desde nombre, @ o URL', () => {
  assert.equal(normalizeLetterboxdUsername('  Ana_99 '), 'ana_99');
  assert.equal(normalizeLetterboxdUsername('@ana'), 'ana');
  assert.equal(normalizeLetterboxdUsername('https://letterboxd.com/ana/films/diary/'), 'ana');
  assert.equal(normalizeLetterboxdUsername('ana maría'), null);
  assert.equal(normalizeLetterboxdUsername(''), null);
});

test('parsea las entradas del diario y descarta listas', () => {
  const items = parseLetterboxdRss(FEED);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    guid: 'letterboxd-review-2',
    tmdbId: 194,
    title: 'Amélie & co',
    year: 2001,
    watchedAt: '2024-01-02T12:00:00.000Z',
    rewatch: true,
    rating: 9,
    publishedAt: '2024-01-02T08:00:00.000Z',
  });
  assert.equal(items[1].rating, null);
  assert.equal(items[1].rewatch, false);
});

test('solo procesa entradas nuevas y la puntuación más reciente de cada película', () => {
  const items = [
    { guid: 'a', tmdbId: 1, rating: 6, publishedAt: '2024-01-01T00:00:00.000Z' },
    { guid: 'b', tmdbId: 1, rating: 8, publishedAt: '2024-02-01T00:00:00.000Z' },
    { guid: 'c', tmdbId: 2, rating: 10, publishedAt: '2024-01-01T00:00:00.000Z' },
  ];
  const { fresh, ratings } = pendingLetterboxdEntries(items, ['c']);
  assert.deepEqual(fresh.map((item) => item.guid), ['a', 'b']);
  assert.deepEqual(ratings.map((item) => [item.tmdbId, item.rating]), [[1, 8]]);
  assert.deepEqual(nextSeenGuids(items, ['z', 'a'], 3), ['a', 'b', 'c']);
});

test('errores del feed: usuario inexistente o respuesta no válida', async () => {
  const notFound = async () => new Response('nope', { status: 404 });
  await assert.rejects(fetchLetterboxdFeed('ana', { fetchImpl: notFound }), { code: 'not_found' });
  const html = async () => new Response('<html></html>', { status: 200 });
  await assert.rejects(fetchLetterboxdFeed('ana', { fetchImpl: html }), { code: 'unavailable' });
  const ok = async () => new Response(FEED, { status: 200 });
  assert.equal((await fetchLetterboxdFeed('ana', { fetchImpl: ok })).length, 2);
});
