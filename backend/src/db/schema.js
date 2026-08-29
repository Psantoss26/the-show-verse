// src/db/schema.js
// Esquema completo de la base de datos con Drizzle ORM

import {
  pgTable,
  uuid,
  text,
  boolean,
  smallint,
  integer,
  bigint,
  timestamp,
  jsonb,
  inet,
  uniqueIndex,
  index,
  check,
  real,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  plan: text('plan').default('free').notNull(),           // 'free' | 'pro' | 'family'
  planExpiresAt: timestamp('plan_expires_at', { withTimezone: true }),
  locale: text('locale').default('es-ES'),
  timezone: text('timezone').default('Europe/Madrid'),
  isActive: boolean('is_active').default(true).notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// REFRESH TOKENS
// ─────────────────────────────────────────────
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').unique().notNull(),
  deviceName: text('device_name'),
  ipAddress: inet('ip_address'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_refresh_tokens_user_id').on(t.userId),
}));

// ─────────────────────────────────────────────
// EMAIL CHANGE TOKENS
// ─────────────────────────────────────────────
// El correo no se cambia hasta que el usuario demuestra que controla la nueva
// dirección. Sólo se guarda el hash del token de un solo uso, nunca el token
// que viaja en el enlace de verificación.
export const emailChangeTokens = pgTable('email_change_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  tokenHash: text('token_hash').unique().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_email_change_tokens_user_id').on(t.userId),
  expiresAtIdx: index('idx_email_change_tokens_expires_at').on(t.expiresAt),
}));

// ─────────────────────────────────────────────
// CONNECTED ACCOUNTS (OAuth / Trakt import)
// ─────────────────────────────────────────────
export const connectedAccounts = pgTable('connected_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),                   // 'trakt' | 'google' | 'plex'
  providerUid: text('provider_uid').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  providerUnique: uniqueIndex('idx_connected_accounts_provider').on(t.provider, t.providerUid),
  userIdIdx: index('idx_connected_accounts_user').on(t.userId),
}));

// ─────────────────────────────────────────────
// WATCH HISTORY
// ─────────────────────────────────────────────
export const watchHistory = pgTable('watch_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),                // 'movie' | 'tv'
  season: integer('season'),                              // null para películas
  episode: integer('episode'),                            // null para películas
  watchedAt: timestamp('watched_at', { withTimezone: true }).defaultNow().notNull(),
  runtimeMins: integer('runtime_mins'),
  // Metadatos cacheados para rendimiento sin join a TMDb:
  title: text('title'),
  posterPath: text('poster_path'),
  // Confianza de la resolución del visionado sincronizado:
  //   'high' | 'medium' | 'low'  ('low' = fallback a nivel serie sin episodio).
  confidence: text('confidence').default('high'),
  // Agrupa los episodios insertados por una única acción de serie completada.
  // El historial sigue siendo detallado; el feed público los representa juntos.
  activityGroup: text('activity_group'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_watch_history_user_id').on(t.userId),
  tmdbIdx: index('idx_watch_history_tmdb').on(t.userId, t.tmdbId, t.mediaType),
  watchedAtIdx: index('idx_watch_history_watched_at').on(t.userId, t.watchedAt),
  activityGroupIdx: index('idx_watch_history_activity_group').on(t.userId, t.activityGroup),
  mediaTypeCheck: check('chk_watch_history_media_type', sql`media_type IN ('movie', 'tv')`),
}));

// ─────────────────────────────────────────────
// WATCH PROGRESS (reanudación / "Continuar viendo" desde streaming)
// ─────────────────────────────────────────────
// Estado ACTUAL de reproducción por título/episodio (upsert). Distinto de
// watch_history (eventos de "visto"). season/episode = 0 para películas o cuando
// no hay episodio concreto, para que el índice único funcione con el upsert.
export const watchProgress = pgTable('watch_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),                // 'movie' | 'tv'
  season: integer('season').default(0).notNull(),
  episode: integer('episode').default(0).notNull(),
  positionSeconds: integer('position_seconds').default(0).notNull(),
  runtimeSeconds: integer('runtime_seconds').default(0).notNull(),
  percent: real('percent').default(0).notNull(),          // 0..1
  platform: text('platform'),
  title: text('title'),
  posterPath: text('poster_path'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  itemUnique: uniqueIndex('idx_watch_progress_item').on(t.userId, t.tmdbId, t.mediaType, t.season, t.episode),
  userUpdatedIdx: index('idx_watch_progress_user_updated').on(t.userId, t.updatedAt),
  mediaTypeCheck: check('chk_watch_progress_media_type', sql`media_type IN ('movie', 'tv')`),
}));

