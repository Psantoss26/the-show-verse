// backend/src/community/seed.js
import { db } from '../db/client.js';
import { titleCommunityState, titleComments, titleSentiment } from '../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { seedDecision, nextRetryDate } from './state.js';
import { resolveTraktId, getComments, getListsContaining, getUserListItems, getSentiments } from './trakt.js';
import { normalizeTraktComment, normalizeTraktList, posterUrl } from './normalize.js';
import { buildHeuristicSentiment } from './sentiment.js';
import { translateManyToEs } from './translate.js';
import { upsertSentiment, upsertCommunityList, insertListMemberships } from './store.js';
import { tmdbDetails } from '../dashboard/tmdb.js';

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
       AND ( (status IN ('pending','failed') AND (next_retry_at IS NULL OR next_retry_at < now()))
             OR (status = 'seeding' AND updated_at < now() - interval '3 minutes') )
    RETURNING tmdb_id`);
  return (claimed?.rows?.length || claimed?.length || 0) > 0;
}

export async function runSeed({ tmdbId, mediaType }) {
  const numId = Number(tmdbId);
  try {
    const resolved = await resolveTraktId({ type: mediaType, tmdbId: numId });
    if (!resolved.ok) throw new Error('trakt resolve failed');
    // Title confirmed not on Trakt → ready but empty (works with natives going forward).
    if (!resolved.traktId) {
      await markReady({ tmdbId: numId, mediaType, traktId: null, commentCount: 0 });
      return;
    }
    // Copy top-10 comments by likes.
    const commentsRes = await getComments({ type: mediaType, traktId: resolved.traktId, sort: 'likes', page: 1, limit: 10 });
    if (!commentsRes.ok) throw new Error('trakt comments failed');
    const items = commentsRes.items;
    const rows = items.map((raw) => normalizeTraktComment(raw, { tmdbId: numId, mediaType })).filter(Boolean);
    if (rows.length) {
      await db.insert(titleComments).values(rows)
        .onConflictDoNothing();
    }

    // Sentiment: copia el sentimiento OFICIAL de Trakt (calidad "como Trakt": temas que
    // Trakt precomputa a partir de los comentarios), traducido a español. Es rápido (1-2
    // llamadas HTTP) y va ANTES de las listas (más lentas) para que aparezca cuanto antes.
    // Fallback al heurístico sobre los comentarios copiados si Trakt no tiene sentimiento.
    let sentimentDone = false;
    if (resolved.traktId) {
      const ts = await getSentiments({ type: mediaType, traktId: resolved.traktId }).catch(() => null);
      if (ts && (ts.good.length || ts.bad.length)) {
        const [goodEs, badEs] = await Promise.all([
          translateManyToEs(ts.good.map((x) => x.sentiment).filter(Boolean)),
          translateManyToEs(ts.bad.map((x) => x.sentiment).filter(Boolean)),
        ]);
        const good = goodEs.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 8).map((text_es) => ({ text_es }));
        const bad = badEs.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 8).map((text_es) => ({ text_es }));
        if (good.length || bad.length) {
          await upsertSentiment({
            tmdbId: numId, mediaType, good, bad,
            provider: 'trakt', model: null,
            sourceCommentCount: ts.commentCount || rows.length, isProvisional: false,
          });
          sentimentDone = true;
        }
      }
    }
    if (!sentimentDone && rows.length) {
      const heur = buildHeuristicSentiment(rows.map((r) => ({ body: r.body })));
      await upsertSentiment({
        tmdbId: numId, mediaType, good: heur.good, bad: heur.bad,
        provider: 'heuristic', model: null, sourceCommentCount: rows.length, isProvisional: false,
      });
    }

    // Copy up to 3 lists that contain this title (best-effort: a list-copy failure must not
    // fail the whole seed — comments/sentiment already succeeded by this point). Slower than
    // the rest (fetches list items + hydrates preview posters), so it runs last before ready.
    try {
      const { items: listItems } = await getListsContaining({ type: mediaType, traktId: resolved.traktId, tab: 'popular', page: 1, limit: 3 });
      for (const raw of listItems) {
        const listRow = normalizeTraktList(raw);
        if (!listRow) continue;
        // preview posters (best-effort): first 5 items of the list
        let members = [];
        if (listRow.ownerUsername && listRow.slug) {
          const its = await getUserListItems({ username: listRow.ownerUsername, listSlug: listRow.slug, page: 1, limit: 150 });
          members = its.map((it) => {
            const m = it.movie || it.show; const isTv = !!it.show;
            const itemTmdbId = m?.ids?.tmdb; if (!itemTmdbId) return null;
            return { tmdbId: itemTmdbId, mediaType: isTv ? 'tv' : 'movie', title: m?.title || null,
              posterPath: null }; // hydrated below for the first 5 (preview posters); rest stay null
          }).filter(Boolean).slice(0, 150);
        }
        // Hidrata el poster de los primeros 5 miembros vía TMDb (coste acotado);
        // el resto se queda con posterPath:null (hidratación completa es mejora futura).
        for (const m of members.slice(0, 5)) {
          try {
            const d = await tmdbDetails(m.mediaType === 'tv' ? 'tv' : 'movie', m.tmdbId);
            m.posterPath = d?.poster_path || null;
          } catch {
            // best-effort: deja posterPath en null si TMDb falla
          }
        }
        const previews = members.slice(0, 5).map((m) => posterUrl(m.posterPath)).filter(Boolean);
        const listId = await upsertCommunityList({ ...listRow, copiedItemCount: members.length, previewPosters: previews });
        // Always record the seeding title's own membership in the copied list, even when it
        // isn't among the (possibly truncated to 150) fetched members — otherwise a title that
        // sits beyond position 150 in a large list would never show up in getListsForTitle for
        // that list, permanently, since ready titles are frozen.
        const membershipItems = [...members];
        if (!membershipItems.some((m) => Number(m.tmdbId) === numId && m.mediaType === mediaType)) {
          membershipItems.push({ tmdbId: numId, mediaType, position: members.length });
        }
        await insertListMemberships(listId, membershipItems);
      }
    } catch (listErr) {
      // Swallow: list-copy is a bonus feature, not core to community seeding.
      console.error(`[community/seed] list copy failed for ${mediaType}:${numId}:`, listErr?.message || listErr);
    }

    // Title is READY: comments + lists + sentiment all persisted.
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
