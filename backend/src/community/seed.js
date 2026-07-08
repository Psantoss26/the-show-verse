// backend/src/community/seed.js
import { db } from '../db/client.js';
import { titleCommunityState, titleComments } from '../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { seedDecision, nextRetryDate } from './state.js';
import { resolveTraktId, getComments } from './trakt.js';
import { normalizeTraktComment } from './normalize.js';

export async function getState({ tmdbId, mediaType }) {
  const [row] = await db
    .select().from(titleCommunityState)
    .where(and(eq(titleCommunityState.tmdbId, Number(tmdbId)), eq(titleCommunityState.mediaType, mediaType)))
    .limit(1);
  return row || null;
}

// Atomically claim the seed lock. Returns true if THIS caller should seed.
async function claimSeedLock({ tmdbId, mediaType }) {
  // Upsert a 'pending' row if absent, then flip pending/failed→seeding atomically.
  await db.insert(titleCommunityState)
    .values({ tmdbId: Number(tmdbId), mediaType, status: 'pending' })
    .onConflictDoNothing({ target: [titleCommunityState.tmdbId, titleCommunityState.mediaType] });

  const claimed = await db.execute(sql`
    UPDATE title_community_state
       SET status = 'seeding', updated_at = now()
     WHERE tmdb_id = ${Number(tmdbId)} AND media_type = ${mediaType}
       AND status IN ('pending','failed')
       AND (next_retry_at IS NULL OR next_retry_at < now())
    RETURNING tmdb_id`);
  return (claimed?.rows?.length || claimed?.length || 0) > 0;
}

export async function runSeed({ tmdbId, mediaType }) {
  const numId = Number(tmdbId);
  try {
    const resolved = await resolveTraktId({ type: mediaType, tmdbId: numId });
    // Title not on Trakt → ready but empty (works with natives going forward).
    if (!resolved?.traktId) {
      await markReady({ tmdbId: numId, mediaType, traktId: null, commentCount: 0 });
      return;
    }
    // Copy top-10 comments by likes.
    const { items } = await getComments({ type: mediaType, traktId: resolved.traktId, sort: 'likes', page: 1, limit: 10 });
    const rows = items.map((raw) => normalizeTraktComment(raw, { tmdbId: numId, mediaType })).filter(Boolean);
    if (rows.length) {
      await db.insert(titleComments).values(rows)
        .onConflictDoNothing({ target: titleComments.externalId });
    }
    // (Task 13 will insert lists here; Task 10 will build sentiment here.)
    await markReady({ tmdbId: numId, mediaType, traktId: resolved.traktId, commentCount: rows.length });
  } catch (err) {
    await markFailed({ tmdbId: numId, mediaType, error: String(err?.message || err).slice(0, 300) });
  }
}

async function markReady({ tmdbId, mediaType, traktId, commentCount }) {
  await db.update(titleCommunityState)
    .set({ status: 'ready', traktId, commentCount, seededAt: new Date(), error: null, updatedAt: new Date() })
    .where(and(eq(titleCommunityState.tmdbId, tmdbId), eq(titleCommunityState.mediaType, mediaType)));
}

async function markFailed({ tmdbId, mediaType, error }) {
  const cur = await getState({ tmdbId, mediaType });
  const attempts = (cur?.attempts || 0) + 1;
  await db.update(titleCommunityState)
    .set({ status: 'failed', error, attempts, nextRetryAt: nextRetryDate(attempts), updatedAt: new Date() })
    .where(and(eq(titleCommunityState.tmdbId, tmdbId), eq(titleCommunityState.mediaType, mediaType)));
}

export async function ensureSeeded({ tmdbId, mediaType }) {
  const state = await getState({ tmdbId, mediaType });
  const decision = seedDecision(state);
  if (decision !== 'seed') return { status: state?.status || 'pending' };
  const shouldSeed = await claimSeedLock({ tmdbId, mediaType });
  if (shouldSeed) {
    // Fire-and-forget: don't block the request.
    runSeed({ tmdbId, mediaType }).catch(() => {});
  }
  return { status: 'seeding' };
}
