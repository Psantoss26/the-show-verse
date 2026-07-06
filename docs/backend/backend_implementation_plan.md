# 🏗️ Plan de Implementación: Backend Propio de The Show Verse

## Contexto y objetivo

The Show Verse es una app Next.js 16 que actualmente delega **toda la gestión de datos de usuario** a dos servicios externos: **Trakt.tv** (auth + historial + favoritos + watchlist + ratings + listas) y **TMDb** (metadatos de contenido). El objetivo es construir un backend propio que:

1. Elimine la dependencia de Trakt para datos de usuario
2. Mantenga TMDb sólo como fuente de metadatos (con licencia comercial)
3. Permita multi-usuario real, autenticación propia y monetización
4. No pierda ningún dato ni funcionalidad existente

---

## ⚠️ User Review Required

> [!IMPORTANT]
> **Decisión clave de arquitectura**: ¿Backend separado o integrado en Next.js?
>
> - **Opción A (Recomendada):** API REST separada en Node.js/Express o Fastify, desplegada en Railway/Render/VPS. Next.js actúa solo como frontend + BFF ligero.
> - **Opción B:** Expandir las Next.js API Routes actuales para ser el backend completo. Más simple de arrancar, pero mezcla concerns y no escala igual de bien.
>
> El plan propone la **Opción A** para poder escalar el backend independientemente del frontend.

> [!IMPORTANT]
> **Trakt como opción de importación**: El plan propone mantener Trakt como opción de importación inicial (para que los usuarios actuales migren sus datos), pero **no como dependencia en producción**. ¿Confirmas esta estrategia?

> [!WARNING]
> **Licencia TMDb antes de comercializar**: Antes de cobrar a usuarios, debes contactar a TMDb (developers@themoviedb.org) para obtener licencia comercial. El plan asume que esto se gestiona en paralelo con el desarrollo.

---

## Open Questions

> [!IMPORTANT]
> **¿Dónde quieres desplegar el backend?**
> - Tu NAS (192.168.1.126) — ya tienes Plex y Ollama ahí, puedes añadir más servicios con Docker
> - Railway / Render (cloud managed, ~$5-20/mes)
> - VPS propio (Hetzner, DigitalOcean — más control, similar precio)

> [!NOTE]
> **¿Quieres comentarios propios (sin Trakt)?**
> Actualmente los comentarios vienen de la comunidad de Trakt. Con el backend propio perderías esa comunidad pero ganarías control. ¿Los comentarios son una feature prioritaria?

> [!NOTE]
> **¿Qué pasa con Plex?**
> La integración con Plex es personal (tu NAS). Para una app comercial multi-usuario, cada usuario necesitaría conectar su propio Plex. ¿Quieres mantener Plex como feature opcional?

---

## Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTES                                 │
│   Browser  ·  Mobile (futuro)  ·  API pública (futuro)      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│              Next.js 16 (Frontend + BFF)                     │
│         theshowverse.com — Vercel / VPS                      │
│                                                              │
│  • Páginas y UI (actual, sin cambios)                        │
│  • Next.js API Routes → proxy a Backend API                  │
│  • Auth cookies (httpOnly JWT)                               │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP interno / privado
┌────────────────────────▼────────────────────────────────────┐
│              Backend API (Node.js + Fastify)                 │
│              api.theshowverse.com o NAS:3001                 │
│                                                              │
│  • Auth (JWT + refresh tokens)                               │
│  • User data (favoritos, historial, watchlist, ratings)      │
│  • Caché de TMDb (Redis)                                     │
│  • Rate limiting, logs, métricas                             │
└──────┬────────────────────────────────────────┬─────────────┘
       │                                        │
┌──────▼────────┐                    ┌──────────▼────────────┐
│  PostgreSQL   │                    │        Redis           │
│  (User data)  │                    │  (Cache TMDb + Rate   │
│               │                    │   Limit + Sessions)   │
└───────────────┘                    └───────────────────────┘
       │
