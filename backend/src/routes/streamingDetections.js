// src/routes/streamingDetections.js
// Detecciones de streaming (extensión + app Android) y su corrección.
//
// Con el TOKEN de sincronización (los clientes y el endpoint de resolución):
//   POST /streaming/detections/lookup   → reglas aprendidas para una huella
//   POST /streaming/detections          → registra una detección notificada
//   GET  /streaming/rules/not-a-title   → textos que no son títulos (por plataforma)
//
// Con SESIÓN (la web, también dentro de la app Android):
//   GET  /streaming/detections              → detecciones recientes del usuario
//   GET  /streaming/detections/:id          → una detección
//   POST /streaming/detections/:id/correction → «no había ficha» / «es otro título»
//
// Ver lib/detectionRules.js para cómo una corrección se convierte en reglas.

import { z } from 'zod';
import { and, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import {
  connectedAccounts,
  detectionCorrections,
  detectionRules,
  streamingDetections,
  watchHistory,
  watchProgress,
} from '../db/schema.js';
import { hashToken } from '../lib/jwt.js';
import { invalidateLevelState } from '../level/store.js';
import {
  GLOBAL_OWNER,
  aggregateGlobalRules,
  decideFromRules,
  globalRuleMinSupporters,
  userRulesFromCorrection,
} from '../lib/detectionRules.js';

const DETECTION_RETENTION_DAYS = 30;
// La misma detección repetida en poco tiempo (recargar la ficha, reanudar tras
// una pausa) reutiliza su fila: si no, la lista de recientes se llena de copias.
const DETECTION_REUSE_MS = 10 * 60 * 1000;

const platformSchema = z.string().trim().min(1).max(40);
const fingerprintSchema = z.string().max(400);

const lookupSchema = z.object({
  platform: platformSchema,
  fingerprint: fingerprintSchema.min(1),
});

const recordSchema = z.object({
  platform: platformSchema,
  kind: z.enum(['detail', 'playback']),
  // Vacía si el texto no sirve para aprender (genérico o demasiado corto).
  fingerprint: fingerprintSchema,
  triggerText: z.string().max(300),
  signal: z.record(z.unknown()).default({}),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  season: z.number().int().positive().nullable().optional(),
  episode: z.number().int().positive().nullable().optional(),
  title: z.string().max(300).nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  source: z.enum(['search', 'user_rule', 'global_rule']).default('search'),
});

const correctionSchema = z.object({
  verdict: z.enum(['not_a_title', 'wrong_title']),
  // Solo con 'wrong_title'. Sin título: «no es este, pero no sé cuál era».
  tmdbId: z.number().int().positive().optional(),
  mediaType: z.enum(['movie', 'tv']).optional(),
  season: z.number().int().positive().nullable().optional(),
  episode: z.number().int().positive().nullable().optional(),
  title: z.string().trim().max(300).nullable().optional(),
  posterPath: z.string().trim().max(300).nullable().optional(),
}).superRefine((v, ctx) => {
  const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (v.verdict === 'not_a_title' && (v.tmdbId || v.mediaType)) {
    issue('not_a_title does not take a title');
  }
  if (Boolean(v.tmdbId) !== Boolean(v.mediaType)) issue('tmdbId and mediaType must be provided together');
  if (v.mediaType !== 'tv' && (v.season != null || v.episode != null)) {
    issue('season/episode only apply to series');
  }
  if (v.episode != null && v.season == null) issue('episode requires season');
});

const listQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(DETECTION_RETENTION_DAYS).default(7),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Usuario de un token de sincronización (extensión / app Android), o null. */
async function userIdForSyncToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const [account] = await db
    .select({ userId: connectedAccounts.userId })
    .from(connectedAccounts)
    .where(and(
      eq(connectedAccounts.provider, 'netflix'),
      eq(connectedAccounts.accessToken, hashToken(token)),
    ))
    .limit(1);
  return account?.userId || null;
}

function toDetectionResult(row) {
  const corrected = row.status === 'corrected';
  return {
    id: row.id,
    platform: row.platform,
    kind: row.kind,
    triggerText: row.triggerText,
    tmdbId: row.tmdbId,
    mediaType: row.mediaType,
    season: row.season,
    episode: row.episode,
    title: row.title,
    posterPath: row.posterPath,
    confidence: row.confidence,
    source: row.source,
    status: row.status,
    // Pista de la serie/episodio que leyó el reproductor, para prerrellenar la
    // corrección: suelen ser correctos aunque el título no lo sea.
    detectedSeason: Number(row.signal?.season) > 0 ? Number(row.signal.season) : row.season,
    detectedEpisode: Number(row.signal?.episode) > 0 ? Number(row.signal.episode) : row.episode,
    correction: corrected
      ? row.correctedTmdbId
        ? {
            verdict: 'wrong_title',
            tmdbId: row.correctedTmdbId,
            mediaType: row.correctedMediaType,
            season: row.correctedSeason,
            episode: row.correctedEpisode,
            title: row.correctedTitle,
            posterPath: row.correctedPosterPath,
          }
        : { verdict: 'not_a_title' }
      : null,
    createdAt: row.createdAt,
  };
}

