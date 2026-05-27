#!/usr/bin/env bash
# =============================================================================
# deploy-ollama.sh — Despliega Ollama + The Show Verse en el NAS UGREEN
# Uso: ./scripts/deploy-ollama.sh
# Requiere: acceso SSH al NAS o ejecutar directamente en él
# =============================================================================
set -euo pipefail

NAS_DEPLOY_DIR="/nas-deploy"
APP_DIR="$NAS_DEPLOY_DIR/app"
COMPOSE_FILE="$NAS_DEPLOY_DIR/docker-compose.yml"

echo "══════════════════════════════════════════════════════════"
echo "  The Show Verse · Despliegue con Ollama (IA local)"
echo "══════════════════════════════════════════════════════════"

# ── 1. Sincronizar docker-compose.yml ────────────────────────────────────────
echo ""
echo "▶ Copiando docker-compose.yml..."
cp "$APP_DIR/docker-compose.yml" "$COMPOSE_FILE"

# ── 2. Arrancar / actualizar Ollama ──────────────────────────────────────────
echo ""
echo "▶ Arrancando Ollama..."
docker compose -f "$COMPOSE_FILE" --project-name the-show-verse \
  up -d ollama
echo "  ⏳ Esperando a que Ollama esté listo..."
docker compose -f "$COMPOSE_FILE" --project-name the-show-verse \
  wait ollama 2>/dev/null || true

# ── 3. Descargar modelo si no existe ─────────────────────────────────────────
echo ""
echo "▶ Comprobando modelo qwen2.5:3b..."
if docker exec ollama ollama list 2>/dev/null | grep -q "qwen2.5:3b"; then
  echo "  ✓ Modelo qwen2.5:3b ya disponible"
else
  echo "  ⬇ Descargando qwen2.5:3b (~2 GB, puede tardar varios minutos)..."
  docker exec ollama ollama pull qwen2.5:3b
  echo "  ✓ Modelo descargado"
fi

# ── 4. Rebuild y arranque de la app ──────────────────────────────────────────
echo ""
echo "▶ Rebuilding imagen de la app..."
docker compose -f "$COMPOSE_FILE" \
  --project-name the-show-verse build \
  --build-arg NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://192.168.1.126:3000}" \
  --build-arg NEXT_PUBLIC_TMDB_API_KEY="${NEXT_PUBLIC_TMDB_API_KEY:-}" \
  2>&1

echo ""
echo "▶ Reiniciando contenedores..."
docker compose -f "$COMPOSE_FILE" --project-name the-show-verse \
  up -d app ollama

# ── 5. Verificar estado ───────────────────────────────────────────────────────
echo ""
echo "▶ Verificando estado de la IA..."
sleep 5
curl -s http://localhost:11434/api/tags 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print('  Modelos:', [m['name'] for m in d.get('models',[])])" \
  2>/dev/null || echo "  ⚠ Ollama aún iniciando..."

echo ""
echo "✅ Despliegue completado: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "   App:    http://192.168.1.126:3000"
echo "   Ollama: http://192.168.1.126:11434"
echo "   Salud IA: http://192.168.1.126:3000/api/ai/health"
echo ""
