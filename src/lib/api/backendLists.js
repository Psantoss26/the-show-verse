// src/lib/api/backendLists.js
// Reemplazo de src/lib/api/tmdbLists.js para las listas PERSONALES del usuario,
// respaldadas por nuestro backend (/v1/lists en Postgres) vía los proxies
// /api/lists*. Mantiene las MISMAS firmas/formas de retorno que tmdbLists.js para
// no tocar los consumidores (useTmdbLists.js, /lists/[listId]/page.jsx). El
// parámetro `sessionId` (compat TMDb) se ignora: la auth va por cookies JWT.
//
// El picker para añadir (searchMovies / fetchMovieCatalogList) sigue siendo TMDb
// público (no requiere migración) y se reexporta aquí para un único punto de import.
export { searchMovies, fetchMovieCatalogList } from './tmdbLists';

async function api(path, init = {}) {
  const res = await fetch(`/api/lists${path}`, {
    cache: 'no-store',
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json', ...(init.headers || {}) } : init.headers,
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok) throw new Error(json?.error || json?.message || 'Error en la operación de listas');
  return json || {};
}

// Mapea un item de user_list_items (backend) a la forma TMDb que consumen las
// tarjetas/detalle: { id: tmdbId, media_type, poster_path, title, name }.
function itemToTmdbShape(it) {
  return {
    id: it.tmdbId,
    media_type: it.mediaType === 'tv' ? 'tv' : 'movie',
    poster_path: it.posterPath || null,
    backdrop_path: null,
    title: it.title || null,
    name: it.title || null,
    _listItemId: it.id || null,
  };
}

export async function fetchUserLists() {
  const json = await api('');
  const results = (Array.isArray(json?.results) ? json.results : []).map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description || '',
    item_count: Number(l.itemCount ?? l.item_count ?? 0),
    public: !!l.isPublic,
    updatedAt: l.updatedAt || null,
  }));
  return { results, page: 1, total_pages: 1 };
}

export async function createUserList({ name, description } = {}) {
  const json = await api('', {
    method: 'POST',
    body: JSON.stringify({ name, description: description || undefined }),
  });
  return { success: true, list_id: json?.list?.id || null };
}

export async function deleteUserList({ listId } = {}) {
  await api(`/${encodeURIComponent(listId)}`, { method: 'DELETE' });
  return { ok: true };
}

export async function updateUserList({ listId, name, description } = {}) {
  await api(`/${encodeURIComponent(listId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, description: description ?? undefined }),
  });
  // El backend no recrea la lista (id estable), a diferencia de TMDb v3.
  return { recreated: false, listId };
}

export async function getListDetails({ listId, signal } = {}) {
  const json = await api(`/${encodeURIComponent(listId)}`, { signal });
  const list = json?.list || {};
  const rawItems = Array.isArray(json?.items) ? json.items : [];
  const items = rawItems.map(itemToTmdbShape);
  return {
    id: list.id || listId,
    name: list.name || '',
    description: list.description || '',
    public: !!list.isPublic,
    item_count: items.length,
    page: 1,
    total_pages: 1,
    items,
  };
}

export async function addMovieToList({ listId, movieId, mediaType = 'movie', title, posterPath } = {}) {
  await api(`/${encodeURIComponent(listId)}/items`, {
    method: 'POST',
    body: JSON.stringify({
      tmdbId: Number(movieId),
      mediaType: mediaType === 'tv' ? 'tv' : 'movie',
      ...(title ? { title } : {}),
      ...(posterPath ? { posterPath } : {}),
    }),
  });
  return { ok: true };
}

export async function removeMovieFromList({ listId, movieId, mediaType = 'movie' } = {}) {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  await api(`/${encodeURIComponent(listId)}/items/${encodeURIComponent(Number(movieId))}/${type}`, {
    method: 'DELETE',
  });
  return { ok: true };
}

export async function clearList({ listId } = {}) {
  await api(`/${encodeURIComponent(listId)}/items`, { method: 'DELETE' });
  return { ok: true };
}
