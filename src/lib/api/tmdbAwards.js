// Cliente: premios detallados desde nuestra ruta interna de TMDb.

export async function fetchTmdbAwards(type, id) {
  const mediaType = type === "tv" ? "tv" : "movie";
  if (!id) return null;

  try {
    const params = new URLSearchParams({
      type: mediaType,
      id: String(id),
    });
    const res = await fetch(`/api/tmdb/awards?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    return data?.hasAwards ? data : null;
  } catch (e) {
    console.error("TMDb awards fetch error", e);
    return null;
  }
}