// ─────────────────────────────────────────────
// FAVORITES
// ─────────────────────────────────────────────
export const favorites = pgTable('favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),                // 'movie' | 'tv'
  title: text('title'),
  posterPath: text('poster_path'),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueFavorite: uniqueIndex('idx_favorites_unique').on(t.userId, t.tmdbId, t.mediaType),
  userIdIdx: index('idx_favorites_user_id').on(t.userId, t.addedAt),
  mediaTypeCheck: check('chk_favorites_media_type', sql`media_type IN ('movie', 'tv')`),
}));

// ─────────────────────────────────────────────
// WATCHLIST
// ─────────────────────────────────────────────
export const watchlist = pgTable('watchlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),                // 'movie' | 'tv'
  title: text('title'),
  posterPath: text('poster_path'),
  priority: integer('priority').default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueWatchlist: uniqueIndex('idx_watchlist_unique').on(t.userId, t.tmdbId, t.mediaType),
  userIdIdx: index('idx_watchlist_user_id').on(t.userId, t.addedAt),
  mediaTypeCheck: check('chk_watchlist_media_type', sql`media_type IN ('movie', 'tv')`),
}));

// ─────────────────────────────────────────────
// USER RATINGS
// ─────────────────────────────────────────────
export const userRatings = pgTable('user_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),                // 'movie' | 'tv' | 'season' | 'episode'
  season: integer('season'),
  episode: integer('episode'),
  rating: real('rating').notNull(),                   // 1–10
  title: text('title'),
  posterPath: text('poster_path'),
  ratedAt: timestamp('rated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueTitleRating: uniqueIndex('idx_ratings_unique_title').on(t.userId, t.tmdbId, t.mediaType).where(sql`media_type IN ('movie', 'tv') AND season IS NULL AND episode IS NULL`),
  uniqueSeasonRating: uniqueIndex('idx_ratings_unique_season').on(t.userId, t.tmdbId, t.season).where(sql`media_type = 'season' AND season IS NOT NULL AND episode IS NULL`),
  uniqueEpisodeRating: uniqueIndex('idx_ratings_unique_episode').on(t.userId, t.tmdbId, t.season, t.episode).where(sql`media_type = 'episode' AND season IS NOT NULL AND episode IS NOT NULL`),
  userIdIdx: index('idx_ratings_user_id').on(t.userId),
  mediaTypeCheck: check('chk_ratings_media_type', sql`media_type IN ('movie', 'tv', 'season', 'episode')`),
  ratingCheck: check('chk_ratings_value', sql`rating BETWEEN 1 AND 10`),
}));

// ─────────────────────────────────────────────
// USER LISTS
// ─────────────────────────────────────────────
export const userLists = pgTable('user_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  isPublic: boolean('is_public').default(true).notNull(),
  sortBy: text('sort_by').default('added_at'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_user_lists_user_id').on(t.userId),
}));

export const userListItems = pgTable('user_list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  listId: uuid('list_id').notNull().references(() => userLists.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),
  title: text('title'),
  posterPath: text('poster_path'),
  // La puntuación pública recibida al añadir el título. Guardarla evita tener
  // que consultar TMDb otra vez para calcular la media de una lista grande.
  voteAverage: real('vote_average'),
  position: integer('position').default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueListItem: uniqueIndex('idx_list_items_unique').on(t.listId, t.tmdbId, t.mediaType),
  listIdIdx: index('idx_list_items_list_id').on(t.listId, t.position),
}));

