// src/lib/api/itemStatus.js
// Lectura del estado (favorito / pendiente / visto) de un título desde el
// backend/BBDD propio, SIN usar Trakt en ningún momento. Pensado para las
// tarjetas/vistas previas de los dashboards.

const inFlight = new Map();

function emptyStatus() {
  return { favorite: false, watchlist: false, watched: false, connected: false };
}

function normalizeType(type) {
  return type === "tv" || type === "show" ? "tv" : "movie";
}

export async function getBackendItemStatus({ type, tmdbId, signal } = {}) {
  if (tmdbId == null || !type) return emptyStatus();

  const mediaType = normalizeType(type);
  const key = `${mediaType}:${tmdbId}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const res = await fetch(
        `/api/backend/item/status?type=${mediaType}&tmdbId=${encodeURIComponent(tmdbId)}`,
        { cache: "no-store", credentials: "include", signal },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) return emptyStatus();
      return {
        favorite: !!json.favorite,
        watchlist: !!(json.watchlist ?? json.inWatchlist),
        watched: !!json.watched,
        connected: !!json.connected,
      };
    } catch {
      return emptyStatus();
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
