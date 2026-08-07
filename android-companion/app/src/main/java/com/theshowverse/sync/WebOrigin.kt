package com.theshowverse.sync

import java.net.URI

/**
 * Reglas de origen del shell web. TODO ES PURO y testeable: de aquí depende qué
 * se abre DENTRO de la app y qué se manda fuera, que es la decisión de seguridad
 * más importante de la carcasa (el puente JS solo existe para el origen propio).
 */
object WebOrigin {

    /**
     * Normaliza lo que escribe el usuario en los ajustes de servidor:
     * "theshowverse.com", "http://192.168.1.50:3000/", "HTTPS://X.com/ruta" →
     * "https://theshowverse.com", "http://192.168.1.50:3000", "https://x.com".
     *
     * Devuelve null si no es utilizable como origen (vacío, esquema que no es
     * http/https, sin host). Se queda solo con esquema+host+puerto: la ruta no
     * forma parte de un origen.
     */
    fun normalize(input: String?): String? {
        val raw = input?.trim().orEmpty()
        if (raw.isEmpty()) return null
        // Sin esquema se asume HTTPS: es lo que teclea cualquiera.
        val withScheme = if (raw.contains("://")) raw else "https://$raw"
        val uri = try {
            URI(withScheme)
        } catch (e: Exception) {
            return null
        }
        val scheme = uri.scheme?.lowercase() ?: return null
        if (scheme != "http" && scheme != "https") return null
        val host = uri.host?.lowercase()?.takeIf { it.isNotBlank() } ?: return null
        val port = uri.port
        val defaultPort = (scheme == "http" && port == 80) || (scheme == "https" && port == 443)
        return buildString {
            append(scheme).append("://").append(host)
            if (port > 0 && !defaultPort) append(':').append(port)
        }
    }

    /** Host de un origen ya normalizado (o de cualquier URL). */
    fun hostOf(url: String?): String? {
        if (url == null) return null
        return try {
            URI(url).host?.lowercase()
        } catch (e: Exception) {
            null
        }
    }

    /**
     * ¿[url] pertenece al origen [origin] y debe abrirse DENTRO de la app?
     *
     * Se comparan esquema, host y puerto. `www.` se trata como el mismo sitio:
     * un enlace compartido a www.theshowverse.com no debería salir al navegador.
     */
    fun isInternal(url: String?, origin: String?): Boolean {
        val target = try {
            URI(url ?: return false)
        } catch (e: Exception) {
            return false
        }
        val base = try {
            URI(normalize(origin) ?: return false)
        } catch (e: Exception) {
            return false
        }
        val targetScheme = target.scheme?.lowercase() ?: return false
        if (targetScheme != "http" && targetScheme != "https") return false
        if (targetScheme != base.scheme?.lowercase()) return false
        if (effectivePort(target) != effectivePort(base)) return false
        val targetHost = target.host?.lowercase() ?: return false
        val baseHost = base.host?.lowercase() ?: return false
        return canonicalHost(targetHost) == canonicalHost(baseHost)
    }

    /**
     * ¿Es un esquema que debe delegarse al sistema (tienda, correo, teléfono,
     * intent://…)? Todo lo que no sea http(s) sale de la app.
     */
    fun isExternalScheme(url: String?): Boolean {
        val scheme = try {
            URI(url ?: return false).scheme?.lowercase()
        } catch (e: Exception) {
            null
        } ?: return false
        return scheme != "http" && scheme != "https"
    }

    /**
     * URL con la que se autoriza el dispositivo cuando la web está tras el gate
     * de acceso privado. Devuelve null si no hay clave.
     */
    fun privateAccessUrl(origin: String?, key: String?): String? {
        val base = normalize(origin) ?: return null
        val clean = key?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return "$base/api/private-access?key=" + java.net.URLEncoder.encode(clean, "UTF-8")
    }

    private fun canonicalHost(host: String): String = host.removePrefix("www.")

    private fun effectivePort(uri: URI): Int {
        if (uri.port > 0) return uri.port
        return if (uri.scheme?.lowercase() == "http") 80 else 443
    }
}