┌──────▼────────────────────────────────────────────────────┐
│              APIs Externas (solo lectura)                   │
│   TMDb (metadatos)  ·  Deezer (música)  ·  iTunes (música) │
│   Trakt (solo importación inicial, no dependencia core)     │
└───────────────────────────────────────────────────────────┘
```

---

## Base de Datos: PostgreSQL

### Justificación de PostgreSQL vs alternativas

| BD | Ventaja | Desventaja |
|----|---------|------------|
| **PostgreSQL** ✅ | ACID, JSON nativo, relaciones complejas, índices potentes | Más setup que NoSQL |
| MongoDB | Flexible, fácil de arrancar | No tan bueno para relaciones; licencia SSPL |
| SQLite | Cero infra | No multiusuario concurrent |
| MySQL | Conocido | Peor soporte JSON, licencia Oracle |

### Esquema completo de tablas

#### `users`
```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT,                        -- NULL si solo usa OAuth social
  display_name    TEXT,
  avatar_url      TEXT,
  bio             TEXT,
  plan            TEXT DEFAULT 'free',         -- 'free' | 'pro' | 'family'
  plan_expires_at TIMESTAMPTZ,
  locale          TEXT DEFAULT 'es-ES',
  timezone        TEXT DEFAULT 'Europe/Madrid',
  is_active       BOOLEAN DEFAULT true,
  email_verified  BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `refresh_tokens`
```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  device_name TEXT,
  ip_address  INET,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### `connected_accounts` (para OAuth social futuro + Trakt import)
```sql
CREATE TABLE connected_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,                  -- 'trakt' | 'google' | 'plex'
  provider_uid TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_uid)
);
```

#### `watch_history`
```sql
CREATE TABLE watch_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id       INTEGER NOT NULL,
  media_type    TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  -- Para episodios:
  season        INTEGER,
  episode       INTEGER,
  watched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  runtime_mins  INTEGER,
  -- Metadatos cacheados para rendimiento:
  title         TEXT,
  poster_path   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX idx_watch_history_tmdb ON watch_history(user_id, tmdb_id, media_type);
CREATE INDEX idx_watch_history_watched_at ON watch_history(user_id, watched_at DESC);
```

#### `favorites`
```sql
CREATE TABLE favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  -- Metadatos cacheados:
  title       TEXT,
  poster_path TEXT,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id, media_type)
);

CREATE INDEX idx_favorites_user_id ON favorites(user_id, added_at DESC);
```

#### `watchlist`
```sql
CREATE TABLE watchlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title       TEXT,
  poster_path TEXT,
  priority    INTEGER DEFAULT 0,               -- orden personalizado
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id, media_type)
);

CREATE INDEX idx_watchlist_user_id ON watchlist(user_id, added_at DESC);
```

#### `user_ratings`
```sql
CREATE TABLE user_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv', 'episode')),
  season      INTEGER,                         -- para episodios
  episode     INTEGER,                         -- para episodios
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 10),
  title       TEXT,
  rated_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id, media_type, season, episode)
);

CREATE INDEX idx_ratings_user_id ON user_ratings(user_id);
```

#### `user_lists`
```sql
CREATE TABLE user_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_public   BOOLEAN DEFAULT false,
  sort_by     TEXT DEFAULT 'added_at',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID NOT NULL REFERENCES user_lists(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL,
  title       TEXT,
  poster_path TEXT,
  position    INTEGER DEFAULT 0,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, tmdb_id, media_type)
);

