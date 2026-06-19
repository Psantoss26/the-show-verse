# 🚀 The Show Verse — Backend API

Backend REST construido con **Fastify + PostgreSQL + Redis** para The Show Verse.

## Stack

- **Runtime**: Node.js 20
- **Framework**: Fastify 4
- **ORM**: Drizzle ORM (PostgreSQL)
- **Caché**: Redis (ioredis)
- **Auth**: JWT (jose) + bcrypt
- **Validación**: Zod

## Arrancar en desarrollo

### 1. Prerrequisitos

```bash
# PostgreSQL y Redis deben estar corriendo
# Opción A: Docker Compose (recomendado)
docker compose up db redis -d

# Opción B: Tu NAS (si tienes PostgreSQL y Redis ahí)
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Edita .env con tus valores
```

### 3. Instalar y migrar

```bash
npm install
npm run db:generate   # Genera archivos SQL de migración
npm run db:migrate    # Aplica las migraciones
npm run dev           # Arranca con --watch (hot reload)
```

La API estará disponible en `http://localhost:3001`

## Producción (Docker)

```bash
# Copiar y configurar variables
cp .env.example .env.production
# Editar .env.production

# Arrancar todos los servicios
docker compose up -d

# Ver logs
docker compose logs -f api
```

## Estructura

```
backend/
├── src/
│   ├── server.js           # Entrada principal (Fastify)
│   ├── db/
│   │   ├── schema.js       # Esquema de BD (12 tablas)
│   │   ├── client.js       # Pool de conexiones
│   │   └── migrate.js      # Runner de migraciones
│   ├── lib/
│   │   ├── jwt.js          # Access + Refresh tokens
│   │   └── redis.js        # Caché helpers
│   ├── plugins/
│   │   └── auth.js         # Plugin de autenticación
│   └── routes/
│       ├── auth.js         # /v1/auth/*
│       ├── favorites.js    # /v1/favorites/*
│       ├── watchlist.js    # /v1/watchlist/*
│       ├── history.js      # /v1/history/*
│       ├── ratings.js      # /v1/ratings/*
│       ├── lists.js        # /v1/lists/*
│       ├── items.js        # /v1/items/:id/status
│       ├── tmdb.js         # /v1/tmdb/* (proxy con caché)
│       ├── import.js       # /v1/import/trakt (migración)
│       └── stats.js        # /v1/stats/*
├── drizzle/                # Migraciones SQL generadas
├── drizzle.config.js
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Endpoints principales

```
GET  /health                    — Health check

# Auth
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/auth/me
PATCH /v1/auth/me

# Estado unificado (reemplaza Trakt item/status)
GET  /v1/items/:tmdbId/:mediaType/status

# Datos de usuario
GET|POST|DELETE /v1/favorites
GET|POST|DELETE /v1/watchlist
GET|POST|DELETE /v1/history
GET|POST|DELETE /v1/ratings
GET|POST|PATCH|DELETE /v1/lists

# Historial específico
GET  /v1/history/shows/:tmdbId
GET  /v1/history/movies/:tmdbId
GET  /v1/history/episodes/:tmdbId/:season/:episode
POST /v1/history/episodes        — Marcar episodio visto
POST /v1/history/seasons         — Marcar temporada vista

# TMDb proxy con caché Redis
GET  /v1/tmdb/movie/:id
GET  /v1/tmdb/tv/:id
GET  /v1/tmdb/person/:id
GET  /v1/tmdb/search
GET  /v1/tmdb/discover/movies
GET  /v1/tmdb/discover/tv
GET  /v1/tmdb/trending
GET  /v1/tmdb/:type/:id/providers  — Watch providers (reemplaza JustWatch)

# Estadísticas
GET  /v1/stats
GET  /v1/stats/calendar
GET  /v1/stats/shows/in-progress
GET  /v1/stats/shows/completed

# Migración
POST /v1/import/trakt            — Importar datos desde Trakt
GET  /v1/import/trakt/status
```
