// /src/lib/artworkApi.js

import { isExternalNetworkAccess } from './network/accessScope.js'

const sessionArtworkPreferences = new Map()

// ¿Hay que renunciar a los overrides de artwork en esta visita?
//
// En VISTA MÓVIL y con acceso externo, sí. La comprobación de overrides es una
// ida y vuelta al NAS por el túnel, y es lo único que separa a la ficha de
// empezar a descargar la portada en una primera visita. Renunciar a ella sale
// barato: las selecciones personalizadas son rutas de TMDb, así que la portada
// se descarga del MISMO CDN en ambos casos -- lo único que cambia es cuál se
// elige, y sin overrides se usa el criterio automático.
//
// En la red del servidor la consulta es local y no compensa apagar nada; en
// escritorio y tablet tampoco se toca (decisión de producto, no técnica).
export function shouldSkipRemoteArtwork({
    mobileViewport,
    hostname,
    localHosts
} = {}) {
    if (!mobileViewport) return false
    return isExternalNetworkAccess({ hostname, localHosts })
}
let artworkPreferencesRequest = null
let artworkSaveQueue = Promise.resolve()
const ARTWORK_SAVE_RETRY_DELAYS_MS = [1000, 3000]

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function resolveCachedArtworkOverride({
    preferences,
    cached,
    authenticated,
    type,
    id
}) {
    if (!authenticated || !cached) return null

    const overrides = preferences?.uiSettings?.artworkOverrides
    const normalizedType = type === 'show' ? 'tv' : type || 'movie'
    const entry =
        overrides && typeof overrides === 'object'
            ? overrides[`${normalizedType}:${Number(id)}`]
            : null

    // Una instantánea completa también confirma los casos negativos. `{}` no
    // significa «cargando», sino «este título no tiene overrides».
    return entry && typeof entry === 'object' ? entry : {}
}

export function applyArtworkOverrideChanges(preferences, { type, id, changes }) {
    const normalizedType = type === 'show' ? 'tv' : type || 'movie'
    const artworkKey = `${normalizedType}:${Number(id)}`
    const currentUiSettings = preferences?.uiSettings || {}
    const currentOverrides =
        currentUiSettings.artworkOverrides &&
        typeof currentUiSettings.artworkOverrides === 'object'
            ? currentUiSettings.artworkOverrides
            : {}
    const currentEntry =
        currentOverrides[artworkKey] &&
        typeof currentOverrides[artworkKey] === 'object'
            ? currentOverrides[artworkKey]
            : {}
    const nextEntry = { ...currentEntry }

    for (const change of changes || []) {
        if (!change?.kind) continue
        if (change.filePath) nextEntry[change.kind] = change.filePath
        else delete nextEntry[change.kind]
    }

    const nextOverrides = { ...currentOverrides }
    if (Object.keys(nextEntry).length > 0) {
        nextOverrides[artworkKey] = nextEntry
    } else {
        delete nextOverrides[artworkKey]
    }

    return {
        ...(preferences || {}),
        uiSettings: {
            ...currentUiSettings,
            artworkOverrides: nextOverrides
        }
    }
}

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

// Clave donde AuthContext persiste la instantánea COMPLETA de preferencias.
// Vive aquí (y no en AuthContext) porque el propietario de los overrides de
// artwork es este módulo y AuthContext ya importa de él; al revés habría ciclo.
export const ARTWORK_PREFERENCES_CACHE_KEY = 'showverse:auth:preferences:v1'

