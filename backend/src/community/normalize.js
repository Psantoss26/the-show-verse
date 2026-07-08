export function stripHtml(input) {
  if (!input) return '';
  return String(input)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .trim();
}

export function normalizeTraktComment(raw, { tmdbId, mediaType }) {
  const body = stripHtml(raw?.comment?.comment ?? raw?.comment ?? '');
  const externalId = Number(raw?.id) || null;
  if (!body || !externalId) return null;
  const user = raw?.user || {};
  const avatar = user?.images?.avatar?.full || user?.images?.avatar?.medium || null;
  return {
    tmdbId: Number(tmdbId),
    mediaType,
    source: 'trakt',
    externalId,
    userId: null,
    authorName: user?.name || user?.username || null,
    authorUsername: user?.username || null,
    authorAvatarUrl: avatar,
    authorIsVip: !!user?.vip,
    body,
    likes: Number(raw?.likes) || 0,
    spoiler: !!raw?.spoiler,
    createdAt: raw?.created_at ? new Date(raw.created_at) : new Date(),
  };
}

export function commentRowToApi(row) {
  return {
    id: row.id,
    comment: row.body,
    likes: Number(row.likes) || 0,
    spoiler: !!row.spoiler,
    created_at: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    user: {
      name: row.authorName || row.authorUsername || 'Usuario',
      username: row.authorUsername || null,
      vip: !!row.authorIsVip,
      images: { avatar: { full: row.authorAvatarUrl || null } },
    },
    source: row.source,
  };
}
