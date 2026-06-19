// src/db/schema.js
// Esquema completo de la base de datos con Drizzle ORM

import {
  pgTable,
  uuid,
  text,
  boolean,
  smallint,
  integer,
  timestamp,
  jsonb,
  inet,
  uniqueIndex,
  index,
  check,
  real,
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdIdx: index('idx_watch_history_user_id').on(t.userId),
  tmdbIdx: index('idx_watch_history_tmdb').on(t.userId, t.tmdbId, t.mediaType),
  watchedAtIdx: index('idx_watch_history_watched_at').on(t.userId, t.watchedAt),
  mediaTypeCheck: check('chk_watch_history_media_type', sql`media_type IN ('movie', 'tv')`),
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
  mediaType: text('media_type').notNull(),                // 'movie' | 'tv' | 'episode'
  season: integer('season'),
  episode: integer('episode'),
  rating: real('rating').notNull(),                   // 1–10
  title: text('title'),
  posterPath: text('poster_path'),
  ratedAt: timestamp('rated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueRating: uniqueIndex('idx_ratings_unique').on(t.userId, t.tmdbId, t.mediaType, t.season, t.episode),
  userIdIdx: index('idx_ratings_user_id').on(t.userId),
  mediaTypeCheck: check('chk_ratings_media_type', sql`media_type IN ('movie', 'tv', 'episode')`),
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
  isPublic: boolean('is_public').default(false).notNull(),
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
