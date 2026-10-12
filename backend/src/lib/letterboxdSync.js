// src/lib/letterboxdSync.js
// Sincronización con Letterboxd por su feed RSS público (ver letterboxdRss).
// La cuenta se guarda en connected_accounts (provider 'letterboxd'); el
// usuario de Letterboxd y el estado de las pasadas van en metadata.
//
//   - Cada pocas horas (server.js) y al pulsar "Sincronizar ahora" se lee el
//     feed: visionados nuevos del diario (con su fecha y rewatch), reseñas con
//     visionado y sus puntuaciones. Cada entrada se procesa una vez (guid).
//   - Ediciones: si una entrada que sigue en el feed cambia de nota, se
//     actualiza. Las eliminaciones y las ediciones de entradas que ya salieron
//     del feed no se pueden detectar por RSS.
//   - El RSS solo trae las últimas ~50 entradas: el historial completo entra
//     con la exportación oficial (ZIP, o la extensión, que la descarga sola).

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { connectedAccounts, userRatings, watchHistory } from '../db/schema.js';
import { mapLetterboxdRatingItem, selectLetterboxdHistory } from './letterboxdImport.js';
import {
  fetchLetterboxdFeed,
  nextSeenGuids,
  nextSeenRatings,
  pendingLetterboxdEntries,
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

async function applyRatings(userId, items) {
  const values = items
    .map((item) => mapLetterboxdRatingItem({ ...item, ratedAt: item.publishedAt }, userId))
    .filter(Boolean);
  if (!values.length) return { imported: 0, updated: 0 };
  const existing = await db.select().from(userRatings).where(eq(userRatings.userId, userId));
  const byKey = new Map(
    existing.filter((row) => row.season == null && row.episode == null).map((row) => [ratingKey(row), row]),
  );
  let imported = 0;
  let updated = 0;
  for (const value of values) {
    const current = byKey.get(ratingKey(value));
    if (current) {
      if (Number(current.rating) === value.rating) continue;
      await db
        .update(userRatings)
        .set({ rating: value.rating, ratedAt: value.ratedAt, updatedAt: new Date() })
        .where(eq(userRatings.id, current.id));
      updated += 1;
    } else {
      await db.insert(userRatings).values(value).onConflictDoNothing();
      imported += 1;
    }
  }
  return { imported, updated };
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

    const lastResult = {
      entries: fresh.length,
      edited: edited.length,
      history: historyImported,
      ratings: ratingsResult.imported + ratingsResult.updated,
    };
    await patchMetadata(account.id, {
      seenGuids: nextSeenGuids(items, meta.seenGuids || []),
      seenRatings: nextSeenRatings(items),
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