CREATE INDEX idx_list_items_list_id ON user_list_items(list_id, position);
```

#### `tmdb_cache` (caché de metadatos)
```sql
CREATE TABLE tmdb_cache (
  cache_key   TEXT PRIMARY KEY,               -- ej: 'movie:550' | 'tv:1396'
  data        JSONB NOT NULL,
  fetched_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_tmdb_cache_expires ON tmdb_cache(expires_at);
```

#### `user_preferences`
```sql
CREATE TABLE user_preferences (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_view   TEXT DEFAULT 'grid',          -- 'grid' | 'list' | 'compact'
  language       TEXT DEFAULT 'es-ES',
  adult_content  BOOLEAN DEFAULT false,
  notification_settings JSONB DEFAULT '{}',
  ui_settings    JSONB DEFAULT '{}',
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
```

#### `subscriptions` (para billing)
```sql
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  plan            TEXT NOT NULL,              -- 'pro' | 'family'
  status          TEXT NOT NULL,             -- 'active' | 'cancelled' | 'past_due'
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API REST — Diseño Completo

**Base URL:** `https://api.theshowverse.com/v1`

### Autenticación

```
POST   /auth/register          — Crear cuenta (email + password)
POST   /auth/login             — Login, devuelve access + refresh token
POST   /auth/refresh           — Renovar access token
POST   /auth/logout            — Revocar refresh token
POST   /auth/logout/all        — Revocar todos los tokens del usuario
POST   /auth/forgot-password   — Enviar email de reset
POST   /auth/reset-password    — Cambiar contraseña con token
GET    /auth/me                — Perfil del usuario autenticado
PATCH  /auth/me                — Actualizar perfil
```

### Importación desde Trakt (migración)

```
POST   /import/trakt           — Inicia importación: history + favorites + watchlist + ratings
GET    /import/trakt/status    — Estado de la importación en curso
```

### Historial de visionado

```
GET    /history                — Historial paginado (filtros: type, from, to, page, limit)
GET    /history/stats          — Estadísticas: total películas/eps, tiempo, géneros
POST   /history                — Añadir entrada (película o episodio)
DELETE /history/:id            — Eliminar entrada específica
DELETE /history/bulk           — Eliminar múltiples entradas (body: { ids: [...] })

GET    /history/shows/:tmdbId  — Episodios vistos de una serie (watchedBySeason)
GET    /history/movies/:tmdbId — Visionados de una película (plays, lastWatchedAt)
GET    /history/episodes/:tmdbId/:season/:episode — Visionados de un episodio

POST   /history/episodes       — Marcar episodio como visto/no visto
POST   /history/seasons        — Marcar temporada completa como vista/no vista
```

### Favoritos

```
GET    /favorites              — Lista de favoritos (filtros: type, page)
POST   /favorites              — Añadir favorito { tmdbId, mediaType }
DELETE /favorites/:tmdbId/:mediaType — Quitar favorito
GET    /favorites/check/:tmdbId/:mediaType — ¿Está en favoritos?
```

### Watchlist

```
GET    /watchlist              — Lista pendientes (filtros: type, page, sort)
POST   /watchlist              — Añadir a watchlist { tmdbId, mediaType }
DELETE /watchlist/:tmdbId/:mediaType — Quitar de watchlist
PATCH  /watchlist/:tmdbId/:mediaType — Actualizar prioridad
GET    /watchlist/check/:tmdbId/:mediaType — ¿Está en watchlist?
```

### Estado de item (reemplaza /api/trakt/item/status)

```
GET    /items/:tmdbId/:mediaType/status
  → { favorite, inWatchlist, watched, rating, watchedBySeason? }
```

### Ratings

```
GET    /ratings                — Todos los ratings del usuario
POST   /ratings                — Dar/actualizar rating { tmdbId, mediaType, rating, season?, episode? }
DELETE /ratings/:tmdbId/:mediaType — Quitar rating
```

### Listas personalizadas

```
GET    /lists                  — Listas del usuario
POST   /lists                  — Crear lista { name, description, isPublic }
GET    /lists/:id              — Detalle de una lista (incluye items)
PATCH  /lists/:id              — Editar lista
DELETE /lists/:id              — Eliminar lista
POST   /lists/:id/items        — Añadir item a lista
DELETE /lists/:id/items/:tmdbId/:mediaType — Quitar item de lista
PATCH  /lists/:id/items/reorder — Reordenar items
```

### Proxy de TMDb (con caché)

```
GET    /tmdb/movie/:id         — Detalles película (con caché Redis 10min)
GET    /tmdb/tv/:id            — Detalles serie
GET    /tmdb/person/:id        — Detalles actor
GET    /tmdb/search            — Búsqueda (?q=, type, page)
GET    /tmdb/discover/movies   — Discover películas con filtros
GET    /tmdb/discover/tv       — Discover series con filtros
GET    /tmdb/trending          — Trending (week/day)
GET    /tmdb/:type/:id/providers — Watch providers (reemplaza JustWatch)
```

### Dashboard / Estadísticas

```
GET    /dashboard              — Datos del dashboard: in-progress, recently watched, stats
GET    /stats                  — Estadísticas completas del usuario
GET    /stats/calendar         — Actividad por días/meses (para el calendario)
GET    /stats/genres           — Distribución por géneros
GET    /stats/shows/in-progress — Series en progreso
GET    /stats/shows/completed  — Series completadas
```

### Perfil y preferencias

```
GET    /profile                — Perfil público del usuario (si es público)
PATCH  /preferences            — Actualizar preferencias (view, language, etc)
GET    /preferences            — Obtener preferencias
```

### Suscripciones / Billing

```
POST   /billing/checkout       — Crear sesión de Stripe Checkout
POST   /billing/portal         — Acceso al Stripe Customer Portal
POST   /billing/webhook        — Webhook de Stripe (eventos de suscripción)
GET    /billing/status         — Estado de la suscripción del usuario
```

---

## Stack Tecnológico del Backend

### Runtime y Framework

| Componente | Tecnología | Justificación |
|-----------|------------|---------------|
| **Runtime** | Node.js 20 LTS | Compatible con el resto del stack JS |
| **Framework** | **Fastify 4** | 2x más rápido que Express, TypeScript nativo, schema validation |
| **ORM** | **Drizzle ORM** | Ligero, TypeScript-first, SQL explícito, sin magia oculta |
| **Validación** | Zod | Ya conocido en ecosistema Next.js/TS |
| **Auth** | JWT (jose) + bcrypt | Sin dependencias externas de auth |

### Infraestructura

| Componente | Tecnología | Coste estimado |
|-----------|------------|----------------|
| **Base de datos** | PostgreSQL 16 | ~$7/mes (Railway) o gratis (NAS) |
| **Caché** | Redis 7 | ~$3/mes (Railway Managed) o gratis (NAS) |
| **Deploy backend** | Railway o NAS + Docker | $0-15/mes |
| **Deploy frontend** | Vercel (actual) | Gratis (hobby) / $20/mes (pro) |
| **Emails** | Resend.com | Gratis hasta 3.000/mes |
| **Pagos** | Stripe | 1.5% + €0.25 por transacción |
| **Monitoreo** | Grafana + Prometheus (NAS) o Sentry | Gratis |

---

## Estrategia de Migración

### ¿Qué se migra desde Trakt?

La API de Trakt tiene un endpoint para exportar todos los datos de usuario:

```
GET /users/me/history — Todo el historial
GET /sync/favorites   — Todos los favoritos (movies + shows)
GET /sync/watchlist   — Toda la watchlist
GET /sync/ratings     — Todos los ratings
GET /users/me/lists   — Todas las listas
```

### Proceso de migración para cada usuario

1. Usuario hace clic en "Importar desde Trakt" (ya tiene Trakt conectado)
2. Backend llama a la API de Trakt con el token OAuth del usuario
3. Transforma y guarda en PostgreSQL
4. Muestra progreso en tiempo real (WebSocket o polling)
5. Trakt queda desconectado o como lectura-only

### Compatibilidad hacia atrás

Las Next.js API Routes actuales (`/api/trakt/*`) se mantienen temporalmente como **proxies** al nuevo backend, minimizando cambios en el frontend. Se eliminan progresivamente.

---

## Caché con Redis

### Qué se cachea y por cuánto tiempo

| Dato | TTL | Razón |
|------|-----|-------|
| Detalles película/serie (TMDb) | 10 min | Cambian poco |
| Metadatos de personas (TMDb) | 1 hora | Muy estables |
| Trending / Popular (TMDb) | 5 min | Actualizados frecuentemente |
| Watch providers | 1 hora | Cambian raramente |
| Datos de usuario (status de item) | 30 segundos | Actualizaciones frecuentes del usuario |
| Rate limit counters | 1 minuto | Ventana deslizante |

### Rate limiting por usuario

```
- Free plan:  100 req/min
- Pro plan:   500 req/min
- API keys:   1000 req/min
```

---

## Plan de Fases de Implementación

### Fase 1 — Backend Base (2-3 semanas)
- [ ] Proyecto Node.js + Fastify + Drizzle configurado
- [ ] PostgreSQL con esquema completo
- [ ] Auth completo (register/login/refresh/logout)
- [ ] CRUD completo: favoritos, watchlist, historial
- [ ] Ratings y listas
- [ ] Endpoint `/items/:id/status` (reemplaza Trakt item/status)
- [ ] Redis para sesiones y rate limiting básico

### Fase 2 — Proxy TMDb + Migración Trakt (1-2 semanas)
- [ ] Proxy de TMDb con caché Redis (reemplaza JustWatch + llamadas directas a TMDb)
- [ ] Endpoint de importación desde Trakt
- [ ] Endpoint de estadísticas y dashboard
- [ ] Tests de integración básicos

### Fase 3 — Integración con Next.js (1-2 semanas)
- [ ] Reemplazar `AuthContext.jsx` para usar auth propia
- [ ] Adaptar `traktClient.js` → `apiClient.js` (misma interfaz, nuevo backend)
- [ ] Mantener Next.js API Routes como proxies temporales
- [ ] Migrar las rutas progresivamente a llamar al backend directamente

### Fase 4 — Infraestructura y Comercialización (2-3 semanas)
- [ ] Deploy en Railway o NAS (Docker Compose)
- [ ] Stripe integrado (checkout + webhooks + portal)
- [ ] Sistema de planes (free vs pro)
- [ ] Emails transaccionales (Resend)
- [ ] Monitoreo y alertas
- [ ] Landing page con pricing

### Fase 5 — Legalización (paralela, 1-2 semanas)
- [ ] Contactar TMDb para licencia comercial
- [ ] Revisar y actualizar ToS/Privacy Policy
- [ ] Eliminar JustWatch (reemplazar por TMDb Watch Providers)
- [ ] Asegurar atribución correcta de TMDb en la UI

---

## Consideraciones Importantes para Comercializar

### 1. TMDb — Licencia comercial ⚠️
- Contactar a `developers@themoviedb.org` explicando el modelo de negocio
- Mostrar logo "The Movie Database" y enlace en la app
- No cachear imágenes en CDN propio masivamente

### 2. Trakt — Solo para importación
- Mantener Trakt como opción de importación (no dependencia)
- No usar sus datos comunitarios sin acuerdo comercial

### 3. JustWatch — Eliminar API no oficial
- Reemplazar `justwatch.js` con `TMDb Watch Providers` (ya en tu código con `getWatchProviders`)
- Esta sustitución ya está preparada en tu codebase

### 4. Spotify — Solo con usuario autenticado
- Actualmente usas Client Credentials + refresh token personal
- Para multi-usuario: cada usuario autoriza su propia cuenta Spotify (OAuth)
- Alternativa: Deezer API (ya tienes `deezer.js`) como default gratuito

### 5. GDPR / Privacidad
- Al gestionar datos propios de usuarios necesitas política de privacidad
- Derecho a exportar datos (data portability)
- Derecho a eliminar cuenta y todos sus datos

### 6. Seguridad
- Passwords hasheados con bcrypt (cost factor 12)
- JWT access tokens: 15 min de vida
- Refresh tokens: 30 días, rotativos (rotation strategy)
- Rate limiting estricto en endpoints de auth
- CORS configurado solo para tu dominio

---

## Modelos de Negocio Viables

### Plan Free
- 1 usuario
- Historial limitado (últimos 500 items)
- Favoritos y watchlist (límite 200 items)
- Sin listas personalizadas avanzadas

### Plan Pro (€5.99/mes o €49.99/año)
- Historial ilimitado
- Favoritos y watchlist ilimitados
- Listas personalizadas ilimitadas
- Estadísticas avanzadas
- Sin publicidad
- Prioridad en soporte

### Plan Family (€9.99/mes)
- Hasta 5 usuarios
- Todo lo de Pro para cada usuario

---

## Verificación del Plan

### Tests a ejecutar
- Unit tests: lógica de negocio (favoritos, watchlist, historial)
- Integration tests: endpoints REST con supertest
- E2E: flujo completo registro → añadir favorito → historial

### Migración sin downtime
1. Deploy del backend en paralelo
2. Migrar usuarios gradualmente (flag feature)
3. Mantener Trakt como fallback durante 30 días
4. Eliminar dependencia de Trakt

### Métricas de éxito
- Tiempo de respuesta API < 200ms (P95)
- Cache hit rate TMDb > 80%
- Cero pérdida de datos en migración