// Instantánea persistida de overrides. A diferencia de `sessionArtworkPreferences`
// (memoria, muere al recargar) y del propio contexto de auth (que no está
// hidratado en el primer render), esto se puede leer de forma SÍNCRONA en el
// primer efecto de layout, antes de cualquier pintado.
//
// `null` significa «no hay instantánea utilizable»: quien llame debe seguir
// esperando a la red. `{}` es una respuesta afirmativa —hay instantánea y no
// contiene overrides—, con la misma certeza que daría el servidor.
export function readPersistedArtworkOverrides(storage) {
    const store = storage || browserStorage()
    if (!store) return null

    try {
        const raw = store.getItem(ARTWORK_PREFERENCES_CACHE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        const overrides = parsed?.uiSettings?.artworkOverrides
        return overrides && typeof overrides === 'object' ? overrides : {}
    } catch {
        return null
    }
}

// Overrides persistidos de UN título. Mismo contrato que `fetchArtworkOverride`
// (`null` = todavía no se sabe, `{}` = sin selección propia) para que el
// consumidor trate igual la instantánea local y la respuesta remota.
export function readPersistedArtworkOverride({ type, id, storage }) {
    if (id == null || id === '') return null

    const overrides = readPersistedArtworkOverrides(storage)
    if (overrides == null) return null

    const normalizedType = type === 'show' ? 'tv' : type || 'movie'
    const entry = overrides[`${normalizedType}:${Number(id)}`]
    return entry && typeof entry === 'object' ? entry : {}
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

        // Un corte momentáneo del túnel al NAS o un 5xx perdían la selección:
        // se veía elegida (instantánea local) pero la siguiente revalidación
        // remota la devolvía a la anterior. Se reintenta solo lo transitorio;
        // un 4xx (sin sesión, validación) no va a cambiar repitiéndolo.
        for (let attempt = 0; ; attempt += 1) {
            let retryable = true
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
                if (response.ok) return true
                retryable = response.status >= 500
                throw new Error(`HTTP ${response.status}`)
            } catch (err) {
                if (!retryable || attempt >= ARTWORK_SAVE_RETRY_DELAYS_MS.length) {
                    console.error('Error guardando artwork override', err)
                    return false
                }
                await wait(ARTWORK_SAVE_RETRY_DELAYS_MS[attempt])
            }
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

// Imágenes MÁS VOTADAS de un título: { poster, mobilePoster, backdrop,
// background, logo }, solo los tipos con algún voto. Cada selección de un
// usuario cuenta como un voto (ver backend/src/lib/artworkVotes.js) y la
// ganadora es la imagen por defecto para todo el mundo, siempre por detrás de
// la selección propia. `null` = no se pudo saber.
const communityArtworkRequests = new Map()
const COMMUNITY_ARTWORK_TTL_MS = 60000
const COMMUNITY_ARTWORK_TYPES = new Set(['movie', 'tv', 'collection'])

const communityArtworkListeners = new Map()

function communityArtworkKey({ type, id }) {
    const normalizedType = type === 'show' ? 'tv' : type || 'movie'
    return `${normalizedType}:${Number(id)}`
}

function notifyCommunityArtwork(key, event) {
    for (const listener of communityArtworkListeners.get(key) || []) {
        try {
            listener(event)
        } catch (err) {
            console.error('Error notificando artwork de la comunidad', err)
        }
    }
}

// Páginas montadas que enseñan la más votada de un título. La copia que
// leyeron al entrar incluye el voto PROPIO de visitas anteriores: sin este
// aviso, al restablecer la selección se caía justo en esa imagen (la propia,
// ahora «de la comunidad») hasta recargar. Eventos: `{ retract: votes }`
// (quitar ya el voto propio de la copia) y `{ refresh: true }` (volver a
// preguntar al servidor).
export function subscribeCommunityArtwork({ type, id }, listener) {
    if (id == null || id === '' || typeof listener !== 'function') return () => {}
    const key = communityArtworkKey({ type, id })
    let listeners = communityArtworkListeners.get(key)
    if (!listeners) {
        listeners = new Set()
        communityArtworkListeners.set(key, listeners)
    }
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
        if (!listeners.size) communityArtworkListeners.delete(key)
    }
}

// La más votada sin los votos indicados (`{ kind: ruta | ruta[] }`): lo que
// queda al retirar el voto propio, a la espera de la respuesta del servidor
// (si otros votaron la misma imagen, la consulta posterior la devuelve).
export function withoutArtworkVotes(artwork, votes) {
    if (!artwork || typeof artwork !== 'object' || !votes) return artwork
    let changed = false
    const next = { ...artwork }
    for (const [kind, paths] of Object.entries(votes)) {
        const list = Array.isArray(paths) || paths instanceof Set ? [...paths] : [paths]
        if (next[kind] && list.includes(next[kind])) {
            delete next[kind]
            changed = true
        }
    }
    return changed ? next : artwork
}

// El voto propio deja de contar YA en las páginas montadas del título.
export function retractOwnArtworkVotes({ type, id, votes }) {
    if (id == null || id === '' || !votes) return
    notifyCommunityArtwork(communityArtworkKey({ type, id }), { retract: votes })
}

// Tras votar: la siguiente consulta del título vuelve a preguntar al servidor,
// y las páginas montadas lo hacen ya.
export function forgetCommunityArtwork({ type, id }) {
    const key = communityArtworkKey({ type, id })
    communityArtworkRequests.delete(key)
    notifyCommunityArtwork(key, { refresh: true })
}

export function fetchCommunityArtwork({ type, id }) {
    const normalizedType = type === 'show' ? 'tv' : type || 'movie'
    if (!COMMUNITY_ARTWORK_TYPES.has(normalizedType)) return Promise.resolve(null)
    if (id == null || id === '') return Promise.resolve(null)

    const key = `${normalizedType}:${Number(id)}`
    const cached = communityArtworkRequests.get(key)
    if (cached && Date.now() - cached.at < COMMUNITY_ARTWORK_TTL_MS) return cached.promise

    const promise = fetch(`/api/community/${normalizedType}/${Number(id)}/artwork`, {
        cache: 'no-store'
    })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) =>
            json?.artwork && typeof json.artwork === 'object' ? json.artwork : null
        )
        .catch(() => null)
    communityArtworkRequests.set(key, { at: Date.now(), promise })
    promise.then((artwork) => {
        if (!artwork) communityArtworkRequests.delete(key)
    })
    return promise
}

// Selección propia por encima de la más votada, tipo a tipo. Mismo contrato que
// `fetchArtworkOverride`: `overrides` null = «no se sabe» y entonces vale la
// copia local por título (`localPreference`). Sin votos devuelve `overrides`
// tal cual, así que quien no tenga comunidad se comporta exactamente igual.
export function withCommunityArtwork(overrides, community, localPreference = null) {
    if (!community || typeof community !== 'object') return overrides
    const own = overrides ?? localPreference ?? {}
    const merged = { ...community }
    for (const [kind, filePath] of Object.entries(own)) {
        if (filePath) merged[kind] = filePath
    }
    return merged
}
