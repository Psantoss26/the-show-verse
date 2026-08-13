// /src/lib/network/accessScope.js

// ¿Se está entrando DESDE LA RED DEL SERVIDOR o desde fuera (túnel Cloudflare,
// datos móviles, wifi ajeno)?
//
// El criterio es el HOST con el que se ha cargado la web, NO la red física del
// dispositivo. Es deliberado: lo que encarece una petición es que salga y
// vuelva por el túnel del NAS, y eso lo decide el nombre por el que se entra.
// Abrir theshowverse.com estando en casa cuesta lo mismo que abrirlo desde
// fuera, así que aquí cuenta como externo -- que es lo que interesa para
// decidir si merece la pena una ida y vuelta extra.
//
// La ventaja frente a mirar la IP del cliente en el servidor es que esto se
// resuelve en el navegador sin ninguna petición previa, así que puede decidirse
// antes del primer pintado.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

// mDNS (`.local`) y sufijos habituales de router doméstico. El punto inicial
// obliga a que sea una etiqueta entera: `nas.locality` no es una red local.
const LOCAL_SUFFIX_RE = /\.(?:local|lan|home|internal|localdomain)$/

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function stripPort(host) {
    // Una IPv6 sin corchetes lleva varios `:`, así que ahí no hay puerto que
    // recortar: `::1` no puede confundirse con "host:1".
    if ((host.match(/:/g) || []).length > 1) return host
    return host.replace(/:\d+$/, '')
}

function normalizeHost(hostname) {
    const host = String(hostname ?? '')
        .trim()
        .toLowerCase()
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .replace(/\.$/, '') // FQDN con punto final
    return stripPort(host)
}

function isPrivateIPv4(host) {
    const match = IPV4_RE.exec(host)
    if (!match) return false

    const octets = match.slice(1).map(Number)
    if (octets.some((octet) => octet > 255)) return false

    const [a, b] = octets
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // loopback
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 169 && b === 254) return true // link-local
    return false
}

function isPrivateIPv6(host) {
    if (host === '::1') return true
    // Unique local (fc00::/7) y link-local (fe80::/10).
    return /^f[cd][0-9a-f]{0,2}:/.test(host) || /^fe[89ab][0-9a-f]*:/.test(host)
}

// Mismo criterio de patrón que el gate de acceso privado del middleware:
// `*.ejemplo.com` casa cualquier subdominio, pero no el dominio desnudo.
function hostMatches(host, pattern) {
    if (!host || !pattern) return false
    if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1))
    return host === pattern
}

export function parseHostPatterns(value) {
    return String(value || '')
        .split(',')
        .map((pattern) => normalizeHost(pattern))
        .filter(Boolean)
}

// Hosts ADICIONALES que deben tratarse como red del servidor, para montajes que
// no encajan en los rangos privados (un dominio propio resuelto por DNS interno,
// por ejemplo). Va en `NEXT_PUBLIC_` porque la decisión se toma en el navegador.
export function configuredLocalHosts() {
    return parseHostPatterns(process.env.NEXT_PUBLIC_SHOWVERSE_LOCAL_HOSTS)
}

export function isLocalServerHost(hostname, extraPatterns) {
    const host = normalizeHost(hostname)
    if (!host) return false

    if (LOOPBACK_HOSTS.has(host)) return true
    if (isPrivateIPv4(host)) return true
    if (isPrivateIPv6(host)) return true
    if (LOCAL_SUFFIX_RE.test(host)) return true

    const patterns = extraPatterns || configuredLocalHosts()
    return patterns.some((pattern) => hostMatches(host, pattern))
}

// `false` cuando no hay forma de saberlo (render de servidor sin host explícito):
// ante la duda NO se apaga nada.
export function isExternalNetworkAccess({ hostname, localHosts } = {}) {
    const host =
        hostname ?? (typeof window !== 'undefined' ? window.location?.hostname : null)
    if (!host) return false
    return !isLocalServerHost(host, localHosts)
}
