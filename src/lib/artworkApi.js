// /src/lib/artworkApi.js

const sessionArtworkPreferences = new Map()
let artworkPreferencesRequest = null
let artworkSaveQueue = Promise.resolve()

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

async function fetchRemoteArtworkPreferences() {
    if (artworkPreferencesRequest) return artworkPreferencesRequest

    artworkPreferencesRequest = (async () => {
        try {
            const response = await fetch('/api/user/preferences', {
                method: 'GET',
                cache: 'no-store',
                credentials: 'include'
            })
            if (!response.ok) return null
            const json = await response.json()
            const overrides = json?.preferences?.uiSettings?.artworkOverrides
            return overrides && typeof overrides === 'object' ? overrides : {}
        } catch (err) {
            console.error('Error al obtener preferencias de artwork', err)
            return null
        } finally {
            artworkPreferencesRequest = null
        }
    })()

    return artworkPreferencesRequest
}

// Guarda una o varias selecciones de artwork en las preferencias autenticadas.
// La cola conserva el orden local y el backend bloquea la fila del usuario para
// que los cambios hechos desde distintos dispositivos no se pisen entre sí.
export function saveArtworkOverrides({ type, id, changes }) {
    const normalizedChanges = (changes || []).map((change) => ({
        type: type === 'show' ? 'tv' : type || 'movie',
        id: Number(id),
        kind: change.kind,
        filePath: change.filePath || null
    }))

    const save = async () => {
        if (!normalizedChanges.length) return true

        try {
            const response = await fetch('/api/user/preferences', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                // Una selección contiene solo rutas cortas de TMDb y puede
                // terminar aunque se navegue al dashboard de inmediato.
                keepalive: true,
                credentials: 'include',
                body: JSON.stringify({ artworkChanges: normalizedChanges })
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return true
        } catch (err) {
            console.error('Error guardando artwork override', err)
            return false
        }
    }

    const queued = artworkSaveQueue.then(save, save)
    artworkSaveQueue = queued.catch(() => undefined)
    return queued
}

// Guardar una selección de artwork (poster, mobilePoster, backdrop, background o logo)
export function saveArtworkOverride({ type, id, kind, filePath }) {
    return saveArtworkOverrides({
        type,
        id,
        changes: [{ kind, filePath }]
    })
}

// Leer todos los overrides de una obra concreta. `null` representa un fallo de
// red/autenticación y se diferencia de `{}`, que es un restablecimiento remoto.
export async function fetchArtworkOverride({ type, id }) {
    if (id == null || id === '') return {}

    const overrides = await fetchRemoteArtworkPreferences()
    if (overrides == null) return null
    const normalizedType = type === 'show' ? 'tv' : type || 'movie'
    return overrides[`${normalizedType}:${Number(id)}`] || {}
}

// Leer overrides para varios ids de un tipo y kind concreto
// p.ej: fetchArtworkOverrides({ type: 'movie', kind: 'backdrop', ids: [1,2,3] })
export async function fetchArtworkOverrides({ type, kind, ids }) {
    if (!ids || ids.length === 0) return {}

    const overrides = await fetchRemoteArtworkPreferences()
    if (overrides == null) return {}

    const normalizedType = type === 'show' ? 'tv' : type || 'movie'
    return Object.fromEntries(
        ids.map((id) => {
            const entry = overrides[`${normalizedType}:${Number(id)}`]
            return [String(id), kind ? entry?.[kind] || null : entry || {}]
        })
    )
}
