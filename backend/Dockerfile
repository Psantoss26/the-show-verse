FROM node:20-alpine AS base
ENV NODE_ENV=production

# Railway can build this Dockerfile with either the repository root or backend/
# as the Docker build context. Normalize both shapes into /app.
WORKDIR /workspace
COPY . ./

RUN set -eux; \
  mkdir -p /app; \
  if [ -f backend/package.json ]; then \
    cp -R backend/. /app/; \
  elif [ -f package.json ] && [ -d src ]; then \
    cp -R . /app/; \
  else \
    echo "Backend package.json not found in Docker build context"; \
    exit 1; \
  fi; \
  cd /; \
  rm -rf /workspace

WORKDIR /app
RUN npm ci --omit=dev

EXPOSE 3001

# Ejecutar migraciones y arrancar servidor
CMD ["sh", "-c", "node src/db/migrate.js && node src/server.js"]
