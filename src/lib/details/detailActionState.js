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
