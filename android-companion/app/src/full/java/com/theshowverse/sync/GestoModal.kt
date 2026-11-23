package com.theshowverse.sync

import java.util.Locale

/**
 * El gesto de atrás con un MODAL de la web abierto. La app no anima la página
 * (ver [AtrasPredictivo]): le pasa el gesto a la web, que mueve solo el panel
 * del modal (src/lib/navigation/modalBackGesture.js). Al soltar, el
 * `popstate` cierra el modal con su salida.
 */
object GestoModal {

    enum class Fase(val web: String) {
        INICIO("start"),
        PROGRESO("progress"),
        CANCELAR("cancel"),
        SOLTAR("end"),
    }

    /** JS que avisa a la web. El número va con punto aunque el idioma use coma. */
    fun js(fase: Fase, progreso: Float, desdeIzquierda: Boolean): String {
        val p = String.format(Locale.ROOT, "%s", progreso.coerceIn(0f, 1f))
        return "window.__svModalBackGesture&&window.__svModalBackGesture('${fase.web}',$p,$desdeIzquierda)"
    }
}
