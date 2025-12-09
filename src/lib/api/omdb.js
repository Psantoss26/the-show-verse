// src/lib/api/omdb.js

// Llamada segura al proxy /api/omdb.
// Devuelve:
//   - objeto OMDb (con imdbRating, Awards, etc.) si todo va bien
//   - null si algo falla o ok:false
export async function fetchOmdbByImdb(imdbId) {
  if (!imdbId) return null

  try {
    const res = await fetch(`/api/omdb?i=${encodeURIComponent(imdbId)}`, {
      // cache suave en el cliente; puedes ajustar si quieres
      cache: 'force-cache'
    })

    if (!res.ok) {
      console.warn('[fetchOmdbByImdb] HTTP error', res.status)
      return null
    }

    const data = await res.json()

    if (!data || data.ok === false) {
      // El proxy ya te da error descriptivo en data.error
      if (data?.error) {
        console.warn('[fetchOmdbByImdb] upstream error:', data.error)
      }
      return null
    }

    // data incluye campos originales de OMDb
    return data
  } catch (err) {
    console.error('[fetchOmdbByImdb] unexpected error', err)
    return null
  }
}
