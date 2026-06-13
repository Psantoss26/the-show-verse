#!/usr/bin/env bash
# Crea/actualiza el .env persistente en /volume4/docker/the-show-verse/.env
# para que el deploy workflow lo encuentre y no se pierdan las variables.
set -euo pipefail

ENV_FILE="/volume4/docker/the-show-verse/.env"
cat > "$ENV_FILE" << 'ENVEOF'
# API de The Movie Database (TMDb)
NEXT_PUBLIC_TMDB_API_KEY=934b1e031967a214521ca1a5426baa2b
TMDB_V4_ACCESS_TOKEN=934b1e031967a214521ca1a5426baa2b
OMDB_API_KEY=cf5149d9

# API de Trakt.tv
TRAKT_CLIENT_ID=d3a37a8fbef7e0b5651acf8c71d937eac2ddb6386ad53788fdaa2bcc7eb076d1
TRAKT_CLIENT_SECRET=e64be7b685f7beb14deb3eecbc820dd439b40223d9223d3f78bc3ddd5512bff7
TRAKT_REDIRECT_URI=http://localhost:3000/api/trakt/auth/callback

# Ollama — LLM local en el NAS
OLLAMA_BASE_URL=http://192.168.1.126:11434
OLLAMA_MODEL=qwen2.5:1.5b

# Spotify Web API
SPOTIFY_CLIENT_ID=17717bd626f44fa69220eafdb42aee35
SPOTIFY_CLIENT_SECRET=b2b4dd60271a42f89b5dd51b41307225
SPOTIFY_REDIRECT_URI=https://theshowverse.com/api/spotify/callback
SPOTIFY_REFRESH_TOKEN=AQAjXZSN4fry1ikq70-iBD39WxUdEwo4pfqbny_k1RAc3SOG_L9dSdxgXBRsoqpTtH3Q1c3JOeaxQWWY4j1yrgKtQTXT-ecA_m4J1I7tipbaYv3plxw-nzNF4CQQr-MK_GQ

# Configuración de Plex
PLEX_URL=http://192.168.1.126:32400
PLEX_TOKEN=-CE-sNcc4qeprjJ1Zu7b
PLEX_CLIENT_IDENTIFIER=b3d4e68f-42c3-4e7c-8a85-55218fa7aa9e
PLEX_JWT_SCOPE=username,email,friendly_name
PLEX_JWT_KID=the-show-verse-ed25519-01
PLEX_JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIB7hMtnaSw5jY5VBxoejV512EFQbcyIheWPzLgudMDLX\n-----END PRIVATE KEY-----
ENVEOF

echo "✓ Creado/actualizado: $ENV_FILE"
echo "Variables incluidas:"
grep -c '=' "$ENV_FILE" | xargs echo "  Total líneas con valor:"
grep -E '^(SPOTIFY_|NEXT_PUBLIC_TMDB|TMDB_V4|OMDB|TRAKT_|OLLAMA_|PLEX_)' "$ENV_FILE" | cut -d= -f1 | sed 's/^/  ✅ /'
echo ""
echo "El próximo deploy encontrará este .env y lo copiará a /nas-deploy/app/.env"
echo "Para aplicar los cambios ahora, ejecuta:"
echo "  cd /volume4/docker/the-show-verse/app && docker compose -f docker-compose.yml --project-name the-show-verse up -d app"
