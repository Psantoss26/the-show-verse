package com.theshowverse.sync

/** Main-thread state: a failed request is retryable, a stale callback is inert. */
class ResolutionRetry {
    data class Ticket(val key: String, val generation: Long)
    private data class State(val ticket: Ticket, var inFlight: Boolean = false, var failures: Int = 0, var retryAt: Long = 0, var resolved: Boolean = false)
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
    fun finish(pkg: String, ticket: Ticket, success: Boolean, now: Long): Boolean {
        val state = states[pkg]?.takeIf { it.ticket == ticket } ?: return false
        state.inFlight = false
        state.resolved = success
        if (!success) {
            state.retryAt = now + minOf(300_000L, 5_000L * (1L shl minOf(state.failures++, 6)))
        }
        return true
    }
    fun needsRecovery(pkg: String): Boolean = (states[pkg]?.failures ?: 0) > 0
    fun forget(pkg: String) { states.remove(pkg) }
    fun clear() { states.clear() }
}
