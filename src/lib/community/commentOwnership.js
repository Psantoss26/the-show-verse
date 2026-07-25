function normalizeUsername(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function isOwnedComment(
  comment,
  { appUsername, traktUsername, ownedCommentIds } = {},
) {
  const commentId = comment?.id == null ? "" : String(comment.id);
  if (commentId && ownedCommentIds?.has(commentId)) return true;

  const authorUsername = normalizeUsername(comment?.user?.username);
  if (!authorUsername) return false;

  return ["tú", appUsername, traktUsername]
    .map(normalizeUsername)
    .filter(Boolean)
    .includes(authorUsername);
}
