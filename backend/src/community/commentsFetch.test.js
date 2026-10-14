import test from 'node:test';
import assert from 'node:assert/strict';
import { collectTitleComments, COMMENTS_MAX_PAGES, COMMENTS_PAGE_SIZE } from './commentsFetch.js';

const comment = (id, likes = 0) => ({ id, comment: `Comentario ${id}`, likes, user: { username: `u${id}` }, created_at: '2026-01-01T00:00:00Z' });

// Trakt simulado: `total` comentarios, 100 por página, con criterios válidos.
function fakeTrakt({ total, fail = new Set() }) {
  const calls = [];
  const getComments = async ({ sort, page, limit }) => {
    calls.push(`${sort}:${page}`);
    if (!['likes', 'newest'].includes(sort)) return { ok: false, items: [] }; // Trakt: 400
    if (fail.has(`${sort}:${page}`)) return { ok: false, items: [] };
    const ids = Array.from({ length: total }, (_, i) => i + 1);
    const ordered = sort === 'newest' ? [...ids].reverse() : ids;
    const items = ordered.slice((page - 1) * limit, page * limit).map((id) => comment(id, total - id));
    return { ok: true, items, pagination: { pageCount: Math.ceil(total / limit) } };
  };
  return { getComments, calls };
}

const args = { type: 'movie', traktId: 383, tmdbId: 489, mediaType: 'movie' };

test('guarda TODOS los comentarios de un título con menos del tope', async () => {
  const trakt = fakeTrakt({ total: 275 });
  const rows = await collectTitleComments({ ...args, getComments: trakt.getComments });
  assert.equal(rows.length, 275);
  // Solo criterios que Trakt admite (likes_30 / added respondían 400).
  assert.ok(trakt.calls.every((call) => /^(likes|newest):/.test(call)));
  assert.equal(new Set(rows.map((row) => row.externalId)).size, rows.length);
});

test('con muchos, hasta el tope por me gusta y además los más recientes', async () => {
  const trakt = fakeTrakt({ total: 2000 });
  const rows = await collectTitleComments({ ...args, getComments: trakt.getComments });
  const byLikes = COMMENTS_MAX_PAGES * COMMENTS_PAGE_SIZE;
  assert.equal(rows.length, byLikes + COMMENTS_PAGE_SIZE);
  // El más reciente (id 2000) está aunque quede fuera del corte por me gusta.
  assert.ok(rows.some((row) => row.externalId === 2000));
  assert.equal(trakt.calls.filter((call) => call.startsWith('likes:')).length, COMMENTS_MAX_PAGES);
});

test('un fallo parcial no tira lo conseguido; sin la primera página, se reintenta', async () => {
  const partial = fakeTrakt({ total: 350, fail: new Set(['likes:3', 'newest:1']) });
  const rows = await collectTitleComments({ ...args, getComments: partial.getComments });
  assert.equal(rows.length, 250);

  const broken = fakeTrakt({ total: 350, fail: new Set(['likes:1']) });
  await assert.rejects(collectTitleComments({ ...args, getComments: broken.getComments }), /trakt comments failed/);
});
