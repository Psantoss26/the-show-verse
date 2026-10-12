// src/lib/letterboxdSync.js
// Sincronización automática con Letterboxd por su feed RSS público (ver
// letterboxdRss). La cuenta se guarda en connected_accounts (provider
// 'letterboxd'); el usuario de Letterboxd y el estado de la última pasada van
// en metadata.
//
//   - Al conectar, una SINCRONIZACIÓN COMPLETA en segundo plano lee el perfil
//     entero (diario y películas vistas, ver letterboxdProfile) y trae todo el
//     historial y las puntuaciones. Su progreso va en metadata.backfill.
//   - Después, cada pocas horas, el RSS mantiene al día lo nuevo.

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { connectedAccounts, userRatings, watchHistory } from '../db/schema.js';
import { mapLetterboxdRatingItem, selectLetterboxdHistory } from './letterboxdImport.js';
import { fetchLetterboxdFeed, nextSeenGuids, pendingLetterboxdEntries } from './letterboxdRss.js';
import {
  buildLetterboxdProfileImport,
  collectLetterboxdProfile,
  resolveLetterboxdSlug,
} from './letterboxdProfile.js';
import { getTitlePoster } from './tmdbPoster.js';

export const LETTERBOXD_PROVIDER = 'letterboxd';

const ratingKey = (item) => `${Number(item.tmdbId)}:${item.mediaType}`;

// Una sincronización completa que lleva más de esto "en curso" se dio por
// perdida (reinicio del servidor a mitad).
const BACKFILL_STALE_MS = 2 * 60 * 60 * 1000;
const backfillsRunning = new Set();

/**
 * Mezcla `patch` en metadata en la propia BD (jsonb ||): la sincronización
 * completa y la del RSS escriben a la vez campos distintos y ninguna debe
 * pisar los de la otra con una copia vieja.
 */
