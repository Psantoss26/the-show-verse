// Explicit subroute identities: a season/episode ID is not the show's TMDb ID.
export function detailPreviewFromHref(href, origin) {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    // Ficha de una persona: solo se abre en panel desde la vista teléfono (ver
    // DetailModalProvider); quien no la quiera la filtra por `media_type`.
    const person = /^\/details\/person\/(\d+)\/?$/.exec(url.pathname);
    if (person) {
      const id = Number(person[1]);
      return id > 0 ? { id, media_type: "person" } : null;
    }
    const match = /^\/details\/(movie|tv)\/(\d+)(?:\/season\/(\d+)(?:\/episode\/(\d+))?)?\/?$/.exec(url.pathname);
    if (!match || (match[1] === "movie" && match[3] != null)) return null;
    const id = Number(match[2]);
    if (id <= 0 || (match[4] != null && Number(match[4]) <= 0)) return null;
    return {
      id,
      media_type: match[4] != null ? "episode" : match[3] != null ? "season" : match[1],
      ...(match[3] != null ? { showId: id, seasonNumber: Number(match[3]) } : {}),
      ...(match[4] != null ? { episodeNumber: Number(match[4]) } : {}),
    };
  } catch {
    return null;
  }
}

export function subrouteDetailsHref(item) {
  if (!["season", "episode"].includes(item?.media_type)) return null;
  const base = `/details/tv/${item.showId ?? item.id}/season/${item.seasonNumber}`;
  return item.media_type === "episode" ? `${base}/episode/${item.episodeNumber}` : base;
}

// Ruta de la página que pinta el panel con iframe (SubrouteDetailsPanel):
// temporadas, episodios y personas. Aparte de `subrouteDetailsHref` porque esa
// la usan también la precarga por intención y la navegación móvil, que solo
// tratan temporadas y episodios.
export function panelDetailsHref(item) {
  if (item?.media_type === "person") return item.id > 0 ? `/details/person/${item.id}` : null;
  return subrouteDetailsHref(item);
}
