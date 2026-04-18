# ── Etapa 1: dependencias de producción ──────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
# Solo prod deps (se usan en el runner final)
RUN npm ci --omit=dev

# ── Etapa 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
# Todas las deps (incluyendo devDeps como typescript, necesario para next.config.ts)
RUN npm ci

COPY . .

# Variables de build necesarias para NEXT_PUBLIC_* (se inyectan en el bundle)
# Pásalas como --build-arg al hacer docker build, o defínelas aquí si no son secretos
ARG NEXT_PUBLIC_TMDB_API_KEY
ARG NEXT_PUBLIC_TRAKT_CLIENT_ID
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_TMDB_API_KEY=$NEXT_PUBLIC_TMDB_API_KEY
ENV NEXT_PUBLIC_TRAKT_CLIENT_ID=$NEXT_PUBLIC_TRAKT_CLIENT_ID
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Desactivar telemetría de Next.js
ENV NEXT_TELEMETRY_DISABLED=1

# Activar output standalone para imagen mínima
ENV NEXT_OUTPUT=standalone

RUN npm run build

# ── Etapa 3: runner (imagen final mínima) ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copiamos solo lo necesario del build standalone
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
