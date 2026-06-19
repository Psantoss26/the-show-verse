FROM node:20-alpine AS base
WORKDIR /app

# Instalar dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar código fuente
COPY src/ ./src/
COPY drizzle.config.js ./

# Ejecutar migraciones y arrancar servidor
CMD ["sh", "-c", "node src/db/migrate.js && node src/server.js"]