// ─────────────────────────────────────────────
// TMDb CACHE
// ─────────────────────────────────────────────
export const tmdbCache = pgTable('tmdb_cache', {
  cacheKey: text('cache_key').primaryKey(),               // ej: 'movie:550' | 'tv:1396'
  data: jsonb('data').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  expiresIdx: index('idx_tmdb_cache_expires').on(t.expiresAt),
}));

// ─────────────────────────────────────────────
// USER PREFERENCES
// ─────────────────────────────────────────────
export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  defaultView: text('default_view').default('grid'),      // 'grid' | 'list' | 'compact'
  language: text('language').default('es-ES'),
  adultContent: boolean('adult_content').default(false),
  notificationSettings: jsonb('notification_settings').default({}),
  uiSettings: jsonb('ui_settings').default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────
// SUBSCRIPTIONS (Stripe billing)
// ─────────────────────────────────────────────
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  plan: text('plan').notNull(),                           // 'pro' | 'family'
  status: text('status').notNull(),                       // 'active' | 'cancelled' | 'past_due'
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_subscriptions_user_id').on(t.userId),
}));

// ─────────────────────────────────────────────
// DASHBOARD POOLS
// ─────────────────────────────────────────────
export const dashboardPools = pgTable('dashboard_pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  poolKey: text('pool_key').notNull(),          // 'trending','popular','top_rated','acclaimed','blockbusters','hidden_gems','anticipated','new_releases','region_top','genre:28','decade:1990'
  mediaType: text('media_type').notNull(),       // 'movie' | 'tv'
  items: jsonb('items').notNull().default([]),    // card item array
  builtAt: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  keyTypeUq: unique('uq_dashboard_pools_key_type').on(t.poolKey, t.mediaType),
  expiresIdx: index('idx_dashboard_pools_expires').on(t.expiresAt),
}));

// ─────────────────────────────────────────────
// USER RECOMMENDATIONS
// ─────────────────────────────────────────────
export const userRecommendations = pgTable('user_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mediaType: text('media_type').notNull(),       // 'movie' | 'tv'
  items: jsonb('items').notNull().default([]),    // rec item array
  basisHash: text('basis_hash').notNull().default(''),
  builtAt: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  userTypeUq: unique('uq_user_rec_user_type').on(t.userId, t.mediaType),
  userIdx: index('idx_user_rec_user').on(t.userId),
}));

// ─────────────────────────────────────────────
// COMMUNITY CONTENT (seeded from Trakt, then owned by us)
// ─────────────────────────────────────────────
export const titleCommunityState = pgTable('title_community_state', {
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),            // 'movie' | 'tv'
  traktId: integer('trakt_id'),
  status: text('status').default('pending').notNull(),// pending|seeding|ready|failed
  commentCount: integer('comment_count').default(0).notNull(),
  seededAt: timestamp('seeded_at', { withTimezone: true }),
  sentimentBuiltAt: timestamp('sentiment_built_at', { withTimezone: true }),
  sentimentProvider: text('sentiment_provider'),      // heuristic|ollama|openai|gemini
  attempts: integer('attempts').default(0).notNull(),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: uniqueIndex('idx_title_state_pk').on(t.tmdbId, t.mediaType),
  statusIdx: index('idx_title_state_status').on(t.status, t.nextRetryAt),
  mediaTypeCheck: check('chk_title_state_media_type', sql`media_type IN ('movie','tv')`),
}));

export const titleComments = pgTable('title_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),
  source: text('source').notNull(),                   // 'trakt' | 'native'
  externalId: bigint('external_id', { mode: 'number' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  authorName: text('author_name'),
  authorUsername: text('author_username'),
  authorAvatarUrl: text('author_avatar_url'),
  authorIsVip: boolean('author_is_vip').default(false),
  body: text('body').notNull(),
  likes: integer('likes').default(0).notNull(),
  spoiler: boolean('spoiler').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  externalUnique: uniqueIndex('idx_title_comments_external').on(t.externalId).where(sql`external_id IS NOT NULL`),
  likesIdx: index('idx_title_comments_likes').on(t.tmdbId, t.mediaType, t.likes),
  createdIdx: index('idx_title_comments_created').on(t.tmdbId, t.mediaType, t.createdAt),
  sourceCheck: check('chk_title_comments_source', sql`source IN ('trakt','native')`),
}));

