const DEFAULT_TILE_COUNT = 20
const MAX_TILE_COUNT = 20

function uniformGrid(tileCount, gridClassName) {
    return {
        gridClassName,
        tileClassNames: Array.from({ length: tileCount }, () => ''),
    }
}

// Cada mosaico prioriza una lectura clara de las carátulas: las listas cortas
// conservan una portada protagonista y las largas distribuyen el peso sin
// repetir ninguna imagen. Las clases son estáticas para que Tailwind genere
// todos los estilos necesarios en compilación.
const COLLAGE_LAYOUTS = {
    2: {
        gridClassName: 'grid-cols-2 grid-rows-1',
        tileClassNames: ['', ''],
    },
    3: {
        gridClassName: 'grid-cols-2 grid-rows-2',
        tileClassNames: ['row-span-2', '', ''],
    },
    4: {
        gridClassName: 'grid-cols-2 grid-rows-2',
        tileClassNames: ['', '', '', ''],
    },
    5: {
        gridClassName: 'grid-cols-3 grid-rows-2',
        tileClassNames: ['row-span-2', '', '', '', ''],
    },
    6: {
        gridClassName: 'grid-cols-3 grid-rows-2',
        tileClassNames: ['', '', '', '', '', ''],
    },
    7: {
        gridClassName: 'grid-cols-4 grid-rows-3',
        tileClassNames: ['col-span-2 row-span-3', '', '', '', '', '', ''],
    },
    8: {
        gridClassName: 'grid-cols-4 grid-rows-2',
        tileClassNames: ['', '', '', '', '', '', '', ''],
    },
    // Desde nueve títulos se prioriza una columna adicional para acercar cada
    // celda a la proporción vertical del póster y evitar recortes agresivos.
    // La composición sigue creciendo hasta cinco filas, con cuatro títulos por
    // fila, antes de empezar a muestrear las listas muy largas.
    9: uniformGrid(9, 'grid-cols-4 grid-rows-3'),
    10: uniformGrid(10, 'grid-cols-4 grid-rows-3'),
    11: uniformGrid(11, 'grid-cols-4 grid-rows-3'),
    12: uniformGrid(12, 'grid-cols-4 grid-rows-3'),
    13: uniformGrid(13, 'grid-cols-4 grid-rows-4'),
    14: uniformGrid(14, 'grid-cols-4 grid-rows-4'),
    15: uniformGrid(15, 'grid-cols-4 grid-rows-4'),
    16: uniformGrid(16, 'grid-cols-4 grid-rows-4'),
    17: uniformGrid(17, 'grid-cols-4 grid-rows-5'),
    18: uniformGrid(18, 'grid-cols-4 grid-rows-5'),
    19: uniformGrid(19, 'grid-cols-4 grid-rows-5'),
    20: uniformGrid(20, 'grid-cols-4 grid-rows-5'),
}

function posterTargetIdentity(item) {
    const rawId = item?.tmdbId ?? item?.tmdb_id ?? item?.id
    const tmdbId = Number(rawId)
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null

    const rawType = item?.mediaType ?? item?.media_type
    const mediaType = rawType === 'tv' || rawType === 'show' || rawType === 'episode'
        ? 'tv'
        : 'movie'

    return {
        key: `${mediaType}:${tmdbId}`,
        tmdbId,
        mediaType,
    }
}

/**
 * Elige los títulos cuyo arte se resolverá para la portada. No usa las rutas
 * persistidas: así la cabecera nunca tiene que montar un póster provisional.
 */
export function buildPosterCollageTargets(items, targetCount = DEFAULT_TILE_COUNT) {
    const targets = []
    const seen = new Set()

    for (const item of Array.isArray(items) ? items : []) {
        const target = posterTargetIdentity(item)
        if (!target || seen.has(target.key)) continue
        seen.add(target.key)
        targets.push(target)
    }

    const count = Math.max(1, Math.min(Number(targetCount) || DEFAULT_TILE_COUNT, MAX_TILE_COUNT))
    if (targets.length <= count || count === 1) return targets.slice(0, count)

    return Array.from(
        { length: count },
        (_, index) => targets[Math.round((index * (targets.length - 1)) / (count - 1))],
    )
}

/**
 * Normaliza las portadas disponibles para un collage de hasta veinte imágenes.
 *
 * El origen solo aporta URLs que ya están presentes en los datos de la lista:
 * no realiza peticiones adicionales. Cada resultado es único: las listas
 * pequeñas dejan huecos deliberadamente en vez de duplicar una carátula.
 */
export function buildPosterCollageTiles(images, tileCount = DEFAULT_TILE_COUNT) {
    const posters = [...new Set(
        (Array.isArray(images) ? images : [])
            .filter((image) => typeof image === 'string' && image.trim())
            .map((image) => image.trim()),
    )]

    if (posters.length === 0) return []

    const count = Math.max(1, Math.min(Number(tileCount) || DEFAULT_TILE_COUNT, MAX_TILE_COUNT))
    const representativePosters = posters.length <= count || count === 1
        ? posters.slice(0, count)
        : Array.from(
            { length: count },
            (_, index) => posters[Math.round((index * (posters.length - 1)) / (count - 1))],
        )

    return representativePosters
}

export function getPosterCollageLayout(tileCount) {
    const count = Math.max(2, Math.min(Number(tileCount) || 2, MAX_TILE_COUNT))
    return COLLAGE_LAYOUTS[count]
}
