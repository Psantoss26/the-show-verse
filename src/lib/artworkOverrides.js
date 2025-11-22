// /src/lib/artworkOverrides.js

// ⚠️ IMPLEMENTACIÓN EN MEMORIA (DEMO)
//
// Esto se comparte entre peticiones dentro del mismo proceso,
// pero no persiste entre despliegues / reinicios.
// Para producción, sustituye esto por tu BBDD (Prisma, SQL, etc).
//
// Estructura guardada:
// overridesMemory[movieId] = { poster: '/path.jpg', backdrop: '/back.jpg' }
const overridesMemory = {}

/**
 * Obtiene overrides globales de una lista de IDs de película.
 * Devuelve un objeto: { [movieId]: { poster, backdrop } }
 */
async function getMovieArtworkOverrides(movieIds) {
    const result = {}
    if (!Array.isArray(movieIds) || movieIds.length === 0) return result

    for (const id of movieIds) {
        const key = String(id)
        if (overridesMemory[key]) {
            result[id] = {
                poster: overridesMemory[key].poster || null,
                backdrop: overridesMemory[key].backdrop || null
            }
        }
    }

    // 💡 Aquí es donde sustituirías por tu BBDD.
    // Ejemplo conceptual con Prisma:
    //
    // const rows = await prisma.movieArtworkOverride.findMany({
    //   where: { movieId: { in: movieIds } }
    // })
    // for (const row of rows) {
    //   result[row.movieId] = {
    //     poster: row.poster || null,
    //     backdrop: row.backdrop || null
    //   }
    // }
    //
    return result
}

/**
 * Aplica overrides globales a un array de películas.
 * Cada película debe tener al menos: { id, poster_path?, backdrop_path? }
 */
async function applyArtworkOverrides(movies) {
    if (!Array.isArray(movies) || movies.length === 0) return movies

    const ids = movies.map((m) => m.id).filter(Boolean)
    const overrides = await getMovieArtworkOverrides(ids)

    return movies.map((m) => {
        const ov = overrides[m.id]
        if (!ov) return m
        return {
            ...m,
            poster_path: ov.poster != null ? ov.poster : m.poster_path ?? null,
            backdrop_path: ov.backdrop != null ? ov.backdrop : m.backdrop_path ?? null
        }
    })
}

/**
 * Aplica overrides a todas las listas de películas dentro de un objeto dashboard.
 * 
 * Ejemplo de `dashboardData`:
 * {
 *   topRated: [pelis...],
 *   popular: [pelis...],
 *   trending: [pelis...],
 *   ...
 * }
 */
async function applyArtworkOverridesToDashboard(dashboardData) {
    if (!dashboardData || typeof dashboardData !== 'object') return dashboardData

    const result = { ...dashboardData }

    for (const key of Object.keys(dashboardData)) {
        const value = dashboardData[key]
        if (Array.isArray(value)) {
            // Es una lista de películas → aplicamos overrides
            result[key] = await applyArtworkOverrides(value)
        } else {
            // No es lista (por si tienes otros datos)
            result[key] = value
        }
    }

    return result
}

/**
 * Guarda / actualiza el override global de una película.
 * movieId: número o string de TMDb
 * poster: file_path de TMDb (ej: "/abc123.jpg") o null
 * backdrop: file_path de TMDb o null
 */
async function saveMovieArtworkOverride({ movieId, poster, backdrop }) {
    if (!movieId) return

    const key = String(movieId)
    overridesMemory[key] = {
        poster: poster ?? null,
        backdrop: backdrop ?? null
    }

    // 💾 Aquí va tu guardado real en BBDD (upsert).
    //
    // Ejemplo conceptual con Prisma:
    //
    // await prisma.movieArtworkOverride.upsert({
    //   where: { movieId: Number(movieId) },
    //   update: { poster, backdrop },
    //   create: { movieId: Number(movieId), poster, backdrop }
    // })
}

module.exports = {
    getMovieArtworkOverrides,
    applyArtworkOverrides,
    applyArtworkOverridesToDashboard,
    saveMovieArtworkOverride
}