export const titleSentiment = pgTable('title_sentiment', {
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),
  good: jsonb('good').default([]).notNull(),          // [{ text_es }]
  bad: jsonb('bad').default([]).notNull(),
  provider: text('provider'),
  model: text('model'),
  sourceCommentCount: integer('source_comment_count').default(0).notNull(),
  isProvisional: boolean('is_provisional').default(false).notNull(),
  builtAt: timestamp('built_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: uniqueIndex('idx_title_sentiment_pk').on(t.tmdbId, t.mediaType),
}));

export const communityLists = pgTable('community_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(),                   // 'trakt' | 'user'
  externalId: bigint('external_id', { mode: 'number' }),
  userListId: uuid('user_list_id').references(() => userLists.id, { onDelete: 'cascade' }),
  slug: text('slug'),
  name: text('name').notNull(),
  description: text('description'),
  ownerName: text('owner_name'),
  ownerUsername: text('owner_username'),
  ownerAvatarUrl: text('owner_avatar_url'),
  itemCount: integer('item_count').default(0).notNull(),
  copiedItemCount: integer('copied_item_count').default(0).notNull(),
  likes: integer('likes').default(0).notNull(),
  privacy: text('privacy'),
  traktUrl: text('trakt_url'),
  previewPosters: jsonb('preview_posters').default([]).notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  externalUnique: uniqueIndex('idx_community_lists_external').on(t.externalId).where(sql`source = 'trakt' AND external_id IS NOT NULL`),
  likesIdx: index('idx_community_lists_likes').on(t.likes),
  itemsIdx: index('idx_community_lists_items').on(t.itemCount),
}));

export const communityListItems = pgTable('community_list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  listId: uuid('list_id').notNull().references(() => communityLists.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),
  title: text('title'),
  posterPath: text('poster_path'),
  voteAverage: real('vote_average'),
  position: integer('position').default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueItem: uniqueIndex('idx_community_list_items_unique').on(t.listId, t.tmdbId, t.mediaType),
  byTitleIdx: index('idx_community_list_items_title').on(t.tmdbId, t.mediaType),
  byListIdx: index('idx_community_list_items_list').on(t.listId, t.position),
}));

// ─────────────────────────────────────────────
// FOLLOWS (grafo social: follower → following)
// ─────────────────────────────────────────────
export const follows = pgTable('follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: uuid('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Un par (seguidor, seguido) es único: seguir es idempotente.
  uniquePair: uniqueIndex('idx_follows_pair').on(t.followerId, t.followingId),
  // "¿Quién sigue a X?" → índice por seguido. El de seguidor lo cubre el único.
  followingIdx: index('idx_follows_following').on(t.followingId, t.createdAt),
  followerIdx: index('idx_follows_follower').on(t.followerId, t.createdAt),
  // No autoseguirse.
  notSelf: check('chk_follows_not_self', sql`follower_id <> following_id`),
}));

// ─────────────────────────────────────────────
// PROFILE FAVORITES (hasta 5 películas y 5 series destacadas del perfil,
// curadas a mano;
// distintos del corazón/favoritos). Estilo "Favorite Films" de Letterboxd.
// ─────────────────────────────────────────────
export const profileFavorites = pgTable('profile_favorites', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),                // 'movie' | 'tv'
  title: text('title'),
  posterPath: text('poster_path'),
  position: integer('position').default(0).notNull(),     // 0-4 por tipo (orden de exhibición)
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueFavorite: uniqueIndex('idx_profile_favorites_unique').on(t.userId, t.tmdbId, t.mediaType),
  userIdIdx: index('idx_profile_favorites_user').on(t.userId, t.position),
  mediaTypeCheck: check('chk_profile_favorites_media_type', sql`media_type IN ('movie', 'tv')`),
}));

