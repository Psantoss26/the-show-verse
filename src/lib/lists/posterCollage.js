const DEFAULT_TILE_COUNT = 9

/**
 * Normaliza las portadas disponibles para un collage 3x3.
 *
 * El origen solo aporta URLs que ya están presentes en los datos de la lista:
 * no realiza peticiones adicionales. Para listas pequeñas se repiten sus
 * portadas de forma determinista y así cada celda mantiene formato 2:3.
 */
export function buildPosterCollageTiles(images, tileCount = DEFAULT_TILE_COUNT) {
    const posters = [...new Set(
        (Array.isArray(images) ? images : [])
            .filter((image) => typeof image === 'string' && image.trim())
            .map((image) => image.trim()),
    )]

    if (posters.length === 0) return []

    const count = Math.max(1, Math.min(Number(tileCount) || DEFAULT_TILE_COUNT, DEFAULT_TILE_COUNT))
    const representativePosters = posters.length <= count || count === 1
        ? posters.slice(0, count)
        : Array.from(
            { length: count },
            (_, index) => posters[Math.round((index * (posters.length - 1)) / (count - 1))],
        )

    return Array.from({ length: count }, (_, index) => representativePosters[index % representativePosters.length])
}