/**
 * Lo que debe guardar un ping de progreso/visionado que llega con `detectionId`.
 * Si el usuario ya corrigió esa detección, el ping se aplica al título correcto
 * (o se ignora si no había título): así un reproductor que sigue abierto —en
 * este u otro dispositivo— no vuelve a escribir en el título equivocado.
 * @returns {{ skip: boolean, detectionId: string|null, item: object }}
 */
export async function applyDetectionRedirect(userId, detectionId, item) {
  if (!detectionId) return { skip: false, detectionId: null, item };
  const [detection] = await db
    .select()
    .from(streamingDetections)
    .where(and(eq(streamingDetections.id, detectionId), eq(streamingDetections.userId, userId)))
    .limit(1);
  // Purgada o de otro usuario: se guarda sin enlazar.
  if (!detection) return { skip: false, detectionId: null, item };
  if (detection.status !== 'corrected') return { skip: false, detectionId, item };
  if (!detection.correctedTmdbId) return { skip: true, detectionId, item };
  const isTv = detection.correctedMediaType === 'tv';
  return {
    skip: false,
    detectionId,
    item: {
      ...item,
      tmdbId: detection.correctedTmdbId,
      mediaType: detection.correctedMediaType,
      season: isTv ? (detection.correctedSeason ?? null) : null,
      episode: isTv ? (detection.correctedEpisode ?? null) : null,
      title: detection.correctedTitle ?? item.title ?? null,
      posterPath: detection.correctedPosterPath ?? null,
      confidence: 'high',
    },
  };
}

/** Reglas que aplican a una huella para este usuario. */
export async function lookupRules(executor, userId, platform, fingerprint) {
  const rows = await executor
    .select()
    .from(detectionRules)
    .where(and(
      eq(detectionRules.platform, platform),
      eq(detectionRules.fingerprint, fingerprint),
      or(eq(detectionRules.owner, userId), eq(detectionRules.owner, GLOBAL_OWNER)),
    ));
  return decideFromRules(rows, userId);
}

/**
 * Mueve (o borra, si `target` es null) lo que guardó una detección: la fila de
 * "Continuar viendo" y los visionados con su detection_id. Nunca toca filas que
 * no lleven ese id.
 */
async function reassignDetectionData(tx, userId, detectionId, target) {
  const progressRows = await tx
    .select()
    .from(watchProgress)
    .where(and(eq(watchProgress.userId, userId), eq(watchProgress.detectionId, detectionId)));
  const historyRows = await tx
    .select({ id: watchHistory.id })
    .from(watchHistory)
    .where(and(eq(watchHistory.userId, userId), eq(watchHistory.detectionId, detectionId)));

  if (!target) {
    if (progressRows.length) {
      await tx.delete(watchProgress).where(inArray(watchProgress.id, progressRows.map((r) => r.id)));
    }
    if (historyRows.length) {
      await tx.delete(watchHistory).where(inArray(watchHistory.id, historyRows.map((r) => r.id)));
    }
    return { progressRemoved: progressRows.length, historyRemoved: historyRows.length, moved: 0 };
  }

  const isTv = target.mediaType === 'tv';
  // watch_progress usa el centinela 0 (película o sin episodio); el historial, null.
  const progressSeason = isTv && target.episode ? target.season : 0;
  const progressEpisode = isTv && target.episode ? target.episode : 0;
  for (const row of progressRows) {
    const [existing] = await tx
      .select()
      .from(watchProgress)
      .where(and(
        eq(watchProgress.userId, userId),
        eq(watchProgress.tmdbId, target.tmdbId),
        eq(watchProgress.mediaType, target.mediaType),
        eq(watchProgress.season, progressSeason),
        eq(watchProgress.episode, progressEpisode),
      ))
      .limit(1);
    if (existing && existing.id !== row.id) {
      // Ya había progreso del título correcto: se queda el punto más reciente.
      const newer = row.updatedAt > existing.updatedAt ? row : existing;
      await tx.delete(watchProgress).where(eq(watchProgress.id, row.id));
      await tx.update(watchProgress).set({
        positionSeconds: newer.positionSeconds,
        runtimeSeconds: newer.runtimeSeconds,
        percent: newer.percent,
        platform: newer.platform,
        updatedAt: newer.updatedAt,
        detectionId,
      }).where(eq(watchProgress.id, existing.id));
    } else {
      await tx.update(watchProgress).set({
        tmdbId: target.tmdbId,
        mediaType: target.mediaType,
        season: progressSeason,
        episode: progressEpisode,
        title: target.title ?? row.title,
        posterPath: target.posterPath ?? null,
        // La duración era la del título equivocado: el siguiente ping la rehace.
        runtimeSeconds: 0,
        percent: 0,
      }).where(eq(watchProgress.id, row.id));
    }
  }
  if (historyRows.length) {
    await tx.update(watchHistory).set({
      tmdbId: target.tmdbId,
      mediaType: target.mediaType,
      season: isTv ? (target.season ?? null) : null,
      episode: isTv && target.season ? (target.episode ?? null) : null,
      title: target.title ?? null,
      posterPath: target.posterPath ?? null,
      // Lo eligió el usuario a mano.
      confidence: 'high',
    }).where(inArray(watchHistory.id, historyRows.map((r) => r.id)));
  }
  return { progressRemoved: 0, historyRemoved: 0, moved: progressRows.length + historyRows.length };
}

