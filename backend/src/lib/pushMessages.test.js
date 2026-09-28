import assert from 'node:assert/strict';
import test from 'node:test';
import { alertUrl, buildPushMessages } from './pushMessages.js';

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const ago = (minutes) => new Date(NOW - minutes * 60_000).toISOString();

test('push: visto automático y su recordatorio van en UNA notificación', () => {
  const messages = buildPushMessages({
    events: [{ id: 'auto:1', type: 'auto_watched', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, title: 'Juego de tronos', posterPath: '/p.jpg', createdAt: ago(1) }],
    reminders: [{ id: 'r1', type: 'reminder', level: 'episode', tmdbId: 1399, mediaType: 'tv', season: 1, episode: 3, title: 'Juego de tronos', createdAt: ago(1), needsRating: true, needsReview: false }],
  }, { now: NOW });
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].alertIds, ['auto:1', 'r1']);
  assert.equal(messages[0].title, 'Juego de tronos');
  assert.equal(messages[0].body, 'Has terminado S01E03. Puntúa el episodio S01E03');
  assert.equal(messages[0].url, '/details/tv/1399/season/1/episode/3');
  assert.equal(messages[0].image, 'https://image.tmdb.org/t/p/w342/p.jpg');
  assert.equal(messages[0].tag, 'tsv:tv:1399');
});

test('push: textos de película, temporada y serie', () => {
  const reminders = [
    { id: 'm', level: 'movie', tmdbId: 603, mediaType: 'movie', title: 'Matrix', createdAt: ago(3), needsRating: true, needsReview: true },
    { id: 's', level: 'season', tmdbId: 1, mediaType: 'tv', season: 2, episode: null, title: 'A', createdAt: ago(2), needsRating: true, needsReview: false },
    { id: 'w', level: 'show', tmdbId: 2, mediaType: 'tv', season: null, episode: null, title: 'B', createdAt: ago(1), needsRating: false, needsReview: true },
  ];
  const bodies = buildPushMessages({ reminders }, { now: NOW }).map((m) => [m.body, m.url]);
  assert.deepEqual(bodies, [
    ['Puntúa y reseña la película', '/details/movie/603'],
    ['Puntúa la temporada 2', '/details/tv/1/season/2'],
    ['Escribe tu reseña', '/details/tv/2'],
  ]);
});

test('push: ni alertas viejas ni ya enviadas', () => {
  const events = [
    { id: 'old', type: 'show_completed', tmdbId: 1, mediaType: 'tv', createdAt: ago(60) },
    { id: 'sent', type: 'cw_added', tmdbId: 2, mediaType: 'tv', season: 1, episode: 1, platform: 'netflix', createdAt: ago(1) },
    { id: 'new', type: 'cw_added', tmdbId: 3, mediaType: 'movie', platform: 'primevideo', createdAt: ago(1) },
  ];
  const messages = buildPushMessages({ events }, { now: NOW, delivered: new Set(['sent']) });
  assert.deepEqual(messages.map((m) => m.alertIds), [['new']]);
  assert.equal(messages[0].body, 'Añadida a Continuar viendo · Prime Video');
});

test('push: url de la ficha', () => {
  assert.equal(alertUrl({ tmdbId: 5, mediaType: 'tv' }), '/details/tv/5');
  assert.equal(alertUrl({ tmdbId: 0, mediaType: 'tv' }), '/');
});
