package com.theshowverse.sync

import android.app.Activity
import android.os.Build
import android.view.Display

/**
 * La app pide a la pantalla su frecuencia de refresco MÁS ALTA, como hace Chrome.
 *
 * EL PROBLEMA. En la PWA (que corre dentro de Chrome) las animaciones van a 90 o
 * 120 Hz: Chrome pide a la ventana el modo de pantalla de mayor frecuencia. Una
 * Activity con un WebView no pide nada y hereda lo que el sistema decida, que en
 * muchos móviles es 60 Hz, o alta frecuencia solo mientras el dedo toca la
 * pantalla. Todo lo que se anima sin tocar —transiciones, modales, la barra que
 * se compacta, el final de un desplazamiento— se pintaba a la mitad de
 * fotogramas, y la app entera se sentía más lenta que la PWA aunque la web es
 * exactamente la misma.
 *
 * LA REGLA. De los modos que ofrece la pantalla, el de mayor frecuencia con la
 * MISMA resolución que el actual: cambiar de resolución no es lo que se busca y
 * obligaría a reescalar la ventana.
 */
object FrecuenciaPantalla {

    /** Lo mínimo de `Display.Mode` para poder decidir (y probarlo sin Android). */
    data class Modo(val id: Int, val ancho: Int, val alto: Int, val hz: Float)

    /** El modo a pedir, o null si no hay ninguno con la resolución actual. */
    fun mejorModo(actual: Modo, disponibles: List<Modo>): Modo? =
        disponibles
            .filter { it.ancho == actual.ancho && it.alto == actual.alto }
            .maxByOrNull { it.hz }

    /**
     * Aplica el mejor modo a la ventana de [activity]. Se llama al crearla y al
     * volver a primer plano (en un plegable, por ejemplo, la pantalla puede haber
     * cambiado). Solo vale mientras la ventana está visible: el sistema vuelve a
     * su criterio en cuanto la app pasa a segundo plano.
     */
    fun pedirMaxima(activity: Activity) {
        val display = pantallaDe(activity) ?: return
        val actual = display.mode.aModo()
        val mejor = mejorModo(actual, display.supportedModes.map { it.aModo() }) ?: return
        val atributos = activity.window.attributes
        if (atributos.preferredDisplayModeId == mejor.id) return
        atributos.preferredDisplayModeId = mejor.id
        activity.window.attributes = atributos
    }

    /** Devuelve la frecuencia al criterio del sistema (diagnóstico de rendimiento). */
    fun soltar(activity: Activity) {
        val atributos = activity.window.attributes
        if (atributos.preferredDisplayModeId == 0) return
        atributos.preferredDisplayModeId = 0
        activity.window.attributes = atributos
    }

    private fun pantallaDe(activity: Activity): Display? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.display
        } else {
            @Suppress("DEPRECATION")
            activity.windowManager.defaultDisplay
        }

    private fun Display.Mode.aModo() = Modo(modeId, physicalWidth, physicalHeight, refreshRate)
}
