package com.theshowverse.sync

import android.app.Activity
import android.os.Build
import android.view.Display

/**
 * La app pide a la pantalla su frecuencia ALTA: 120 Hz si los tiene.
 *
 * EL PROBLEMA. Una Activity con un WebView no pide nada y hereda lo que el
 * sistema decida, que en muchos móviles es 60 Hz, o alta frecuencia solo
 * mientras el dedo toca la pantalla: todo lo que se anima sin tocar
 * —transiciones, modales, la barra que se compacta, el final de un
 * desplazamiento— se pintaba a la mitad de fotogramas.
 *
 * POR QUÉ 120 Y NO MÁS. Es la frecuencia alta de casi todos los móviles, y en
 * los de 144/165 Hz (un OnePlus de 165 Hz, por ejemplo) pasar de 120 gasta
 * batería sin que se note. A 120 Hz el WebView tiene 8,3 ms por fotograma. El
 * liquid glass de la web difumina lo de detrás en cada fotograma del scroll, y
 * en las fichas no cabía: 6-8 % de fotogramas tarde, frente al 2-3 % a 90 Hz.
 * El exceso venía de un SEGUNDO desenfoque anidado en cada pieza (el canto,
 * `.sv-glass-rim`), que dentro del cristal solo reprocesa el propio cristal
 * y apenas se ve; la web lo quita en la app (globals.css) y a 120 Hz quedan
 * 1,6-2,2 % (medido con timestats en /details/movie/550).
 *
 * LA REGLA. De los modos con la MISMA resolución que el actual (cambiar de
 * resolución no es lo que se busca y obligaría a reescalar la ventana), el más
 * alto que no pase de [TOPE_HZ]. Si todos pasan, el más alto.
 */
object FrecuenciaPantalla {

    /** Lo mínimo de `Display.Mode` para poder decidir (y probarlo sin Android). */
    data class Modo(val id: Int, val ancho: Int, val alto: Int, val hz: Float)

    /** La frecuencia más alta que se pide aunque la pantalla dé más. */
    const val TOPE_HZ = 120f

    /** El modo a pedir, o null si no hay ninguno con la resolución actual. */
    fun mejorModo(actual: Modo, disponibles: List<Modo>): Modo? {
        val mismos = disponibles.filter { it.ancho == actual.ancho && it.alto == actual.alto }
        return mismos.filter { it.hz <= TOPE_HZ + 1f }.maxByOrNull { it.hz }
            ?: mismos.maxByOrNull { it.hz }
    }

    /**
     * Aplica ese modo a la ventana de [activity]. Se llama al crearla y al
     * volver a primer plano (en un plegable, por ejemplo, la pantalla puede haber
     * cambiado). Solo vale mientras la ventana está visible: el sistema vuelve a
     * su criterio en cuanto la app pasa a segundo plano.
     */
    fun pedirFluida(activity: Activity) {
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
