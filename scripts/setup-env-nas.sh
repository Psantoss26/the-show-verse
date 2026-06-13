#!/usr/bin/env bash
# Crea/actualiza el .env persistente en /volume4/docker/the-show-verse/.env
# para que el deploy workflow lo encuentre y no se pierdan las variables.
set -euo pipefail

ENV_FILE="/volume4/docker/the-show-verse/.env"
cat > "$ENV_FILE" << 'ENVEOF'
# API de The Movie Database (TMDb)
NEXT_PUBLIC_TMDB_API_KEY=***REMOVED***
TMDB_V4_ACCESS_TOKEN=***REMOVED***
OMDB_API_KEY=cf5149d9

# API de Trakt.tv
TRAKT_CLIENT_ID=***REMOVED***
TRAKT_CLIENT_SECRET=***REMOVED***
TRAKT_REDIRECT_URI=http://localhost:3000/api/trakt/auth/callback

# Ollama — LLM local en el NAS
OLLAMA_BASE_URL=http://192.168.1.126:11434
OLLAMA_MODEL=qwen2.5:1.5b

# Spotify Web API
SPOTIFY_CLIENT_ID=***REMOVED***
SPOTIFY_CLIENT_SECRET=***REMOVED***
SPOTIFY_REDIRECT_URI=https://theshowverse.com/api/spotify/callback
SPOTIFY_REFRESH_TOKEN=***REMOVED***

# Configuración de Plex
PLEX_URL=http://192.168.1.126:32400
PLEX_TOKEN=***REMOVED***
PLEX_CLIENT_IDENTIFIER=***REMOVED***
PLEX_JWT_SCOPE=username,email,friendly_name
PLEX_JWT_KID=***REMOVED***
PLEX_JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n***REMOVED***\n-----END PRIVATE KEY-----

# Acceso privado a theshowverse.com en el servidor NAS local
SHOWVERSE_PRIVATE_ACCESS_KEY=***REMOVED***
ENVEOF

echo "✓ Creado/actualizado: $ENV_FILE"
echo "Variables incluidas:"
grep -c '=' "$ENV_FILE" | xargs echo "  Total líneas con valor:"
grep -E '^(SPOTIFY_|NEXT_PUBLIC_TMDB|TMDB_V4|OMDB|TRAKT_|OLLAMA_|PLEX_|SHOWVERSE_PRIVATE_ACCESS_KEY)' "$ENV_FILE" | cut -d= -f1 | sed 's/^/  ✅ /'
echo ""
echo "El próximo deploy encontrará este .env y lo copiará a /nas-deploy/app/.env"
echo "Para aplicar los cambios ahora, ejecuta:"
echo "  cd /volume4/docker/the-show-verse/app && docker compose -f docker-compose.yml --project-name the-show-verse up -d app"