// ─────────────────────────────────────────────
// NIVEL Y EXPERIENCIA
// ─────────────────────────────────────────────
// El XP se DERIVA del estado actual del resto de las tablas (ver
// backend/src/level/rules.js): el mismo historial siempre da el mismo XP, un
// reimport no duplica nada y todo el historial previo cuenta retroactivamente.
// Esta tabla es solo la caché del cálculo, con el mismo patrón de expiración que
// dashboard_pools y user_recommendations. Borrar una fila es seguro: se
// reconstruye en la siguiente lectura.
export const userLevelState = pgTable('user_level_state', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  xp: integer('xp').default(0).notNull(),
  level: smallint('level').default(1).notNull(),
  tier: text('tier').default('espectador').notNull(),
  // Recuentos por fuente y XP que aporta cada una (rules.computeXpBreakdown).
  breakdown: jsonb('breakdown').default({}).notNull(),
  // Agregados en bruto, para no repetir las consultas al pintar la pestaña.
  stats: jsonb('stats').default({}).notNull(),
  streaks: jsonb('streaks').default({}).notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  expiresIdx: index('idx_user_level_state_expires').on(t.expiresAt),
  // La clasificación por XP y el ranking de la comunidad leen por este orden.
  xpIdx: index('idx_user_level_state_xp').on(t.xp),
}));

// Los logros SÍ se persisten: el XP puede bajar (si el usuario borra favoritos),
// pero un logro conseguido no se pierde y su fecha de desbloqueo debe ser la
// real, no la del último recálculo.
export const userAchievements = pgTable('user_achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievementId: text('achievement_id').notNull(),   // id del catálogo en level/achievements.js
  unlockedAt: timestamp('unlocked_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueAchievement: uniqueIndex('idx_user_achievements_unique').on(t.userId, t.achievementId),
  userIdx: index('idx_user_achievements_user').on(t.userId, t.unlockedAt),
}));

// ─────────────────────────────────────────────
// ME GUSTA (reseñas y listas de la comunidad)
// ─────────────────────────────────────────────
// title_comments.likes y community_lists.likes existían ya como contador, pero
// solo se rellenaban al importar de Trakt. Estas tablas registran quién dio cada
// me gusta —necesario para que sea idempotente, para poder quitarlo y para el XP
// social— y mantienen el contador denormalizado que ya consumen los listados.
export const commentLikes = pgTable('comment_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  commentId: uuid('comment_id').notNull().references(() => titleComments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueLike: uniqueIndex('idx_comment_likes_unique').on(t.userId, t.commentId),
  commentIdx: index('idx_comment_likes_comment').on(t.commentId),
  userIdx: index('idx_comment_likes_user').on(t.userId, t.createdAt),
}));

export const listLikes = pgTable('list_likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  listId: uuid('list_id').notNull().references(() => communityLists.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueLike: uniqueIndex('idx_list_likes_unique').on(t.userId, t.listId),
  listIdx: index('idx_list_likes_list').on(t.listId),
  userIdx: index('idx_list_likes_user').on(t.userId, t.createdAt),
}));

// ─────────────────────────────────────────────
// RECOMMENDATION DISMISSALS (títulos descartados en la sección de
// Recomendaciones, con su flujo de deslizar). Se guardan en la base de datos y
// no en el navegador para que un descarte valga en todos los dispositivos: es
// una decisión del usuario sobre su catálogo, no una preferencia de la sesión.
// ─────────────────────────────────────────────
export const recommendationDismissals = pgTable('recommendation_dismissals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: text('media_type').notNull(),                // 'movie' | 'tv'
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  // Descartar dos veces el mismo título no debe duplicar filas: el POST hace
  // upsert sobre esta clave.
  uniqueDismissal: uniqueIndex('idx_recommendation_dismissals_unique').on(t.userId, t.tmdbId, t.mediaType),
  // La consulta habitual es "todos los descartes de este usuario" para filtrar
  // la baraja, ordenados por fecha para poder deshacer el último.
  userIdIdx: index('idx_recommendation_dismissals_user').on(t.userId, t.dismissedAt),
  mediaTypeCheck: check('chk_recommendation_dismissals_media_type', sql`media_type IN ('movie', 'tv')`),
}));
