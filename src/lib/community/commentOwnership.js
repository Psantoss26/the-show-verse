function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function isOwnedComment(
  comment,
  { appUsername, traktUsername, ownedCommentIds } = {},
) {
  // Las reseñas importadas de Trakt no son nunca propias aunque el autor
  // coincida con el usuario de Trakt (o de la app): el backend solo edita y
  // borra las nativas y al intentarlo respondía «Comment not found».
  if (comment?.source === "trakt") return false;

  const commentId = comment?.id == null ? "" : String(comment.id);
  if (commentId && ownedCommentIds?.has(commentId)) return true;

  const authorUsername = normalizeUsername(comment?.user?.username);
  if (!authorUsername) return false;

  return ["tú", appUsername, traktUsername]
    .map(normalizeUsername)
    .filter(Boolean)
    .includes(authorUsername);
}
