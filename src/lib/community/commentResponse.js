export function unwrapCommentResponse(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    payload.comment &&
    typeof payload.comment === "object"
  ) {
    return payload.comment;
  }

  return payload;
}
