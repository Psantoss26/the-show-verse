import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLetterboxdProfileImport,
  collectLetterboxdProfile,
  parseDiaryPage,
  parseFilmPage,
  parseFilmsPage,
} from './letterboxdProfile.js';

// Diario con el marcado clásico (data-film-*, td-released, rateit-field).
const DIARY_CLASSIC = `
<table id="diary-table"><tbody>
<tr class="diary-entry-row viewing-poster-container" data-viewing-id="1">
  <td class="td-calendar"><div class="date"><a href="/ana/films/diary/for/2024/01/">Jan</a></div></td>
  <td class="td-day diary-day center"><a href="/ana/films/diary/for/2024/01/02/">02</a></td>
  <td class="td-film-details"><div class="really-lazy-load poster film-poster" data-film-id="51568" data-film-slug="amelie" data-film-name="Am&eacute;lie"></div>
    <h3 class="headline-3 prettify"><a href="/ana/film/amelie/">Amélie</a></h3></td>
  <td class="td-released center"><span>2001</span></td>
  <td class="td-rating rating-green"><div class="hide-for-owner"><span class="rating rated-9">★★★★½</span></div>
    <input type="hidden" class="rateit-field" value="9" /></td>
  <td class="td-rewatch center icon-status-off"></td>
</tr>
<tr class="diary-entry-row viewing-poster-container" data-viewing-id="2">
  <td class="td-day diary-day center"><a href="/ana/films/diary/for/2023/12/31/">31</a></td>
  <td class="td-film-details"><div class="poster film-poster" data-film-slug="heat"></div>
    <h3 class="headline-3 prettify"><a href="/ana/film/heat/">Heat</a></h3></td>
  <td class="td-released center"><span>1995</span></td>
  <td class="td-rating"><input type="hidden" class="rateit-field" value="0" /></td>
</tr>
</tbody></table>
<a class="next" href="/ana/films/diary/page/2/">Older</a>`;

// Marcado actual (componentes React con data-item-*).
const DIARY_MODERN = `
<tr class="diary-entry-row" data-viewing-id="3">
  <td class="col-daydate"><a class="daydate" href="/ana/films/diary/for/2022/05/09/">9</a></td>
  <td class="col-production"><div class="react-component" data-component-class="LazyPoster" data-item-slug="the-matrix" data-item-name="The Matrix (1999)" data-item-link="/film/the-matrix/"></div></td>
  <td class="col-rating"><span class="rating -green rated-10">★★★★★</span></td>
</tr>`;

const FILMS = `
<ul class="grid">
  <li class="poster-container"><div class="film-poster" data-film-slug="amelie"><img alt="Amélie" /></div><p class="poster-viewingdata"><span class="rating -tiny -darker rated-8">★★★★</span></p></li>
  <li class="griditem"><div class="react-component" data-item-slug="the-godfather" data-item-name="The Godfather (1972)"></div></li>
  <li class="griditem"><div data-item-slug="some-show" data-item-name="Some Show (2020)"></div><span class="rating rated-6"></span></li>
</ul>`;

test('lee el diario con el marcado clásico y el actual', () => {
  assert.deepEqual(parseDiaryPage(DIARY_CLASSIC), [
    { slug: 'amelie', title: 'Amélie', year: 2001, watchedAt: '2024-01-02T12:00:00.000Z', rating: 9 },
    { slug: 'heat', title: 'Heat', year: 1995, watchedAt: '2023-12-31T12:00:00.000Z', rating: null },
  ]);
  assert.deepEqual(parseDiaryPage(DIARY_MODERN), [
    { slug: 'the-matrix', title: 'The Matrix', year: 1999, watchedAt: '2022-05-09T12:00:00.000Z', rating: 10 },
  ]);
});

test('lee la rejilla de películas vistas', () => {
  assert.deepEqual(parseFilmsPage(FILMS), [
    { slug: 'amelie', title: 'Amélie', year: null, rating: 8 },
    { slug: 'the-godfather', title: 'The Godfather', year: 1972, rating: null },
    { slug: 'some-show', title: 'Some Show', year: 2020, rating: 6 },
  ]);
});

test('saca el id de TMDb de la ficha', () => {
  assert.deepEqual(
    parseFilmPage('<head><meta property="og:title" content="The Godfather (1972)" /></head><body class="film backdropped" data-tmdb-type="movie" data-tmdb-id="238">'),
    { tmdbId: 238, mediaType: 'movie', year: 1972 },
  );
  assert.deepEqual(parseFilmPage('<a href="https://www.themoviedb.org/tv/1399/">TMDB</a>'), { tmdbId: 1399, mediaType: 'tv', year: null });
  assert.equal(parseFilmPage('<html></html>'), null);
});

test('recorre todas las páginas y para al acabar', async () => {
  const pages = {
    'https://letterboxd.com/ana/films/diary/': DIARY_CLASSIC,
    'https://letterboxd.com/ana/films/diary/page/2/': DIARY_MODERN,
    'https://letterboxd.com/ana/films/': FILMS,
  };
  const fetchImpl = async (url) =>
    pages[url] ? new Response(pages[url], { status: 200 }) : new Response('', { status: 404 });
  const profile = await collectLetterboxdProfile('ana', { fetchImpl, delayMs: 0 });
  assert.equal(profile.diary.length, 3);
  assert.equal(profile.films.length, 3);

  await assert.rejects(collectLetterboxdProfile('nadie', { fetchImpl, delayMs: 0 }), { code: 'not_found' });
});

test('perfil sin nada reconocible: error, no un historial vacío', async () => {
  const fetchImpl = async () => new Response('<html><body>Nada</body></html>', { status: 200 });
  await assert.rejects(collectLetterboxdProfile('ana', { fetchImpl, delayMs: 0 }), { code: 'empty' });
});

test('bloqueo de Letterboxd: error claro', async () => {
  const fetchImpl = async () => new Response('', { status: 403 });
  await assert.rejects(collectLetterboxdProfile('ana', { fetchImpl, delayMs: 0 }), { code: 'blocked' });
});

test('diario como visionados, vistas sin diario por año y nota actual de la rejilla', () => {
  const resolved = new Map([
    ['amelie', { tmdbId: 194, mediaType: 'movie', year: 2001 }],
    ['heat', { tmdbId: 949, mediaType: 'movie', year: 1995 }],
    ['the-matrix', { tmdbId: 603, mediaType: 'movie', year: 1999 }],
    ['the-godfather', { tmdbId: 238, mediaType: 'movie', year: 1972 }],
    ['some-show', { tmdbId: 1399, mediaType: 'tv', year: 2020 }],
  ]);
  const { history, ratings } = buildLetterboxdProfileImport(
    { diary: [...parseDiaryPage(DIARY_CLASSIC), ...parseDiaryPage(DIARY_MODERN)], films: parseFilmsPage(FILMS) },
    resolved,
  );
  assert.deepEqual(
    history.map((item) => [item.tmdbId, item.watchedAt.slice(0, 10), item.undated]),
    [
      [194, '2024-01-02', false],
      [949, '2023-12-31', false],
      [603, '2022-05-09', false],
      [238, '1972-01-01', true],
    ],
  );
  assert.deepEqual(
    ratings.map((item) => [item.tmdbId, item.rating, item.ratedAt?.slice(0, 10) ?? null]),
    [
      [194, 8, '2024-01-02'], // la nota actual (rejilla) gana a la del diario
      [603, 10, '2022-05-09'],
    ],
  );
});
