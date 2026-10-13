// src/lib/letterboxdSync.js
// Sincronización con Letterboxd por su feed RSS público (ver letterboxdRss).
// La cuenta se guarda en connected_accounts (provider 'letterboxd'); el
// usuario de Letterboxd y el estado de las pasadas van en metadata.
//
//   - Cada pocas horas (server.js) y al pulsar "Sincronizar ahora" se lee el
//     feed: visionados nuevos del diario (con su fecha y rewatch) y sus
//     puntuaciones. Cada entrada se procesa una vez (guid).
//   - "Me gusta" → Favoritas, una vez por entrada (si luego la quitas de
//     Favoritas, no vuelve).
//   - Reseñas → reseñas de la comunidad en la ficha, a tu nombre y con su
//     aviso de spoilers. Si la borras aquí, no se vuelve a crear.
//   - La watchlist no tiene feed: llega con la exportación oficial.
//   - NUNCA se modifica lo que ya tienes aquí: un título que ya tiene nota
//     conserva la suya y una reseña ya creada no se reescribe, aunque cambien
//     en Letterboxd. Solo se AÑADE lo que falta.
//   - El RSS solo trae las últimas ~50 entradas: el historial completo entra
//     con la exportación oficial (ZIP, o la extensión, que la descarga sola).

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { connectedAccounts, favorites, titleComments, userRatings, users, watchHistory } from '../db/schema.js';
import {
  mapLetterboxdCollectionItem,
  mapLetterboxdRatingItem,
  selectLetterboxdHistory,
} from './letterboxdImport.js';
import {
  fetchLetterboxdFeed,
  letterboxdReviewHash,
  nextSeenGuids,
  nextSeenRatings,
  pendingLetterboxdEntries,
  pendingLetterboxdLikes,
  pendingLetterboxdReviews,
} from './letterboxdRss.js';
import { getTitlePoster } from './tmdbPoster.js';

export const LETTERBOXD_PROVIDER = 'letterboxd';

const ratingKey = (item) => `${Number(item.tmdbId)}:${item.mediaType}`;

/**
 * Mezcla `patch` en metadata en la propia BD (jsonb ||): la pasada del RSS y
 * el registro de la exportación escriben campos distintos y ninguna debe
 * pisar los de la otra con una copia vieja.
 */
