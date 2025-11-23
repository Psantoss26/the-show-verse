// /src/lib/artworkApi.js

// Guardar una selección global (poster, backdrop o background)
export async function saveArtworkOverride({ type, id, kind, filePath }) {
    try {
        await fetch('/api/artwork', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type,
                id,
                kind,
                filePath
            })
        })
    } catch (err) {
        console.error('Error guardando artwork override', err)
    }
}

// Leer overrides para varios ids de un tipo y kind concreto
// p.ej: fetchArtworkOverrides({ type: 'movie', kind: 'backdrop', ids: [1,2,3] })
export async function fetchArtworkOverrides({ type, kind, ids }) {
    if (!ids || ids.length === 0) return {}

    const params = new URLSearchParams()
    params.set('type', type || 'movie')
    if (kind) params.set('kind', kind)
    params.set('ids', ids.join(','))

    try {
        const res = await fetch(`/api/artwork?${params.toString()}`, {
            method: 'GET',
            cache: 'no-store'
        })

        if (!res.ok) {
            console.error('Error al obtener artwork overrides', res.status)
            return {}
        }

        const json = await res.json()
        return json.overrides || {}
    } catch (err) {
        console.error('Error al llamar a /api/artwork', err)
        return {}
    }
}
