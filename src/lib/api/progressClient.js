// Cliente del progreso de reproducción local (capturado desde las plataformas de
// streaming por la extensión del navegador y la app Android). Alimenta la fila
// "Continuar viendo" junto con el progreso de Trakt.

/**
 * Devuelve el contenido en curso del usuario (películas y episodios) tal cual lo
 * expone el backend: filas de watch_progress. Nunca lanza (devuelve [] si falla).
 * @returns {Promise<Array<{id:string,tmdbId:number,mediaType:string,season:number|null,episode:number|null,positionSeconds:number,runtimeSeconds:number,percent:number,platform:string|null,title:string|null,posterPath:string|null,updatedAt:string}>>}
 */
/**
 * Progreso local ("Continuar viendo").
 *
 * `throwOnError` distingue DOS COSAS QUE NO SON LA MISMA: "el servidor dice que
 * no tienes nada" y "no he podido preguntar". Por defecto sigue devolviendo `[]`
 * ante cualquier fallo, que es lo que esperan los consumidores que solo quieren
 * un dato de adorno (el % de una ficha, una fila del dashboard).
 *
 * Quien PINTA la lista entera debe pedir `throwOnError: true`: para esa página
 * un `[]` inventado por un fallo de red significa vaciar la pantalla y, peor,
 * guardar ese vacío en su caché — con lo que el error sobrevive a la navegación.
 */
export async function getLocalInProgress({ throwOnError = false } = {}) {
  try {
    const res = await fetch("/api/progress", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) {
      if (throwOnError) {
        throw new Error(`Progreso local HTTP ${res.status}`);
      }
      return [];
    }
    const json = await res.json().catch(() => null);
    return Array.isArray(json?.results) ? json.results : [];
  } catch (error) {
    if (throwOnError) throw error;
    return [];
  }
}

/** Descarta una entrada de "Continuar viendo" (progreso local) por su id. */
export async function dismissLocalProgress(id) {
  if (!id) return false;
  try {
    const res = await fetch(`/api/progress?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function normalizeProgressSearchResults(results) {
  const seen = new Set();
  const normalized = [];

  for (const item of Array.isArray(results) ? results : []) {
    const mediaType =
      item?.media_type === "movie" || item?.media_type === "tv"
        ? item.media_type
        : null;
    const id = Number(item?.id);
    const title = String(item?.title || item?.name || "").trim();
    if (!mediaType || !Number.isFinite(id) || id <= 0 || !title) continue;

    const key = `${mediaType}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({
      id,
      media_type: mediaType,
      title,
      original_title: item.original_title || item.original_name || "",
      poster_path: item.poster_path || null,
      release_date: item.release_date || item.first_air_date || null,
      vote_average: Number(item.vote_average) || 0,
      popularity: Number(item.popularity) || 0,
    });
  }

  return normalized;
}

export async function searchProgressTitles(query, { signal } = {}) {
  const normalizedQuery = String(query || "").trim();
  if (normalizedQuery.length < 2) return [];

  const res = await fetch(
    `/api/progress?search=${encodeURIComponent(normalizedQuery)}`,
    {
      cache: "no-store",
      credentials: "include",
      signal,
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || "No se pudieron buscar títulos");
  }
  return normalizeProgressSearchResults(json?.results);
}

export async function addManualProgress(item) {
  const mediaType = item?.media_type === "tv" ? "tv" : "movie";
  const res = await fetch("/api/progress", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tmdbId: Number(item?.id),
      mediaType,
      title: item?.title || item?.name || "",
      posterPath: item?.poster_path || null,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.item) {
    throw new Error(json?.error || "No se pudo añadir el título");
  }
  return json.item;
}