/** Reglas personales de una corrección (sustituyen a las anteriores). */
async function applyUserRules(tx, userId, correction) {
  const { platform, fingerprint, triggerText } = correction;
  const { decision, reject } = userRulesFromCorrection(correction);
  const now = new Date();

  if (decision) {
    await tx.insert(detectionRules).values({
      owner: userId, platform, fingerprint, triggerText,
      rule: decision.rule,
      tmdbId: decision.tmdbId ?? null,
      mediaType: decision.mediaType ?? null,
      title: decision.title ?? null,
      posterPath: decision.posterPath ?? null,
    }).onConflictDoUpdate({
      target: [detectionRules.owner, detectionRules.platform, detectionRules.fingerprint],
      targetWhere: sql`rule IN ('override', 'not_a_title')`,
      set: {
        rule: decision.rule,
        tmdbId: decision.tmdbId ?? null,
        mediaType: decision.mediaType ?? null,
        title: decision.title ?? null,
        posterPath: decision.posterPath ?? null,
        triggerText,
        updatedAt: now,
      },
    });
    if (decision.rule === 'override') {
      // Elegirlo anula un veto anterior del mismo usuario a ese título.
      await tx.delete(detectionRules).where(and(
        eq(detectionRules.owner, userId),
        eq(detectionRules.platform, platform),
        eq(detectionRules.fingerprint, fingerprint),
        eq(detectionRules.rule, 'reject'),
        eq(detectionRules.tmdbId, decision.tmdbId),
        eq(detectionRules.mediaType, decision.mediaType),
      ));
    }
  } else {
    // «No es este» sin elegir otro: si su propia regla apuntaba a este título, cae.
    await tx.delete(detectionRules).where(and(
      eq(detectionRules.owner, userId),
      eq(detectionRules.platform, platform),
      eq(detectionRules.fingerprint, fingerprint),
      eq(detectionRules.rule, 'override'),
      eq(detectionRules.tmdbId, reject.tmdbId),
      eq(detectionRules.mediaType, reject.mediaType),
    ));
  }

  const rejectingChosen = decision?.rule === 'override'
    && decision.tmdbId === reject.tmdbId && decision.mediaType === reject.mediaType;
  if (!rejectingChosen) {
    await tx.insert(detectionRules).values({
      owner: userId, platform, fingerprint, triggerText,
      rule: 'reject', tmdbId: reject.tmdbId, mediaType: reject.mediaType,
    }).onConflictDoNothing();
  }
}

/** Recalcula las reglas globales de una huella a partir de todas sus correcciones. */
async function recomputeGlobalRules(tx, platform, fingerprint, triggerText) {
  const corrections = await tx
    .select()
    .from(detectionCorrections)
    .where(and(
      eq(detectionCorrections.platform, platform),
      eq(detectionCorrections.fingerprint, fingerprint),
    ));
  const { decision, rejects } = aggregateGlobalRules(corrections, globalRuleMinSupporters());
  await tx.delete(detectionRules).where(and(
    eq(detectionRules.owner, GLOBAL_OWNER),
    eq(detectionRules.platform, platform),
    eq(detectionRules.fingerprint, fingerprint),
  ));
  const rows = [];
  if (decision) {
    rows.push({
      owner: GLOBAL_OWNER, platform, fingerprint, triggerText,
      rule: decision.rule,
      tmdbId: decision.tmdbId ?? null,
      mediaType: decision.mediaType ?? null,
      title: decision.title ?? null,
      posterPath: decision.posterPath ?? null,
      supporters: decision.supporters,
    });
  }
  for (const r of rejects) {
    rows.push({
      owner: GLOBAL_OWNER, platform, fingerprint, triggerText,
      rule: 'reject', tmdbId: r.tmdbId, mediaType: r.mediaType, supporters: r.supporters,
    });
  }
  if (rows.length) await tx.insert(detectionRules).values(rows);
}

