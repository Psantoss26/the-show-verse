// Lado cliente: llamamos a nuestro proxy /api/omdb
export async function fetchOmdbByImdb(imdbId) {
  if (!imdbId) return null;
  try {
    const res = await fetch(`/api/omdb?i=${encodeURIComponent(imdbId)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json(); // contiene "Awards", "Runtime", etc.
  } catch (e) {
    console.error('OMDb fetch error', e);
    return null;
  }
}
