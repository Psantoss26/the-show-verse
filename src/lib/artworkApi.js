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

// ---------------------------------------------------------------------------
// Portada elegida para las TARJETAS (Favoritos, Pendientes, En progreso,
// Historial, Perfil, dashboards...). Es la portada de ESCRITORIO de la ficha
// (kind `poster`): en escritorio la pestaña «Portada» y en móvil la pestaña
// «Tarjetas». La portada del hero móvil (`mobilePoster`, con o sin idioma) es
// solo de la ficha y nunca llega aquí.
//
// Una página puede pintar cientos de tarjetas y cada una pregunta en cada
// render, así que la instantánea se lee y se parsea UNA vez y se guarda en
// memoria hasta que AuthContext la reescribe (`notifyPersistedArtworkOverridesChanged`)
// u otra pestaña la cambia (evento `storage`).
const cardPosterListeners = new Set()
let cardPosterMemo = null
let cardPosterStorageListening = false

function readCardPosterOverrides() {
    if (cardPosterMemo === null) {
        cardPosterMemo = { overrides: readPersistedArtworkOverrides() }
    }
    return cardPosterMemo.overrides
}

let cardPosterNotifyQueued = false

// La memoria se invalida al momento, pero el aviso a las tarjetas va en una
// microtarea (y agrupado): AuthContext reescribe la instantánea DENTRO del
// actualizador de `setPreferences`, que React ejecuta mientras renderiza
// AuthProvider. Avisar ahí actualizaba las tarjetas montadas en pleno render
// de otro componente («Cannot update a component while rendering…», al elegir
// portada en el panel lateral con una lista detrás).
export function notifyPersistedArtworkOverridesChanged() {
    cardPosterMemo = null
    queueCardArtworkNotify()
}

function queueCardArtworkNotify() {
    if (cardPosterNotifyQueued || cardPosterListeners.size === 0) return
    cardPosterNotifyQueued = true
    queueMicrotask(() => {
        cardPosterNotifyQueued = false
        for (const listener of cardPosterListeners) listener()
    })
}

// Elección PROPIA de una capa (`poster`, `logo`, `backdrop`…) de un título,
// desde la misma memoria. `null` = sin elección: se usa la más votada o la
// automática. La usan las tarjetas (`poster`) y el destacado del dashboard
// (`logo`).
export function getOwnArtwork(type, id, kind) {
    if (id == null || id === '' || !kind || typeof window === 'undefined') return null
    const normalizedType = type === 'show' ? 'tv' : type === 'tv' ? 'tv' : 'movie'
    const overrides = readCardPosterOverrides()
    if (overrides != null) {
        return overrides[`${normalizedType}:${Number(id)}`]?.[kind] || null
    }
    // Sin instantánea de la cuenta (sin sesión o primera visita del
    // dispositivo): la copia local que escribe la ficha, como el dashboard.
    return readArtworkPreference(`showverse:${normalizedType}:${id}:${kind}`) || null
}

// Imagen de una TARJETA: la elección propia y, sin ella, la más votada por
// todos (`getCommunityCardArtwork`), igual que en la ficha. `null` = ninguna de
// las dos: la tarjeta usa su criterio automático.
export function getCardArtwork(type, id, kind) {
    return getOwnArtwork(type, id, kind) || getCommunityCardArtwork(type, id, kind)
}

// Portada de la tarjeta (kind `poster`): propia o más votada.
export function getOwnCardPoster(type, id) {
    return getCardArtwork(type, id, 'poster')
}

export function subscribeOwnCardPosters(listener) {
    cardPosterListeners.add(listener)
    if (!cardPosterStorageListening && typeof window !== 'undefined') {
        cardPosterStorageListening = true
        window.addEventListener('storage', (event) => {
            if (event.key === null || event.key === ARTWORK_PREFERENCES_CACHE_KEY) {
                notifyPersistedArtworkOverridesChanged()
            }
        })
    }
    return () => {
        cardPosterListeners.delete(listener)
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
    const key = communityArtworkKey({ type, id })
    notifyCommunityArtwork(key, { retract: votes })
    retractCommunityCardVotes(key, votes)
}

// Tras votar: la siguiente consulta del título vuelve a preguntar al servidor,
// y las páginas montadas lo hacen ya.
export function forgetCommunityArtwork({ type, id }) {
    const key = communityArtworkKey({ type, id })
    communityArtworkRequests.delete(key)
    notifyCommunityArtwork(key, { refresh: true })
    forgetCommunityCardArtwork(key)
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
        else rememberCommunityCardArtwork({ type: normalizedType, id }, artwork)
    })
    return promise
}

