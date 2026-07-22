// /src/lib/artworkApi.js

const sessionArtworkPreferences = new Map()

function browserStorage() {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage
    } catch {
        return null
    }
}

function browserSessionStorage() {
    if (typeof window === 'undefined') return null
    try {
        return window.sessionStorage
    } catch {
        return null
    }
}

// Mantiene la selección durante la sesión incluso cuando un navegador móvil
// rechaza localStorage (modo privado, WebView o cuota). localStorage sigue
// siendo la persistencia preferida entre recargas.
export function readArtworkPreference(key, storage) {
    const stores = storage ? [storage] : [browserStorage(), browserSessionStorage()]

    for (const candidate of stores) {
        try {
            const value = candidate?.getItem(key)
            if (value) {
                sessionArtworkPreferences.set(key, value)
                return value
            }
        } catch {
            // Se prueba el siguiente almacenamiento disponible.
        }
    }

    return sessionArtworkPreferences.get(key) || null
}

export function writeArtworkPreference(key, value, storage) {
    if (value) sessionArtworkPreferences.set(key, value)
    else sessionArtworkPreferences.delete(key)

    const stores = storage ? [storage] : [browserStorage(), browserSessionStorage()]
    let persisted = false

    for (const candidate of stores) {
        try {
            if (value) candidate?.setItem(key, value)
            else candidate?.removeItem(key)
            persisted = Boolean(candidate) || persisted
        } catch {
            // La memoria de sesión conserva la elección aunque ambos fallen.
        }
    }

    return persisted
}

// Guardar una selección de artwork (poster, mobilePoster, backdrop, background o logo)
export async function saveArtworkOverride({ type, id, kind, filePath }) {
    try {
        const response = await fetch('/api/artwork', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // Evita que el navegador cancele el guardado si el usuario vuelve
            // de inmediato desde la ficha al dashboard.
            keepalive: true,
            body: JSON.stringify({
                type,
                id,
                kind,
                filePath
            })
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return true
    } catch (err) {
        console.error('Error guardando artwork override', err)
        return false
    }
}

// Leer todos los overrides de una obra concreta para recuperar una selección
// cuando localStorage no está disponible en el dispositivo móvil.
export async function fetchArtworkOverride({ type, id }) {
    if (id == null || id === '') return {}

    try {
        const params = new URLSearchParams({
            type: type || 'movie',
            id: String(id)
        })
        const res = await fetch(`/api/artwork?${params.toString()}`, {
            method: 'GET',
            cache: 'no-store'
        })
        if (!res.ok) return {}
        const json = await res.json()
        return json.overrides || {}
    } catch (err) {
        console.error('Error al obtener artwork override', err)
        return {}
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
