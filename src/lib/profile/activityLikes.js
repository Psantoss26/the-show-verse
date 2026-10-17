// Me gusta en la actividad (perfil, resumen lateral y feed social). El backend
// (getUserActivity) los entrega como tres tipos:
//   - like_review      reseña de una ficha (tmdbId/mediaType del título, autor y fragmento)
//   - like_list        lista de la comunidad (listId, name, listOwner)
//   - like_collection  colección de TMDb (collectionId, name)
//   - like_actor       persona de TMDb: actor, actriz, dirección… (personId, name)
// Para filtrar y agrupar, los cuatro son una sola acción: "like".

export const LIKE_ACTIVITY_TYPES = Object.freeze(["like_review", "like_list", "like_collection", "like_actor"]);

export function isLikeActivity(item) {
  return LIKE_ACTIVITY_TYPES.includes(item?.type);
}

/**
 * Acción de un evento para filtrar y agrupar: los elementos añadidos a una
 * lista cuentan como "list" y todos los me gusta como "like".
 */
export function activityActionKey(item) {
  if (item?.type === "list_item") return "list";
  if (isLikeActivity(item)) return "like";
  return item?.type;
}

/** Página de la lista o colección con me gusta (las reseñas van a su ficha). */
export function likeTargetHref(item) {
  if (item?.type === "like_list" && item.listId) {
    return `/lists/community/${encodeURIComponent(String(item.listId))}`;
  }
  const collectionId = Number(item?.collectionId);
  if (item?.type === "like_collection" && Number.isInteger(collectionId) && collectionId > 0) {
    return `/lists/collection/${collectionId}`;
  }
  const personId = Number(item?.personId);
  if (item?.type === "like_actor" && Number.isInteger(personId) && personId > 0) {
    return `/details/person/${personId}`;
  }
  return null;
}

/** Nombre de lo que tiene el me gusta, para mostrarlo y buscarlo. */
export function likeTargetName(item) {
  if (item?.type === "like_list") return item.name || "Lista sin título";
  // TMDb llama "Dune - Colección" a las sagas: en "la colección Dune" sobra.
  if (item?.type === "like_collection") {
    return String(item.name || "").replace(/\s*[-–—]\s*(colecci[oó]n|collection)\s*$/i, "").trim() || "Colección";
  }
  if (item?.type === "like_actor") return item.name || "una persona";
  return item?.title || "";
}

/** Autor de la reseña o de la lista: { name, href } o null. */
export function likeAuthor(item) {
  const person = item?.type === "like_review" ? item.reviewAuthor : item?.type === "like_list" ? item.listOwner : null;
  const name = person?.name || person?.username;
  if (!name) return null;
  return { name, href: person?.username ? `/u/${encodeURIComponent(person.username)}` : null };
}

const LIKE_VERBS = {
  third: {
    like_review: "ha dado me gusta a una reseña de",
    like_list: "ha dado me gusta a la lista",
    like_collection: "ha dado me gusta a la colección",
    // Neutro: vale para actores, actrices, directores… («a Brad Pitt»).
    like_actor: "ha dado me gusta a",
  },
  first: {
    like_review: "Has dado me gusta a una reseña de",
    like_list: "Has dado me gusta a la lista",
    like_collection: "Has dado me gusta a la colección",
    like_actor: "Has dado me gusta a",
  },
};

/** Verbo del me gusta: en tercera persona ("ha dado…") o en primera ("Has dado…"). */
export function likeVerb(item, { firstPerson = false } = {}) {
  return LIKE_VERBS[firstPerson ? "first" : "third"][item?.type] || null;
}