async function patchMetadata(accountId, patch) {
  await db
    .update(connectedAccounts)
    .set({ metadata: sql`coalesce(${connectedAccounts.metadata}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(connectedAccounts.id, accountId));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
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
    backfill: meta.backfill || null,
  };
}

/** ¿Hay que hacer (o rehacer) la sincronización completa de esta cuenta? */
export function needsLetterboxdBackfill(account, now = Date.now()) {
  const backfill = account?.metadata?.backfill;
  if (!account?.metadata?.username) return false;
  if (!backfill) return true;
  if (backfill.status === 'done') return false;
  if (backfill.status === 'running') {
    // En curso en este proceso: no. Marcada "en curso" pero sin trabajo vivo
    // (el servidor se reinició a mitad) o colgada: hay que rehacerla.
    if (backfillsRunning.has(account.id)) return now - new Date(backfill.startedAt || 0).getTime() > BACKFILL_STALE_MS;
    return true;
  }
  // Error: reintentar pasado un día (Letterboxd caído, bloqueo temporal…).
  return now - new Date(backfill.finishedAt || 0).getTime() > 24 * 60 * 60 * 1000;
}

export async function saveLetterboxdAccount(userId, username) {
  const existing = await getLetterboxdAccount(userId);
  const sameUser = existing?.metadata?.username === username;
  const metadata = sameUser ? existing.metadata : { username, seenGuids: [] };
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
  const ids = [...new Set(items.map((item) => item.tmdbId))];
  const posters = new Map();
  await mapLimit(ids, 6, async (tmdbId) => {
    posters.set(tmdbId, await getTitlePoster({ tmdbId, mediaType: 'movie' }).catch(() => null));
  });
  return items.map((item) => ({ ...item, posterPath: posters.get(item.tmdbId) || null }));
}

async function applyRatings(userId, items) {
  const values = items
    .map((item) => mapLetterboxdRatingItem({ ...item, ratedAt: item.ratedAt ?? item.publishedAt }, userId))
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
 * Una pasada para una cuenta: lee el feed, añade los visionados nuevos y las
 * puntuaciones de las entradas nuevas, y guarda el estado en metadata.
 */
export async function syncLetterboxdAccount(account, { fetchFeed = fetchLetterboxdFeed } = {}) {
  const meta = account.metadata || {};
  const userId = account.userId;
  const now = new Date();
  try {
    const items = await fetchFeed(meta.username);
    const { fresh, ratings } = pendingLetterboxdEntries(items, meta.seenGuids || []);

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
      history: historyImported,
      ratings: ratingsResult.imported + ratingsResult.updated,
    };
    await patchMetadata(account.id, {
      seenGuids: nextSeenGuids(items, meta.seenGuids || []),
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

async function insertHistory(userId, items) {
  if (!items.length) return 0;
  const existing = await db.select().from(watchHistory).where(eq(watchHistory.userId, userId));
  const values = selectLetterboxdHistory(await withPosters(items), existing, userId);
  let inserted = 0;
  for (let index = 0; index < values.length; index += 500) {
    const rows = await db
      .insert(watchHistory)
      .values(values.slice(index, index + 500))
      .onConflictDoNothing()
      .returning({ id: watchHistory.id });
    inserted += rows.length;
  }
  return inserted;
}

/**
 * Sincronización completa: todo el diario, todas las películas vistas y sus
 * notas. Después deja marcadas como vistas las entradas actuales del RSS.
 */
async function runLetterboxdBackfill(account, { log, fetchImpl } = {}) {
  const username = account.metadata?.username;
  const startedAt = new Date().toISOString();
  let state = { status: 'running', phase: 'diary', startedAt, finishedAt: null, pages: 0, diary: 0, films: 0, resolved: 0, total: 0, history: 0, ratings: 0, error: null };
  let lastWrite = 0;
  const save = async (patch, force = false) => {
    state = { ...state, ...patch };
    if (!force && Date.now() - lastWrite < 3000) return;
    lastWrite = Date.now();
    await patchMetadata(account.id, { backfill: state }).catch(() => {});
  };

  try {
    await save({}, true);
    const profile = await collectLetterboxdProfile(username, {
      ...(fetchImpl ? { fetchImpl } : {}),
      onProgress: (progress) => void save(progress),
    });

    const slugs = [...new Set([...profile.diary, ...profile.films].map((item) => item.slug))];
    await save({ phase: 'resolve', total: slugs.length, resolved: 0, diary: profile.diary.length, films: profile.films.length }, true);
    const resolved = new Map();
    let done = 0;
    await mapLimit(slugs, 3, async (slug) => {
      const film = await resolveLetterboxdSlug(slug, fetchImpl ? { fetchImpl } : {}).catch(() => null);
      if (film) resolved.set(slug, film);
      done += 1;
      await save({ resolved: done });
    });

    await save({ phase: 'save' }, true);
    const { history, ratings } = buildLetterboxdProfileImport(profile, resolved);
    const historyImported = await insertHistory(account.userId, history);
    const ratingsResult = await applyRatings(account.userId, await withPosters(ratings));

    await save(
      {
        status: 'done',
        phase: 'done',
        finishedAt: new Date().toISOString(),
        resolved: done,
        matched: resolved.size,
        history: historyImported,
        ratings: ratingsResult.imported + ratingsResult.updated,
      },
      true,
    );
    log?.info?.({ userId: account.userId, slugs: slugs.length, history: historyImported }, 'letterboxd backfill done');

    // El RSS solo repite lo que ya se ha traído: sus entradas actuales se dan
    // por vistas (sin reaplicar notas de registros antiguos sobre la actual) y
    // a partir de aquí solo cuentan las nuevas.
    const feed = await fetchLetterboxdFeed(username).catch(() => null);
    if (feed) {
      const fresh = await getLetterboxdAccount(account.userId);
      await patchMetadata(account.id, {
        seenGuids: nextSeenGuids(feed, fresh?.metadata?.seenGuids || []),
        lastSyncedAt: new Date().toISOString(),
        lastResult: { entries: 0, history: historyImported, ratings: ratingsResult.imported + ratingsResult.updated },
        lastError: null,
      });
    }
  } catch (err) {
    await save({ status: 'error', finishedAt: new Date().toISOString(), error: err?.message || 'Error al sincronizar' }, true);
    log?.warn?.({ err: err?.message, userId: account.userId }, 'letterboxd backfill failed');
  }
}

/**
 * Lanza la sincronización completa en segundo plano (una por cuenta a la vez).
 * Devuelve la promesa, o null si ya había una en curso.
 */
export function startLetterboxdBackfill(account, options = {}) {
  if (!account?.id || backfillsRunning.has(account.id)) return null;
  backfillsRunning.add(account.id);
  return runLetterboxdBackfill(account, options).finally(() => backfillsRunning.delete(account.id));
}

export function isLetterboxdBackfillRunning(accountId) {
  return backfillsRunning.has(accountId);
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
    // Cuentas sin historial completo (conectadas antes de existir, o cuya
    // sincronización completa falló o se cortó): se hace ahora.
    if (needsLetterboxdBackfill(account) && !isLetterboxdBackfillRunning(account.id)) {
      await startLetterboxdBackfill(account, { log });
      continue;
    }
    const result = await syncLetterboxdAccount(account);
    if (result.ok) history += result.history;
    else failed += 1;
    // Sin ráfagas contra Letterboxd.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  log?.info?.({ accounts: accounts.length, history, failed }, 'letterboxd sync done');
  return { accounts: accounts.length, history, failed };
}
