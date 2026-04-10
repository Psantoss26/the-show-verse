# Sistema de Cache y Rate Limiting para Trakt API

## Problema Resuelto

La aplicación estaba recibiendo **errores 429 (rate limiting)** de Trakt API debido a:
- Múltiples peticiones simultáneas al mismo endpoint
- Falta de cache, causando peticiones repetidas innecesarias
- Ausencia de retry automático con exponential backoff
- No respeto al header `retry_after` de Cloudflare

## Solución Implementada

### 1. Sistema de Cache en Memoria (`src/lib/trakt/fetchWithCache.js`)

Módulo centralizado que proporciona:

#### **Cache con TTL**
- Cache en memoria con tiempo de expiración configurable
- TTL por defecto: 5 minutos
- TTL personalizable por endpoint:
  ```javascript
  await fetchTrakt('/search/tmdb/123?type=movie', {
    cacheTTL: 10 * 60 * 1000 // 10 minutos
  });
  ```

#### **Deduplicación de Peticiones**
- Si hay una petición en vuelo al mismo endpoint, las subsiguientes esperan el resultado
- Evita hacer 10 llamadas paralelas cuando solo se necesita 1

#### **Retry Automático con Exponential Backoff**
- Manejo especial de error 429 (rate limiting):
  - Respeta el header `retry_after` o `retry_after` del JSON
  - Espera el tiempo indicado antes de reintentar
  - Hasta 3 reintentos por defecto

- Manejo de errores 5xx (servidor):
  - Exponential backoff: 1s, 2s, 4s
  - Hasta 3 reintentos

- Manejo de errores de red:
  - Retry automático con exponential backoff
  - Útil para fallos temporales de conexión

#### **Logging Mejorado**
```
⚠️ Trakt rate limit (429) on /search/tmdb/238?type=movie, retry after 30s
⚠️ Trakt server error (502) on /movies/238/stats, retrying in 1000ms
⚠️ Network error on /shows/1396/seasons, retrying in 2000ms
```

### 2. Funciones Exportadas

```javascript
// Petición normal con todas las features (cache, retry, dedup)
const data = await fetchTrakt('/movies/238?extended=full');

// Petición sin cache
const freshData = await fetchTrakt('/movies/238?extended=full', {
  useCache: false
});

// Petición con timeout personalizado
const data = await fetchTrakt('/search/tmdb/238?type=movie', {
  timeoutMs: 10000 // 10 segundos
});

// Petición con headers personalizados (para auth)
const data = await fetchTrakt('/users/me/watched/movies', {
  headers: customHeaders
});

// Petición opcional (devuelve null si falla)
const data = await fetchTraktMaybe('/movies/238/comments');

// Limpiar cache (útil para testing)
clearCache();

// Normalizar tipo de contenido
const type = normalizeType('tv'); // 'show'
```

### 3. Endpoints Actualizados

Se actualizaron los siguientes endpoints para usar el nuevo sistema:

- ✅ `/api/trakt/scoreboard` - Cache de 5 min
- ✅ `/api/trakt/stats` - Cache de 5 min
- ✅ `/api/trakt/community/*` (via `_utils.js`) - Cache de 10 min para búsquedas

### 4. Beneficios

| Antes | Después |
|-------|---------|
| Cada request = 1 llamada a Trakt | Primera request = 1 llamada, subsiguientes usan cache |
| 10 requests paralelos = 10 llamadas | 10 requests paralelos = 1 llamada (dedup) |
| Error 429 = fallo inmediato | Error 429 = retry automático después de 30s |
| Error 502 = fallo inmediato | Error 502 = 3 reintentos con backoff |
| Sin visibilidad de problemas | Logs claros de rate limiting y retries |

### 5. Configuración Personalizada por Endpoint

```javascript
// Búsquedas - cache largo (rara vez cambian)
await fetchTrakt('/search/tmdb/123?type=movie', {
  cacheTTL: 10 * 60 * 1000 // 10 minutos
});

// Stats - cache medio (pueden cambiar)
await fetchTrakt('/movies/238/stats', {
  cacheTTL: 5 * 60 * 1000 // 5 minutos (default)
});

// Datos del usuario - sin cache
await fetchTrakt('/users/me/watched/movies', {
  useCache: false
});
```

### 6. Monitoreo y Debug

El sistema registra automáticamente:
- Rate limiting detectado y tiempo de espera
- Reintentos realizados
- Errores de servidor y red
- Peticiones opcionales que fallan (no crítco)

### 7. Compatibilidad

El sistema es **100% compatible** con código existente:
```javascript
// Código viejo (sigue funcionando)
const res = await fetch(`${TRAKT_BASE}/movies/238`, {
  headers: traktHeaders()
});

// Código nuevo (recomendado)
const data = await fetchTrakt('/movies/238');
```

## Próximos Pasos Recomendados

1. **Migrar endpoints restantes** a usar `fetchTrakt`:
   - `/api/trakt/related`
   - `/api/trakt/item/*`
   - `/api/trakt/official-site`
   - etc.

2. **Considerar cache persistente** (Redis/Vercel KV) para:
   - Evitar pérdida de cache en redeploys
   - Compartir cache entre instancias serverless
   - TTL más largos para datos estáticos

3. **Métricas** para monitorear:
   - Hit rate del cache
   - Frecuencia de rate limiting
   - Tiempos de respuesta

## Autor

Sistema diseñado para resolver errores críticos de rate limiting (429) en producción.
