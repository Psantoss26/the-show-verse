import { isOwnedComment } from "../community/commentOwnership.js";

function normalizeMediaType(value) {
  return value === "tv" ? "tv" : "movie";
}

export function buildListMembershipMap(
  listSnapshots,
  { tmdbId, mediaType } = {},
) {
  const targetId = String(tmdbId ?? "");
  const targetType = normalizeMediaType(mediaType);
  const membership = {};

  for (const snapshot of listSnapshots || []) {
    const listId = snapshot?.listId;
    if (listId == null) continue;
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];

    membership[String(listId)] = items.some(
      (entry) =>
        String(entry?.id ?? "") === targetId &&
        normalizeMediaType(entry?.media_type) === targetType,
    );
  }

  return membership;
}

export function selectOwnedComments(comments, ownership) {
  return (comments || []).filter((comment) =>
    isOwnedComment(comment, ownership),
  );
}

// Reseñas propias = las que el backend dice que son del usuario (`viewerComments`,
// sin paginar) + las del feed visible que se reconocen como suyas (recién
// publicadas, o de Trakt con su usuario). Sin duplicados; manda la copia del
// feed, que es la que se actualiza al editar.
export function mergeOwnedComments(viewerComments, comments, ownership) {
  const owned = selectOwnedComments(comments, ownership);
  const seen = new Set(owned.map((comment) => String(comment?.id)));
  const extra = (viewerComments || []).filter(
    (comment) => comment?.id != null && !seen.has(String(comment.id)),
  );
  return [...owned, ...extra];
}
