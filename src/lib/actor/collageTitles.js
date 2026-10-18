// Títulos del FONDO DE MOSAICO de la ficha de una persona, por relevancia:
// «Conocido por» y después el resto de créditos por popularidad, sin
// apariciones como sí mismo/a. Pura: la usan el servidor (la página resuelve
// los pósters durante el SSR) y ActorDetails (orden de la filmografía y
// respaldo del fondo si el servidor no pudo).

export const isSelfLikeCredit = (character = "") =>
  /\b(self|himself|herself|host|archive footage|uncredited)\b/i.test(
    String(character),
  );

export const creditPopularityScore = (item) => {
  const popularity = Number(item?.popularity || 0);
  const voteCount = Number(item?.vote_count || 0);
  const voteAverage = Number(item?.vote_average || 0);
  const order = Number.isFinite(Number(item?.order)) ? Number(item.order) : 99;
  const episodeCount = Number(item?.episode_count || 0);
  const roleWeight = Math.max(0, 18 - Math.min(order, 18));
  const episodeWeight =
    item?.media_type === "tv" ? Math.min(episodeCount, 30) * 0.35 : 4;

  return (
    Math.sqrt(Math.max(popularity, 0)) * 9 +
    Math.log10(voteCount + 1) * 6 +
    voteAverage +
    roleWeight +
    episodeWeight
  );
};

const withMediaType = (item) =>
  item?.media_type
    ? item
    : { ...item, media_type: item?.first_air_date ? "tv" : "movie" };

/**
 * @param {{ knownFor?: object[], credits?: object[] }} input
 *   `credits`: cast + crew de `combined_credits` (con o sin `media_type`).
 */
export function buildActorCollageTitles({ knownFor = [], credits = [] } = {}) {
  const ranked = (Array.isArray(credits) ? credits : [])
    .filter((item) => item?.id && !isSelfLikeCredit(item.character))
    .map(withMediaType)
    .sort((a, b) => creditPopularityScore(b) - creditPopularityScore(a));
  return [
    ...(Array.isArray(knownFor) ? knownFor : [])
      .filter((item) => item?.id)
      .map(withMediaType),
    ...ranked,
  ];
}
