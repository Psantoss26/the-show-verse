package com.theshowverse.sync

import android.app.Activity
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.FrameMetrics
import android.view.Window
import android.view.accessibility.AccessibilityManager
import android.widget.TextView
import java.util.Locale

/**
 * DIAGNÓSTICO: medidor de fotogramas encima de la web.
 *
 * POR QUÉ EXISTE. La ficha va fluida en la PWA y a tirones en la app. La web es
 * la misma, así que la diferencia está en cómo pinta el WebView. Sin un móvil
 * conectado no se puede grabar una traza, y "parece que va mejor" no sirve para
 * comparar ajustes. Esto da un número en la propia pantalla: se activa un ajuste
 * en Rendimiento, se abre la misma ficha, se hace el mismo scroll y se compara.
 *
 * QUÉ MIDE. Los fotogramas que pinta la ventana de la app (FrameMetrics). En un
 * WebView cada fotograma de la web pasa por ahí, así que un tirón de la web es un
 * hueco entre dos fotogramas. Mide la ventana entera, no solo la web: el propio
 * medidor pinta un fotograma por segundo al actualizarse, que no altera el
 * resultado.
 */
class MedidorFotogramas(private val activity: Activity, private val salida: TextView) {

    private val principal = Handler(Looper.getMainLooper())
    private var hilo: HandlerThread? = null
    private var escucha: Window.OnFrameMetricsAvailableListener? = null

    /** Lo pide el hilo principal; lo aplica el del medidor en su siguiente fotograma. */
    @Volatile
    private var reiniciarPagina = false

    fun arrancar() {
        if (escucha != null) return
        val periodo = periodoActual()
        val segundo = ContadorFotogramas(periodo)
        val pagina = ContadorFotogramas(periodo)
        var inicioVentana = 0L

        val nuevo = HandlerThread("tsv-medidor").also { it.start() }
        val l = Window.OnFrameMetricsAvailableListener { _, metricas, _ ->
            val vsync = metricas.getMetric(FrameMetrics.INTENDED_VSYNC_TIMESTAMP)
            val total = metricas.getMetric(FrameMetrics.TOTAL_DURATION)
            if (reiniciarPagina) {
                reiniciarPagina = false
                pagina.reiniciar()
            }
            segundo.registrar(vsync, total)
            pagina.registrar(vsync, total)
            if (inicioVentana == 0L) inicioVentana = vsync
            if (vsync - inicioVentana >= UN_SEGUNDO_NS) {
                val texto = texto(segundo, pagina)
                segundo.reiniciar()
                inicioVentana = vsync
                // La frecuencia puede cambiar con la app abierta (ajuste de
                // frecuencia máxima, ahorro de batería): se relee cada segundo.
                val p = periodoActual()
                segundo.periodoNs = p
                pagina.periodoNs = p
                principal.post { salida.text = texto }
            }
        }
        activity.window.addOnFrameMetricsAvailableListener(l, Handler(nuevo.looper))
        hilo = nuevo
        escucha = l
        salida.text = activity.getString(R.string.perf_meter_waiting)
    }

    fun parar() {
        escucha?.let { activity.window.removeOnFrameMetricsAvailableListener(it) }
        escucha = null
        hilo?.quitSafely()
        hilo = null
    }

    /** Página nueva: el resumen "página" vuelve a empezar. */
    fun nuevaPagina() {
        reiniciarPagina = true
    }

    private fun texto(segundo: ContadorFotogramas, pagina: ContadorFotogramas): String {
        val hz = Math.round(1e9 / segundo.periodoNs)
        val a11y = (activity.getSystemService(AccessibilityManager::class.java))?.isEnabled == true
        return String.format(
            Locale.ROOT,
            "%d Hz · 1 s: %d%% · peor %d ms\npágina: %d%% · %d perdidos%s",
            hz,
            segundo.fluidez(),
            segundo.peorNs / 1_000_000L,
            pagina.fluidez(),
            pagina.perdidos,
            if (a11y) " · a11y ON" else "",
        )
    }

    private fun periodoActual(): Long {
        val pantalla = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.display
        } else {
            @Suppress("DEPRECATION")
            activity.windowManager.defaultDisplay
        }
        val hz = pantalla?.refreshRate?.takeIf { it > 1f } ?: 60f
        return (1e9 / hz).toLong()
    }

    private companion object {
        const val UN_SEGUNDO_NS = 1_000_000_000L
    }
}

/**
 * Cuenta fotogramas entregados y perdidos a partir del vsync previsto de cada
 * uno. Aparte y sin Android para poder probarlo.
 *
 * Un hueco de N periodos entre dos fotogramas son N-1 perdidos. Un hueco mayor
 * que [PAUSA_NS] no cuenta: es la página quieta, sin nada que pintar.
 */
class ContadorFotogramas(@Volatile var periodoNs: Long) {
    var entregados = 0
        private set
    var perdidos = 0
        private set
    var peorNs = 0L
        private set
    private var ultimoVsync = -1L

    fun registrar(vsyncNs: Long, totalNs: Long) {
        entregados++
        if (totalNs > peorNs) peorNs = totalNs
        if (ultimoVsync >= 0) {
            val hueco = vsyncNs - ultimoVsync
            if (hueco in 1 until PAUSA_NS) {
                val periodos = ((hueco + periodoNs / 2) / periodoNs).toInt()
                if (periodos > 1) perdidos += periodos - 1
            }
        }
        ultimoVsync = vsyncNs
    }

    /** Porcentaje de fotogramas que llegaron mientras había movimiento. */
    fun fluidez(): Int {
        val esperados = entregados + perdidos
        return if (esperados == 0) 100 else 100 * entregados / esperados
    }

    fun reiniciar() {
        entregados = 0
        perdidos = 0
        peorNs = 0L
        ultimoVsync = -1L
    }

    companion object {
        /** Más de esto sin fotogramas es reposo, no un tirón. */
        const val PAUSA_NS = 400_000_000L
    }
}
