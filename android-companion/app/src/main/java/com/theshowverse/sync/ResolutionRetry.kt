package com.theshowverse.sync

/** Main-thread state: a failed request is retryable, a stale callback is inert. */
class ResolutionRetry {
    data class Ticket(val key: String, val generation: Long)
    private data class State(
        val ticket: Ticket,
        var inFlight: Boolean = false,
        var failures: Int = 0,
        var retryAt: Long = 0,
        var resolved: Boolean = false,
        // El último fallo fue "no sé qué título es esto" (404/422), no un problema
        // de red ni del servidor. Ver `needsRecovery`.
        var unresolvable: Boolean = false,
    )
    private val states = mutableMapOf<String, State>()
    private var generation = 0L
    fun begin(pkg: String, key: String, now: Long): Ticket? {
        val state = states[pkg]?.takeIf { it.ticket.key == key }
            ?: State(Ticket(key, ++generation)).also { states[pkg] = it }
        if (state.inFlight || state.resolved || now < state.retryAt) return null
        state.inFlight = true
        return state.ticket
    }
    fun accepts(pkg: String, ticket: Ticket): Boolean = states[pkg]?.ticket == ticket
    fun finish(
        pkg: String,
        ticket: Ticket,
        success: Boolean,
        now: Long,
        unresolvable: Boolean = false,
    ): Boolean {
        val state = states[pkg]?.takeIf { it.ticket == ticket } ?: return false
        state.inFlight = false
        state.resolved = success
        state.unresolvable = !success && unresolvable
        if (!success) {
            state.retryAt = now + minOf(300_000L, 5_000L * (1L shl minOf(state.failures++, 6)))
        }
        return true
    }

    /**
     * ¿Merece la pena guardar una observación de este paquete para reintentarla
     * cuando vuelva la conexión?
     *
     * Solo si el fallo fue transitorio —sin red, servidor caído—. Si el servidor
     * respondió que NO SABE identificar el título, reenviar exactamente los mismos
     * datos más tarde va a fallar igual: lo único que se conseguía era llenar la
     * cola de eventos condenados (uno nuevo cada 30 s mientras durase la
     * reproducción) que retrasaban la entrega de todo lo demás.
     */
    fun needsRecovery(pkg: String): Boolean {
        val state = states[pkg] ?: return false
        return state.failures > 0 && !state.unresolvable
    }
    fun forget(pkg: String) { states.remove(pkg) }
    fun clear() { states.clear() }
}
