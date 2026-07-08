export function resolveCommentTab(tab) {
  const t = String(tab || '').toLowerCase();
  if (t === 'recent' || t === 'newest') return { order: 'recent', sinceDays: null };
  if (t === 'top30' || t === 'likes30') return { order: 'likes', sinceDays: 30 };
  return { order: 'likes', sinceDays: null }; // top / likesAll / default
}
