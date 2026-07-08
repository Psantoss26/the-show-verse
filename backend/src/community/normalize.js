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

const TMDB_IMG = 'https://image.tmdb.org/t/p';
export function posterUrl(path, size = 'w342') {
  if (!path) return null;
  return `${TMDB_IMG}/${size}${path}`;
}

export function normalizeTraktList(raw) {
  const list = raw?.list || raw; // Trakt "lists containing" rows nest under .list sometimes
  const externalId = Number(list?.ids?.trakt) || null;
  const name = list?.name || null;
  if (!externalId || !name) return null;
  const user = list?.user || raw?.user || {};
  return {
    source: 'trakt',
    externalId,
    slug: list?.ids?.slug || null,
    name,
    description: list?.description || null,
    ownerName: user?.name || user?.username || null,
    ownerUsername: user?.username || null,
    ownerAvatarUrl: user?.images?.avatar?.full || null,
    itemCount: Number(list?.item_count) || 0,
    likes: Number(list?.likes) || 0,
    privacy: list?.privacy || 'public',
    traktUrl: user?.username && list?.ids?.slug
      ? `https://trakt.tv/users/${user.username}/lists/${list.ids.slug}` : null,
  };
}

export function listRowToApi(row) {
  return {
    list: {
      id: row.id,
      name: row.name,
      description: row.description || '',
      item_count: Number(row.itemCount) || 0,
      likes: Number(row.likes) || 0,
      ids: { slug: row.slug || null, trakt: row.externalId || null },
    },
    user: {
      username: row.ownerUsername || null,
      name: row.ownerName || row.ownerUsername || null,
      images: { avatar: { full: row.ownerAvatarUrl || null } },
    },
    previewPosters: Array.isArray(row.previewPosters) ? row.previewPosters : [],
  };
}