export default async function streamingDetectionsRoutes(fastify) {
  // ── Token de sincronización ──────────────────────────────────────────────

  fastify.post('/detections/lookup', async (req, reply) => {
    const userId = await userIdForSyncToken(req);
    if (!userId) return reply.status(401).send({ error: 'Sync token is invalid or missing' });
    const parsed = lookupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    return lookupRules(db, userId, parsed.data.platform, parsed.data.fingerprint);
  });

  fastify.post('/detections', async (req, reply) => {
    const userId = await userIdForSyncToken(req);
    if (!userId) return reply.status(401).send({ error: 'Sync token is invalid or missing' });
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    const d = parsed.data;
    const isTv = d.mediaType === 'tv';
    const season = isTv ? (d.season ?? null) : null;
    const episode = isTv ? (d.episode ?? null) : null;

    const [recent] = await db
      .select({ id: streamingDetections.id })
      .from(streamingDetections)
      .where(and(
        eq(streamingDetections.userId, userId),
        eq(streamingDetections.platform, d.platform),
        eq(streamingDetections.kind, d.kind),
        eq(streamingDetections.fingerprint, d.fingerprint),
        eq(streamingDetections.tmdbId, d.tmdbId),
        eq(streamingDetections.mediaType, d.mediaType),
        season == null ? sql`${streamingDetections.season} IS NULL` : eq(streamingDetections.season, season),
        episode == null ? sql`${streamingDetections.episode} IS NULL` : eq(streamingDetections.episode, episode),
        eq(streamingDetections.status, 'active'),
        gt(streamingDetections.createdAt, new Date(Date.now() - DETECTION_REUSE_MS)),
      ))
      .orderBy(desc(streamingDetections.createdAt))
      .limit(1);
    if (recent) return { detectionId: recent.id, reused: true };

    const [row] = await db.insert(streamingDetections).values({
      userId,
      platform: d.platform,
      kind: d.kind,
      fingerprint: d.fingerprint,
      triggerText: d.triggerText,
      signal: d.signal,
      tmdbId: d.tmdbId,
      mediaType: d.mediaType,
      season,
      episode,
      title: d.title ?? null,
      posterPath: d.posterPath ?? null,
      confidence: d.confidence ?? null,
      source: d.source,
    }).returning({ id: streamingDetections.id });

    // Purga de lo antiguo de este usuario (barata: va por su índice).
    await db.delete(streamingDetections).where(and(
      eq(streamingDetections.userId, userId),
      lt(streamingDetections.createdAt, new Date(Date.now() - DETECTION_RETENTION_DAYS * 86_400_000)),
    ));

    return reply.status(201).send({ detectionId: row.id });
  });

  fastify.get('/rules/not-a-title', async (req, reply) => {
    const userId = await userIdForSyncToken(req);
    if (!userId) return reply.status(401).send({ error: 'Sync token is invalid or missing' });
    const rows = await db
      .select({
        platform: detectionRules.platform,
        fingerprint: detectionRules.fingerprint,
        owner: detectionRules.owner,
        supporters: detectionRules.supporters,
      })
      .from(detectionRules)
      .where(and(
        eq(detectionRules.rule, 'not_a_title'),
        or(eq(detectionRules.owner, userId), eq(detectionRules.owner, GLOBAL_OWNER)),
      ));
    // Un texto que el propio usuario volvió a asociar a un título no se oculta
    // aunque haya consenso global en contra.
    const mineOverrides = await db
      .select({ platform: detectionRules.platform, fingerprint: detectionRules.fingerprint })
      .from(detectionRules)
      .where(and(eq(detectionRules.owner, userId), eq(detectionRules.rule, 'override')));
    const overridden = new Set(mineOverrides.map((r) => r.fingerprint));
    const min = globalRuleMinSupporters();
    const byPlatform = {};
    for (const r of rows) {
      if (r.owner === GLOBAL_OWNER && (r.supporters < min || overridden.has(r.fingerprint))) continue;
      // La huella es «plataforma|texto normalizado»: los clientes comparan el texto.
      const text = r.fingerprint.slice(r.fingerprint.indexOf('|') + 1);
      if (!text) continue;
      (byPlatform[r.platform] ||= new Set()).add(text);
    }
    return {
      platforms: Object.fromEntries(Object.entries(byPlatform).map(([k, v]) => [k, [...v]])),
    };
  });

  // ── Sesión web ───────────────────────────────────────────────────────────

  fastify.get('/detections', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    const since = new Date(Date.now() - parsed.data.days * 86_400_000);
    const rows = await db
      .select()
      .from(streamingDetections)
      .where(and(eq(streamingDetections.userId, req.user.id), gt(streamingDetections.createdAt, since)))
      .orderBy(desc(streamingDetections.createdAt))
      .limit(parsed.data.limit);
    return { results: rows.map(toDetectionResult) };
  });

  fastify.get('/detections/:id', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.status(404).send({ error: 'Detection not found' });
    const [row] = await db
      .select()
      .from(streamingDetections)
      .where(and(eq(streamingDetections.id, id.data), eq(streamingDetections.userId, req.user.id)))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'Detection not found' });
    return { detection: toDetectionResult(row) };
  });

  fastify.post('/detections/:id/correction', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.status(404).send({ error: 'Detection not found' });
    const parsed = correctionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', issues: parsed.error.issues });
    }
    const body = parsed.data;
    const userId = req.user.id;

    const result = await db.transaction(async (tx) => {
      const [detection] = await tx
        .select()
        .from(streamingDetections)
        .where(and(eq(streamingDetections.id, id.data), eq(streamingDetections.userId, userId)))
        .for('update')
        .limit(1);
      if (!detection) return null;

      const target = body.verdict === 'wrong_title' && body.tmdbId
        ? {
            tmdbId: body.tmdbId,
            mediaType: body.mediaType,
            // Temporada sin episodio no identifica nada: queda a nivel serie.
            season: body.mediaType === 'tv' && body.episode ? (body.season ?? null) : null,
            episode: body.mediaType === 'tv' && body.season ? (body.episode ?? null) : null,
            title: body.title || null,
            posterPath: body.posterPath || null,
          }
        : null;
      const sameAsDetected = target
        && target.tmdbId === detection.tmdbId && target.mediaType === detection.mediaType;

      const correction = {
        userId,
        detectionId: detection.id,
        platform: detection.platform,
        fingerprint: detection.fingerprint,
        triggerText: detection.triggerText,
        verdict: body.verdict,
        rejectedTmdbId: detection.tmdbId,
        rejectedMediaType: detection.mediaType,
        tmdbId: target?.tmdbId ?? null,
        mediaType: target?.mediaType ?? null,
        season: target?.season ?? null,
        episode: target?.episode ?? null,
        title: target?.title ?? null,
        posterPath: target?.posterPath ?? null,
        signal: detection.signal,
        createdAt: new Date(),
      };
      await tx.insert(detectionCorrections).values(correction).onConflictDoUpdate({
        target: [detectionCorrections.userId, detectionCorrections.detectionId],
        set: {
          verdict: correction.verdict,
          tmdbId: correction.tmdbId,
          mediaType: correction.mediaType,
          season: correction.season,
          episode: correction.episode,
          title: correction.title,
          posterPath: correction.posterPath,
          createdAt: correction.createdAt,
        },
      });

      const [updated] = await tx.update(streamingDetections).set({
        status: 'corrected',
        correctedTmdbId: target?.tmdbId ?? null,
        correctedMediaType: target?.mediaType ?? null,
        correctedSeason: target?.season ?? null,
        correctedEpisode: target?.episode ?? null,
        correctedTitle: target?.title ?? null,
        correctedPosterPath: target?.posterPath ?? null,
      }).where(eq(streamingDetections.id, detection.id)).returning();

      const data = await reassignDetectionData(tx, userId, detection.id, target);

      // Solo se aprende de huellas útiles, y nunca de «era el mismo título» (solo
      // se cambió el episodio: el título no estaba mal).
      if (detection.fingerprint && !sameAsDetected) {
        await applyUserRules(tx, userId, correction);
        await recomputeGlobalRules(tx, detection.platform, detection.fingerprint, detection.triggerText);
      }
      return { detection: toDetectionResult(updated), data };
    });

    if (!result) return reply.status(404).send({ error: 'Detection not found' });
    // El historial ha podido cambiar: la caché de nivel se rehace ya.
    await invalidateLevelState(db, userId).catch(() => {});
    return { ok: true, ...result };
  });
}
