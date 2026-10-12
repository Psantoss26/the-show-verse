import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchLetterboxdFeed,
  nextSeenGuids,
  nextSeenRatings,
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
  <letterboxd:memberLike>Yes</letterboxd:memberLike>
  <tmdb:movieId>194</tmdb:movieId>
  <description><![CDATA[ <p><img src="https://a.ltrbxd.com/amelie.jpg"/></p> <p><em>This review may contain spoilers.</em></p> <p>Preciosa.<br />Otra vez.</p> ]]></description>
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
  <description>&lt;p&gt;&lt;img src="x"/&gt;&lt;/p&gt; &lt;p&gt;Watched on Monday January 1, 2024.&lt;/p&gt;</description>
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
    liked: true,
    review: { body: 'Preciosa.\nOtra vez.', spoiler: true },
    publishedAt: '2024-01-02T08:00:00.000Z',
  });
  assert.equal(items[1].rating, null);
  assert.equal(items[1].rewatch, false);
  assert.equal(items[1].liked, false);
  assert.equal(items[1].review, null);
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

test('detecta notas editadas en entradas que siguen en el feed', () => {
  const before = [
    { guid: 'a', tmdbId: 1, rating: 6, publishedAt: '2024-01-01T00:00:00.000Z' },
    { guid: 'b', tmdbId: 2, rating: null, publishedAt: '2024-01-02T00:00:00.000Z' },
  ];
  const seenRatings = nextSeenRatings(before);
  assert.deepEqual(seenRatings, { a: 6, b: null });
  const after = [
    { guid: 'a', tmdbId: 1, rating: 8, publishedAt: '2024-01-01T00:00:00.000Z' }, // editada
    { guid: 'b', tmdbId: 2, rating: null, publishedAt: '2024-01-02T00:00:00.000Z' }, // igual
    { guid: 'c', tmdbId: 3, rating: 4, publishedAt: '2024-01-03T00:00:00.000Z' }, // nueva
  ];
  const { fresh, edited, ratings } = pendingLetterboxdEntries(after, ['a', 'b'], seenRatings);
  assert.deepEqual(fresh.map((item) => item.guid), ['c']);
  assert.deepEqual(edited.map((item) => item.guid), ['a']);
  assert.deepEqual(ratings.map((item) => [item.tmdbId, item.rating]).sort(), [[1, 8], [3, 4]]);
  // Sin notas recordadas (cuentas antiguas): no hay ediciones que detectar.
  assert.equal(pendingLetterboxdEntries(after, ['a', 'b']).edited.length, 0);
});

test('reseñas largas se recortan al máximo de la app', async () => {
  const { parseLetterboxdReview, LETTERBOXD_REVIEW_MAX } = await import('./letterboxdRss.js');
  const review = parseLetterboxdReview(`<p>${'a'.repeat(3000)}</p>`);
  assert.equal(review.body.length, LETTERBOXD_REVIEW_MAX);
  assert.ok(review.body.endsWith('…'));
});

test('reseñas: nuevas, editadas y borradas aquí', async () => {
  const { pendingLetterboxdReviews, letterboxdReviewHash } = await import('./letterboxdRss.js');
  const a = { guid: 'a', review: { body: 'Uno', spoiler: false } };
  const b = { guid: 'b', review: { body: 'Dos (editada)', spoiler: false } };
  const c = { guid: 'c', review: { body: 'Tres', spoiler: true } };
  const d = { guid: 'd', review: null };
  const state = {
    b: { id: 'cb', hash: letterboxdReviewHash({ body: 'Dos', spoiler: false }) },
    c: { id: null, hash: letterboxdReviewHash(c.review) }, // borrada en The Show Verse
  };
  const { create, update } = pendingLetterboxdReviews([a, b, c, d], state);
  assert.deepEqual(create.map((item) => item.guid), ['a']);
  assert.deepEqual(update.map((entry) => [entry.item.guid, entry.commentId]), [['b', 'cb']]);
});

test('me gusta: una vez por entrada', async () => {
  const { pendingLetterboxdLikes } = await import('./letterboxdRss.js');
  const items = [
    { guid: 'a', liked: true },
    { guid: 'b', liked: false },
    { guid: 'c', liked: true },
  ];
  assert.deepEqual(pendingLetterboxdLikes(items, ['a']).map((item) => item.guid), ['c']);
});