async function patchMetadata(accountId, patch) {
  await db
    .update(connectedAccounts)
    .set({ metadata: sql`coalesce(${connectedAccounts.metadata}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(connectedAccounts.id, accountId));
}

export async function getLetterboxdAccount(userId) {
  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.provider, LETTERBOXD_PROVIDER)))
    .limit(1);
  return account || null;
}

/** Lo que ve el front de la conexión. */
export function letterboxdConnectionView(account) {
  if (!account) return { connected: false };
  const meta = account.metadata || {};
  return {
    connected: true,
    username: meta.username || null,
    connectedAt: account.createdAt,
    lastSyncedAt: meta.lastSyncedAt || null,
    lastResult: meta.lastResult || null,
    lastError: meta.lastError || null,
    extensionSync: meta.extensionSync || null,
  };
}

/**
 * La web importó la exportación completa (descargada por la extensión): se
 * guarda el resumen para mostrarlo en Ajustes.
 */
export async function recordLetterboxdExtensionSync(account, summary = {}) {
  const count = (value) => Math.max(0, Math.floor(Number(value) || 0));
  await patchMetadata(account.id, {
    extensionSync: {
      finishedAt: new Date().toISOString(),
      films: count(summary.films),
      history: count(summary.history),
      ratings: count(summary.ratings),
      missing: count(summary.missing),
    },
  });
}

export async function saveLetterboxdAccount(userId, username) {
  const existing = await getLetterboxdAccount(userId);
  const sameUser = existing?.metadata?.username === username;
  const metadata = sameUser ? existing.metadata : { username, seenGuids: [], seenRatings: {} };
  if (existing) {
    const [account] = await db
      .update(connectedAccounts)
      .set({ metadata })
      .where(eq(connectedAccounts.id, existing.id))
      .returning();
    return account;
  }
  // providerUid por usuario de The Show Verse: el nombre de Letterboxd es
  // público y no puede bloquear a nadie que lo use.
  const [account] = await db
    .insert(connectedAccounts)
    .values({ userId, provider: LETTERBOXD_PROVIDER, providerUid: `user:${userId}`, metadata })
    .returning();
  return account;
}

export async function deleteLetterboxdAccount(userId) {
  await db
    .delete(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.provider, LETTERBOXD_PROVIDER)));
}

async function withPosters(items) {
  const posters = new Map();
  for (const tmdbId of new Set(items.map((item) => item.tmdbId))) {
    posters.set(tmdbId, await getTitlePoster({ tmdbId, mediaType: 'movie' }).catch(() => null));
  }
  return items.map((item) => ({ ...item, posterPath: posters.get(item.tmdbId) || null }));
}

/**
 * Puntuaciones del feed: solo las de títulos que aún no tienen nota aquí. Una
 * importación NUNCA modifica lo que el usuario ya tiene (tampoco si la nota
 * cambia luego en Letterboxd): su nota de aquí manda.
 */
async function applyRatings(userId, items) {
  const values = items
    .map((item) => mapLetterboxdRatingItem({ ...item, ratedAt: item.publishedAt }, userId))
    .filter(Boolean);
  if (!values.length) return { imported: 0, updated: 0 };
  const existing = await db.select().from(userRatings).where(eq(userRatings.userId, userId));
  const rated = new Set(
    existing.filter((row) => row.season == null && row.episode == null).map(ratingKey),
  );
  let imported = 0;
  for (const value of values) {
    if (rated.has(ratingKey(value))) continue;
    const rows = await db.insert(userRatings).values(value).onConflictDoNothing().returning({ id: userRatings.id });
    rated.add(ratingKey(value));
    imported += rows.length;
  }
  return { imported, updated: 0 };
}

async function applyLikes(userId, items) {
  if (!items.length) return 0;
  const byMovie = new Map(items.map((item) => [item.tmdbId, item]));
  const values = (await withPosters([...byMovie.values()]))
    .map((item) => mapLetterboxdCollectionItem({ ...item, addedAt: item.publishedAt }, userId))
    .filter(Boolean);
  if (!values.length) return 0;
  const rows = await db.insert(favorites).values(values).onConflictDoNothing().returning({ id: favorites.id });
  return rows.length;
}

/**
 * Reseñas del feed → reseñas nativas de la ficha (title_comments). Devuelve
 * el nuevo estado { guid: { id, hash } } (solo de entradas del feed actual:
 * las que salen del feed ya no pueden volver) y cuántas creó o actualizó.
 */
async function applyReviews(userId, items, previous = {}) {
  const state = {};
  for (const item of items) if (previous[item.guid]) state[item.guid] = previous[item.guid];
  const { create, update } = pendingLetterboxdReviews(items, state);
  if (!create.length && !update.length) return { state, created: 0, updated: 0 };

  const [author] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  let created = 0;
  let updated = 0;
  for (const item of create) {
    // Ya escrita aquí con el mismo texto (p. ej. a mano): se enlaza, no se duplica.
    const [existing] = await db
      .select({ id: titleComments.id })
      .from(titleComments)
      .where(
        and(
          eq(titleComments.userId, userId),
          eq(titleComments.tmdbId, item.tmdbId),
          eq(titleComments.mediaType, 'movie'),
          eq(titleComments.source, 'native'),
          eq(titleComments.body, item.review.body),
        ),
      )
      .limit(1);
    let id = existing?.id || null;
    if (!id) {
      const [row] = await db
        .insert(titleComments)
        .values({
          tmdbId: item.tmdbId,
          mediaType: 'movie',
          source: 'native',
          userId,
          authorName: author?.displayName || author?.username || 'Usuario',
          authorUsername: author?.username || null,
          authorAvatarUrl: author?.avatarUrl || null,
          authorIsVip: false,
          body: item.review.body,
          likes: 0,
          spoiler: Boolean(item.review.spoiler),
          createdAt: new Date(item.publishedAt),
        })
        .returning({ id: titleComments.id });
      id = row?.id || null;
      if (id) created += 1;
    }
    state[item.guid] = { id, hash: letterboxdReviewHash(item.review) };
  }
  // Una reseña que ya existe aquí NO se toca aunque cambie en Letterboxd: una
  // importación nunca modifica lo que el usuario ya tiene (podría haberla
  // editado aquí). Solo se recuerda el nuevo texto para no volver a mirarla.
  for (const { item, commentId } of update) {
    state[item.guid] = { id: commentId || null, hash: letterboxdReviewHash(item.review) };
  }
  return { state, created, updated };
}

/**
 * Una pasada para una cuenta: lee el feed, añade los visionados nuevos, aplica
 * las puntuaciones nuevas o editadas y guarda el estado en metadata.
 */
export async function syncLetterboxdAccount(account, { fetchFeed = fetchLetterboxdFeed } = {}) {
  const meta = account.metadata || {};
  const userId = account.userId;
  const now = new Date();
  try {
    const items = await fetchFeed(meta.username);
    const { fresh, ratings, edited } = pendingLetterboxdEntries(items, meta.seenGuids || [], meta.seenRatings);

    let historyImported = 0;
    if (fresh.length) {
      const existing = await db.select().from(watchHistory).where(eq(watchHistory.userId, userId));
      const values = selectLetterboxdHistory(await withPosters(fresh), existing, userId);
      if (values.length) {
        const rows = await db.insert(watchHistory).values(values).onConflictDoNothing().returning({ id: watchHistory.id });
        historyImported = rows.length;
      }
    }
    const ratingsResult = await applyRatings(userId, await withPosters(ratings));
    const favoritesAdded = await applyLikes(userId, pendingLetterboxdLikes(items, meta.likedGuids || []));
    const reviews = await applyReviews(userId, items, meta.reviews || {});

    const lastResult = {
      entries: fresh.length,
      edited: edited.length,
      history: historyImported,
      ratings: ratingsResult.imported + ratingsResult.updated,
      favorites: favoritesAdded,
      reviews: reviews.created + reviews.updated,
    };
    await patchMetadata(account.id, {
      seenGuids: nextSeenGuids(items, meta.seenGuids || []),
      seenRatings: nextSeenRatings(items),
      likedGuids: items.filter((item) => item.liked).map((item) => item.guid),
      reviews: reviews.state,
      lastSyncedAt: now.toISOString(),
      lastResult,
      lastError: null,
    });
    return { ok: true, ...lastResult };
  } catch (err) {
    await patchMetadata(account.id, {
      lastSyncedAt: now.toISOString(),
      lastError: err?.message || 'Error al sincronizar',
    }).catch(() => {});
    return { ok: false, error: err?.message || 'Error al sincronizar', code: err?.code || null };
  }
}

/** Pasada periódica: todas las cuentas conectadas, una detrás de otra. */
export async function syncAllLetterboxdAccounts(log) {
  const accounts = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.provider, LETTERBOXD_PROVIDER));
  let history = 0;
  let failed = 0;
  for (const account of accounts) {
    if (!account.metadata?.username) continue;
    const result = await syncLetterboxdAccount(account);
    if (result.ok) history += result.history;
    else failed += 1;
    // Sin ráfagas contra Letterboxd.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  log?.info?.({ accounts: accounts.length, history, failed }, 'letterboxd rss sync done');
  return { accounts: accounts.length, history, failed };
}
