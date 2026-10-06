import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLAG_FAVORITE,
  FLAG_RATED,
  FLAG_WATCHED,
  FLAG_WATCHLIST,
  mergeTitleRecords,
  packNeuralGraph,
  pickTitleMeta,
  unifyGenres,
} from './neuralGraphCore.js';

test('géneros: los de series se unifican con los de cine', () => {
  assert.deepEqual(unifyGenres([{ id: 10759 }, { id: 18 }]), [28, 12, 18]);
  assert.deepEqual(unifyGenres([{ id: 10765 }, { id: 878 }]), [878, 14]);
  assert.deepEqual(unifyGenres([{ id: 10770 }, { id: 99999 }]), []);
});

test('registros: un título por tipo e id, con todas sus marcas', () => {
  const titles = mergeTitleRecords({
    history: [
      { tmdbId: 1, mediaType: 'tv', plays: 5, title: 'Dark', lastAt: '2026-01-01' },
    ],
    ratings: [{ tmdbId: 1, mediaType: 'tv', rating: 9 }],
    favorites: [{ tmdbId: 1, mediaType: 'tv', posterPath: '/d.jpg' }],
    watchlist: [{ tmdbId: 1, mediaType: 'movie' }, { tmdbId: 0, mediaType: 'movie' }],
  });
  assert.equal(titles.size, 2);
  const dark = titles.get('tv:1');
  assert.equal(dark.plays, 5);
  assert.equal(dark.rating, 9);
  assert.equal(dark.posterPath, '/d.jpg');
  assert.equal(dark.flags, FLAG_WATCHED | FLAG_RATED | FLAG_FAVORITE);
  assert.equal(titles.get('movie:1').flags, FLAG_WATCHLIST);
});

test('grafo compacto: géneros y sagas por índice; sagas solo con dos títulos', () => {
  const titles = mergeTitleRecords({
    history: [
      { tmdbId: 10, mediaType: 'movie', plays: 1 },
      { tmdbId: 11, mediaType: 'movie', plays: 2 },
      { tmdbId: 12, mediaType: 'movie', plays: 1 },
      { tmdbId: 20, mediaType: 'tv', plays: 8 },
    ],
  });
  const saga = { id: 555, name: 'El Señor de los Anillos - Colección' };
  const meta = new Map([
    ['movie:10', pickTitleMeta({ title: 'LOTR 1', release_date: '2001-12-19', genres: [{ id: 12 }, { id: 14 }], belongs_to_collection: saga })],
    ['movie:11', pickTitleMeta({ title: 'LOTR 2', release_date: '2002-12-18', genres: [{ id: 12 }], belongs_to_collection: saga })],
    ['movie:12', pickTitleMeta({ title: 'Solo', genres: [{ id: 28 }], belongs_to_collection: { id: 9, name: 'Otra' } })],
  ]);
  const graph = packNeuralGraph(titles, meta);
  assert.equal(graph.missing, 1); // tv:20 sin metadatos
  assert.deepEqual(graph.genres.map(([, name]) => name), ['Aventura', 'Fantasía', 'Acción']);
  assert.deepEqual(graph.sagas, [[555, 'El Señor de los Anillos']]);
  const [lotr1, lotr2, solo, series] = graph.titles;
  assert.deepEqual(lotr1.slice(0, 10), [10, 0, 'LOTR 1', '', 2001, [0, 1], 0, 1, 0, FLAG_WATCHED]);
  assert.equal(lotr2[6], 0);
  assert.equal(solo[6], -1); // saga de un solo título: sin hub
  assert.deepEqual(series.slice(0, 2), [20, 1]);
  assert.deepEqual(series[5], []);
});

test('grafo compacto: meses de visionado, listas, presupuesto, recaudación y nota de TMDb', () => {
  const titles = mergeTitleRecords({
    history: [
      { tmdbId: 1, mediaType: 'movie', plays: 2, months: [202403, 202311, 202403, null] },
      { tmdbId: 2, mediaType: 'tv', plays: 1, months: [202501] },
    ],
    watchlist: [{ tmdbId: 3, mediaType: 'movie' }],
  });
  assert.deepEqual(titles.get('movie:1').months, [202311, 202403]);
  const meta = new Map([
    ['movie:1', { name: 'A', genres: [], budget: 63000000, revenue: 101000000, vote: 8.44 }],
    ['tv:2', { name: 'B', genres: [], budget: 5, revenue: 5, vote: 7 }],
  ]);
  const packed = packNeuralGraph(titles, meta, [
    { id: 'l1', name: 'Favoritas de siempre', kind: 'own', keys: new Set(['movie:1', 'tv:2', 'movie:999']) },
    { id: 'c1', name: 'Clásicos', kind: 'community', keys: new Set(['tv:2']) },
    { id: 'empty', name: 'Sin títulos míos', kind: 'own', keys: new Set(['movie:999']) },
  ]);
  // Solo las listas que reúnen algún título del usuario.
  assert.deepEqual(packed.lists, [['l1', 'Favoritas de siempre', 'own'], ['c1', 'Clásicos', 'community']]);
  const [movie, show, pending] = packed.titles;
  assert.deepEqual(movie.slice(10), [[202311, 202403], [0], 63000000, 101000000, 8.4]);
  // Las series no tienen presupuesto ni recaudación.
  assert.deepEqual(show.slice(10), [[202501], [0, 1], 0, 0, 7]);
  assert.deepEqual(pending.slice(10), [[], [], 0, 0, 0]);
});

test('metadatos: presupuesto, recaudación y nota de TMDb (sin votos, sin nota)', () => {
  assert.deepEqual(
    pickTitleMeta({ title: 'X', budget: 10, revenue: 20, vote_average: 7.5, vote_count: 3 }),
    { name: 'X', posterPath: null, date: null, genres: [], collection: null, budget: 10, revenue: 20, vote: 7.5 },
  );
  assert.equal(pickTitleMeta({ title: 'Y', vote_average: 9, vote_count: 0 }).vote, 0);
});