// Cuántas veces está elegida cada imagen de un título, por tipo de imagen:
// { poster: { '/x.jpg': 3 } }. Para el contador de las tarjetas de «Portadas y
// fondos» (también `season` y `collection`). `null` = no se pudo saber.
export function fetchArtworkVoteCounts({ type, id }) {
    const normalizedType = type === 'show' ? 'tv' : type || 'movie'
    if (id == null || id === '') return Promise.resolve(null)
    return fetch(`/api/community/${normalizedType}/${Number(id)}/artwork/votes`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => (json?.votes && typeof json.votes === 'object' ? json.votes : null))
        .catch(() => null)
}

// Recuento al día con la selección propia de AHORA: el servidor contó la que
// había al leerlo (`ownAtFetch`), y elegir otra mueve ese voto al momento
// (`ownNow`), sin esperar a volver a preguntar.
export function adjustArtworkVoteCounts(counts, ownAtFetch, ownNow) {
    if (!counts) return counts
    const before = ownAtFetch || {}
    const after = ownNow || {}
    let next = counts
    const bump = (kind, path, delta) => {
        if (!path) return
        if (next === counts) next = { ...counts }
        const byPath = { ...(next[kind] || {}) }
        const value = (byPath[path] || 0) + delta
        if (value > 0) byPath[path] = value
        else delete byPath[path]
        next[kind] = byPath
    }
    for (const kind of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if ((before[kind] || null) === (after[kind] || null)) continue
        bump(kind, before[kind], -1)
        bump(kind, after[kind], 1)
    }
    return next
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

// ---------------------------------------------------------------------------
// Más votada para las TARJETAS de páginas, dashboards y DetailModal, por LOTES
// (/api/community/artwork?type=…&ids=…): una página monta decenas o cientos
// de tarjetas a la vez y van en pocas peticiones. Lo resuelto se guarda en
// localStorage: al volver, cada tarjeta enseña su imagen sin esperar ni
// cambiar delante del usuario. Pasados `FRESH` ms se sigue usando mientras se
// vuelve a preguntar. Las tarjetas lo leen con `getCardArtwork` y se enteran
// de lo que llega por la misma suscripción que la elección propia.
const COMMUNITY_CARD_STORAGE_KEY = 'showverse:community-card-artwork:v1'
// Un minuto, como la consulta de un título y la caché del backend: los votos
// de otros usuarios llegan a las tarjetas casi a la vez que a la ficha.
const COMMUNITY_CARD_FRESH_MS = 60 * 1000
const COMMUNITY_CARD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const COMMUNITY_CARD_RETRY_MS = 60 * 1000
const COMMUNITY_CARD_BATCH_MS = 16
const COMMUNITY_CARD_MAX_IDS = 100
const COMMUNITY_CARD_MAX_ENTRIES = 4000
const COMMUNITY_CARD_TYPES = new Set(['movie', 'tv'])

let communityCardEntries = null // `${type}:${id}` -> { artwork, at }
const communityCardQueue = new Set()
const communityCardInFlight = new Map() // `${type}:${id}` -> promesa de su lote
const communityCardFailedAt = new Map()
let communityCardTimer = 0
let communityCardPersistTimer = 0

function loadCommunityCardEntries() {
    if (communityCardEntries) return communityCardEntries
    communityCardEntries = new Map()
    try {
        const raw = JSON.parse(window.localStorage.getItem(COMMUNITY_CARD_STORAGE_KEY) || '{}')
        const oldest = Date.now() - COMMUNITY_CARD_MAX_AGE_MS
        for (const [key, entry] of Object.entries(raw || {})) {
            if (entry && typeof entry.a === 'object' && Number(entry.t) > oldest) {
                communityCardEntries.set(key, { artwork: entry.a, at: Number(entry.t) })
            }
        }
    } catch {
        // Sin almacenamiento: solo memoria.
    }
    return communityCardEntries
}

function persistCommunityCardEntries() {
    if (communityCardPersistTimer) return
    communityCardPersistTimer = setTimeout(() => {
        communityCardPersistTimer = 0
        const entries = [...loadCommunityCardEntries()]
            .sort((a, b) => b[1].at - a[1].at)
            .slice(0, COMMUNITY_CARD_MAX_ENTRIES)
        try {
            window.localStorage.setItem(
                COMMUNITY_CARD_STORAGE_KEY,
                JSON.stringify(Object.fromEntries(entries.map(([key, entry]) => [key, { a: entry.artwork, t: entry.at }])))
            )
        } catch {
            // Cuota llena: se queda en memoria.
        }
    }, 500)
}

function sendCommunityCardBatch(type, ids) {
    const keys = ids.map((id) => `${type}:${id}`)
    const request = requestCommunityCardBatch(type, ids, keys)
    keys.forEach((key) => communityCardInFlight.set(key, request))
    return request
}

async function requestCommunityCardBatch(type, ids, keys) {
    try {
        const response = await fetch(`/api/community/artwork?type=${type}&ids=${ids.join(',')}`, {
            cache: 'no-store'
        })
        const json = response.ok ? await response.json() : null
        const artwork = json?.artwork && typeof json.artwork === 'object' ? json.artwork : null
        if (!artwork) throw new Error(`HTTP ${response.status}`)
        const entries = loadCommunityCardEntries()
        const at = Date.now()
        ids.forEach((id, index) => {
            const value = artwork[id]
            entries.set(keys[index], { artwork: value && typeof value === 'object' ? value : {}, at })
            communityCardFailedAt.delete(keys[index])
        })
        persistCommunityCardEntries()
        queueCardArtworkNotify()
    } catch {
        // Se reintenta pasado un rato; mientras, la tarjeta usa lo que tenga.
        const at = Date.now()
        keys.forEach((key) => communityCardFailedAt.set(key, at))
    } finally {
        keys.forEach((key) => communityCardInFlight.delete(key))
    }
}

function flushCommunityCardQueue() {
    communityCardTimer = 0
    const byType = new Map()
    for (const key of communityCardQueue) {
        const [type, id] = key.split(':')
        if (!byType.has(type)) byType.set(type, [])
        byType.get(type).push(Number(id))
    }
    communityCardQueue.clear()
    for (const [type, ids] of byType) {
        for (let start = 0; start < ids.length; start += COMMUNITY_CARD_MAX_IDS) {
            void sendCommunityCardBatch(type, ids.slice(start, start + COMMUNITY_CARD_MAX_IDS))
        }
    }
}

function queueCommunityCardRequest(key) {
    if (communityCardQueue.has(key) || communityCardInFlight.has(key)) return
    const failedAt = communityCardFailedAt.get(key)
    if (failedAt && Date.now() - failedAt < COMMUNITY_CARD_RETRY_MS) return
    communityCardQueue.add(key)
    if (!communityCardTimer) communityCardTimer = setTimeout(flushCommunityCardQueue, COMMUNITY_CARD_BATCH_MS)
}

function communityCardKey(type, id) {
    const normalizedType = type === 'show' ? 'tv' : type === 'tv' ? 'tv' : type || 'movie'
    const numericId = Number(id)
    if (!COMMUNITY_CARD_TYPES.has(normalizedType) || !Number.isInteger(numericId) || numericId <= 0) return null
    return `${normalizedType}:${numericId}`
}

// Más votada de una capa (`poster`, `cardBackdrop`, `logo`…) para una tarjeta.
// Lo que no se sabe (o caducó) se pide en el siguiente lote; mientras, `null`
// (o lo que hubiera) y al llegar se avisa a las tarjetas suscritas.
export function getCommunityCardArtwork(type, id, kind) {
    if (typeof window === 'undefined' || !kind) return null
    const key = communityCardKey(type, id)
    if (!key) return null
    const entry = loadCommunityCardEntries().get(key)
    if (!entry || Date.now() - entry.at > COMMUNITY_CARD_FRESH_MS) queueCommunityCardRequest(key)
    return entry?.artwork?.[kind] || null
}

// Imagen de tarjeta (propia o más votada) de varios títulos (`{ id, mediaType }`),
// ESPERANDO al lote de los que aún no se saben o caducaron. Para quien pinta
// una sola vez y no puede cambiarla al llegar la votada: las imágenes de
// compartir. Devuelve `${type}:${id}` -> ruta, o `null` si no hay ninguna de
// las dos (se usa el criterio automático).
export async function resolveCardArtwork(refs, kind) {
    if (typeof window === 'undefined' || !kind) return new Map()
    const keys = [
        ...new Set(
            (Array.isArray(refs) ? refs : [])
                .map((ref) => communityCardKey(ref?.mediaType ?? ref?.media_type ?? ref?.type, ref?.tmdbId ?? ref?.id))
                .filter(Boolean)
        )
    ]
    const entries = loadCommunityCardEntries()
    const waits = []
    const missing = new Map() // type -> ids
    for (const key of keys) {
        const [type, id] = key.split(':')
        if (getOwnArtwork(type, id, kind)) continue
        const entry = entries.get(key)
        if (entry && Date.now() - entry.at <= COMMUNITY_CARD_FRESH_MS) continue
        const inFlight = communityCardInFlight.get(key)
        if (inFlight) {
            waits.push(inFlight)
            continue
        }
        communityCardQueue.delete(key)
        if (!missing.has(type)) missing.set(type, [])
        missing.get(type).push(Number(id))
    }
    for (const [type, ids] of missing) {
        for (let start = 0; start < ids.length; start += COMMUNITY_CARD_MAX_IDS) {
            waits.push(sendCommunityCardBatch(type, ids.slice(start, start + COMMUNITY_CARD_MAX_IDS)))
        }
    }
    await Promise.all(waits)
    return new Map(
        keys.map((key) => {
            const [type, id] = key.split(':')
            return [key, getOwnArtwork(type, id, kind) || entries.get(key)?.artwork?.[kind] || null]
        })
    )
}

// Estado de la imagen de una tarjeta: su ruta (propia o más votada), `false`
// si ya se sabe que no hay ninguna de las dos (usa la automática) o `null` si
// aún no se sabe si hay votada (el lote está en camino). Para quien no debe
// pintar la automática y cambiarla un instante después (vistas previas).
export function getCardArtworkState(type, id, kind) {
    const own = getOwnArtwork(type, id, kind)
    if (own) return own
    if (typeof window === 'undefined') return null
    const key = communityCardKey(type, id)
    if (!key) return false
    const community = getCommunityCardArtwork(type, id, kind)
    if (community) return community
    if (loadCommunityCardEntries().has(key) || communityCardFailedAt.has(key)) return false
    return null
}

// La ficha, DetailModal o el destacado acaban de leer la más votada de UN
// título: pasa también a las tarjetas. Sin esto, una tarjeta con la copia por
// lotes de antes del voto de otro usuario («sin votos», todavía fresca)
// seguía con la automática aunque la ficha ya enseñara la votada.
export function rememberCommunityCardArtwork({ type, id }, artwork) {
    if (typeof window === 'undefined' || !artwork || typeof artwork !== 'object') return
    const key = communityCardKey(type, id)
    if (!key) return
    const entries = loadCommunityCardEntries()
    const previous = entries.get(key)?.artwork
    entries.set(key, { artwork, at: Date.now() })
    communityCardFailedAt.delete(key)
    persistCommunityCardEntries()
    if (!sameArtwork(previous, artwork)) queueCardArtworkNotify()
}

function sameArtwork(a, b) {
    if (!a || !b) return a === b
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((kind) => a[kind] === b[kind])
}

// Votos propios retirados o nuevos (ver `retractOwnArtworkVotes` y
// `forgetCommunityArtwork`): las tarjetas del título se actualizan ya.
function retractCommunityCardVotes(key, votes) {
    const entry = communityCardEntries?.get(key)
    if (!entry) return
    const artwork = withoutArtworkVotes(entry.artwork, votes)
    if (artwork === entry.artwork) return
    communityCardEntries.set(key, { ...entry, artwork })
    persistCommunityCardEntries()
    queueCardArtworkNotify()
}

function forgetCommunityCardArtwork(key) {
    if (!communityCardEntries?.delete(key)) return
    communityCardFailedAt.delete(key)
    persistCommunityCardEntries()
    queueCardArtworkNotify()
}
