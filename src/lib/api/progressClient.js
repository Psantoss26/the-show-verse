// Cliente del progreso de reproducción local (capturado desde las plataformas de
// streaming por la extensión del navegador y la app Android). Alimenta la fila
// "Continuar viendo" junto con el progreso de Trakt.

/**
 * Devuelve el contenido en curso del usuario (películas y episodios) tal cual lo
 * expone el backend: filas de watch_progress. Nunca lanza (devuelve [] si falla).
 * @returns {Promise<Array<{id:string,tmdbId:number,mediaType:string,season:number|null,episode:number|null,positionSeconds:number,runtimeSeconds:number,percent:number,platform:string|null,title:string|null,posterPath:string|null,updatedAt:string}>>}
 */
export async function getLocalInProgress() {
  try {
    const res = await fetch("/api/progress", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    return Array.isArray(json?.results) ? json.results : [];
  } catch {
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
