package com.theshowverse.sync

import android.content.Context
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Encrypted durable outbox. Network I/O is never performed under the storage lock. */
object ProgressOutbox {
    private const val WORK = "streaming-progress-delivery"
    private const val PERIODIC = "streaming-progress-recovery"
    private val storageLock = Any()
    internal val deliveryLock = Any()

    private fun owner(origin: String, token: String): String =
        MessageDigest.getInstance("SHA-256").digest("$origin|$token".toByteArray())
            .joinToString("") { "%02x".format(it) }
    private fun read(prefs: Prefs): JSONArray = JSONArray(prefs.pendingProgress ?: "[]")

    fun enqueue(context: Context, origin: String, token: String, payload: JSONObject) {
        val prefs = Prefs(context)
        synchronized(storageLock) {
            if (prefs.paused || prefs.origin != origin || prefs.token != token) return
            val entries = read(prefs)
            check(entries.length() < 1000) { "Cola llena: revisa la conexión en el panel de sincronización" }
            payload.put("eventId", UUID.randomUUID().toString())
            payload.put("observedAt", Instant.now().toString())
            entries.put(JSONObject().put("owner", owner(origin, token)).put("payload", payload))
            check(prefs.savePendingProgress(entries.toString())) { "No se pudo guardar el progreso" }
        }
        schedule(context)
    }
    fun pendingCount(context: Context): Int = synchronized(storageLock) { read(Prefs(context)).length() }
    internal fun first(prefs: Prefs): JSONObject? = synchronized(storageLock) {
        val entries = read(prefs)
        val origin = prefs.origin ?: return@synchronized null
        val token = prefs.token ?: return@synchronized null
        val expected = owner(origin, token)
        val retained = JSONArray()
        for (i in 0 until entries.length()) {
            val entry = entries.getJSONObject(i)
            if (entry.optString("owner") == expected) retained.put(entry)
        }
        if (retained.length() != entries.length()) prefs.savePendingProgress(retained.toString())
        retained.optJSONObject(0)
    }
    internal fun remove(prefs: Prefs, eventId: String) = synchronized(storageLock) {
        val entries = read(prefs)
        val remaining = JSONArray()
        for (i in 0 until entries.length()) {
            val entry = entries.getJSONObject(i)
            if (entry.getJSONObject("payload").optString("eventId") != eventId) remaining.put(entry)
        }
        check(prefs.savePendingProgress(remaining.toString()))
    }
    /**
     * Manda un evento al FINAL de la cola.
     *
     * La entrega iba siempre por el primero, y al volver con `retry` lo dejaba
     * donde estaba: un título que el servidor no sabe identificar se quedaba de
     * tapón y nada de lo que hubiera detrás salía. Como además se vuelve a encolar
     * una observación de ese mismo título cada 30 s mientras se reproduce, la cola
     * se llenaba de tapones más rápido de lo que se vaciaba y dejaba de sincronizar
     * TODO, incluido el progreso de otras películas que sí se habían resuelto.
     *
     * Reordenar es seguro: el servidor deduplica por `eventId` e ignora los puntos
     * anteriores al último confirmado de ese contenido (`observedAt`), así que el
     * orden de ENTREGA no altera el resultado.
     */
    internal fun rotate(prefs: Prefs, eventId: String) = synchronized(storageLock) {
        val entries = read(prefs)
        val reordered = JSONArray()
        var moved: JSONObject? = null
        for (i in 0 until entries.length()) {
            val entry = entries.getJSONObject(i)
            if (entry.getJSONObject("payload").optString("eventId") == eventId) moved = entry
            else reordered.put(entry)
        }
        if (moved != null) reordered.put(moved)
        check(prefs.savePendingProgress(reordered.toString()))
    }
    internal fun resolutionFailure(prefs: Prefs, eventId: String): Int = synchronized(storageLock) {
        val entries = read(prefs)
        var attempts = 0
        for (i in 0 until entries.length()) {
            val entry = entries.getJSONObject(i)
            if (entry.getJSONObject("payload").optString("eventId") == eventId) {
                attempts = entry.optInt("resolutionFailures") + 1
                entry.put("resolutionFailures", attempts)
            }
        }
        check(prefs.savePendingProgress(entries.toString()))
        attempts
    }
    fun schedule(context: Context) {
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val manager = WorkManager.getInstance(context.applicationContext)
        manager.enqueueUniqueWork(WORK, ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<ProgressWorker>().setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS).build())
        // Recovery after reboot/process death, including an enqueue at the end of a running worker.
        manager.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<ProgressWorker>(15, TimeUnit.MINUTES).setConstraints(constraints).build())
    }
}

class ProgressWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = synchronized(ProgressOutbox.deliveryLock) {
        val prefs = Prefs(applicationContext)
        // Eventos ya intentados EN ESTA PASADA. Los que no se pueden entregar
        // todavía se mandan al final de la cola en vez de bloquearla, así que
        // reencontrarse con uno ya intentado significa haber dado la vuelta
        // entera: no queda nada entregable ahora y se reintenta más tarde.
        val attempted = HashSet<String>()
        repeat(20) {
            if (isStopped || prefs.paused || !prefs.isPaired()) return@synchronized Result.success()
            val origin = prefs.origin ?: return@synchronized Result.success()
            val token = prefs.token ?: return@synchronized Result.success()
            val entry = ProgressOutbox.first(prefs) ?: return@synchronized Result.success()
            val payload = entry.getJSONObject("payload")
            val eventId = payload.getString("eventId")
            if (!attempted.add(eventId)) return@synchronized Result.retry()
            val response = try { SyncClient.deliver(origin, token, payload) }
                catch (_: Exception) { return@synchronized Result.retry() }
            if (prefs.origin != origin || prefs.token != token) return@synchronized Result.success()
            if (response.status in 200..299 && response.valid) {
                ProgressOutbox.remove(prefs, eventId)
                if (response.completed) prefs.addLog("✓ Visionado confirmado: ${payload.optString("title", payload.optString("mainTitle"))}")
            } else if (response.status in listOf(400, 404, 410, 413, 422)) {
                if (response.status in listOf(404, 422) &&
                    ProgressOutbox.resolutionFailure(prefs, eventId) < 3) {
                    // "No sé qué título es esto" es un problema de ESTE evento, no
                    // de la conexión: se le deja otra oportunidad más tarde, pero
                    // al final de la cola, para que los demás salgan ya.
                    ProgressOutbox.rotate(prefs, eventId)
                    return@repeat
                }
                // A malformed/unresolvable observation must not block all later episodes.
                prefs.addLog("No se pudo sincronizar un evento (HTTP ${response.status}).")
                ProgressOutbox.remove(prefs, eventId)
            } else {
                if (response.status == 401 || response.status == 403) {
                    prefs.addLog("Vinculación caducada o revocada: vuelve a vincular la app.")
                    return@synchronized Result.success()
                }
                return@synchronized Result.retry()
            }
        }
        Result.retry()
    }
}
