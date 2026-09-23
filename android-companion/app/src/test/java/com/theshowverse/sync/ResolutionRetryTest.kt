package com.theshowverse.sync

import org.junit.Assert.*
import org.junit.Test

class ResolutionRetryTest {
    @Test fun failuresRetryAfterBackoffWithoutConcurrentRequests() {
        val retry = ResolutionRetry()
        val ticket = retry.begin("app", "episode1", 0)!!
        assertNull(retry.begin("app", "episode1", 10))
        assertTrue(retry.finish("app", ticket, false, 20))
        assertNull(retry.begin("app", "episode1", 1000))
        assertNotNull(retry.begin("app", "episode1", 5020))
    }
    @Test fun lateCallbacksCannotReplaceTheNewEpisode() {
        val retry = ResolutionRetry()
        val old = retry.begin("app", "episode1", 0)!!
        val next = retry.begin("app", "episode2", 10)!!
        assertFalse(retry.finish("app", old, true, 20))
        assertTrue(retry.finish("app", next, true, 20))
        assertNull(retry.begin("app", "episode2", 30))
    }
    @Test fun onlyTransientFailuresAreWorthQueueingForLater() {
        val retry = ResolutionRetry()
        // Sin red: el mismo envío puede salir bien más tarde, así que se guarda.
        val offline = retry.begin("app", "episode1", 0)!!
        retry.finish("app", offline, false, 10)
        assertTrue(retry.needsRecovery("app"))

        // El servidor contesta que no sabe qué título es: reenviar lo mismo va a
        // fallar igual y solo llenaría la cola de eventos condenados.
        val unknown = retry.begin("app", "episode1", 60_000)!!
        retry.finish("app", unknown, false, 60_010, unresolvable = true)
        assertFalse(retry.needsRecovery("app"))
    }

    @Test fun pauseInvalidatesCallbacksEvenWhenSameEpisodeResumes() {
        val retry = ResolutionRetry()
        val old = retry.begin("app", "episode", 0)!!
        retry.forget("app")
        retry.begin("app", "episode", 10)
        assertFalse(retry.accepts("app", old))
    }
}
