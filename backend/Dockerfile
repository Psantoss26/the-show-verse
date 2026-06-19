FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Instalar dependencias de producción
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copiar código fuente
COPY backend/src/ ./src/
COPY backend/drizzle/ ./drizzle/
COPY backend/drizzle.config.js ./

EXPOSE 3001

# Ejecutar migraciones y arrancar servidor
CMD ["sh", "-c", "node src/db/migrate.js && node src/server.js"]
