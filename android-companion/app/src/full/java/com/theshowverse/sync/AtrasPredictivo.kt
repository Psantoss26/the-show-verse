package com.theshowverse.sync

import android.graphics.Outline
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.animation.PathInterpolator
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback

/**
 * GESTO DE ATRÁS PREDICTIVO dentro de la web.
 *
 * EL PROBLEMA. En la PWA, Chrome acompaña el gesto de atrás con su propia
 * animación (la página se encoge y se desliza mientras el dedo avanza). En el
 * WebView no había nada: el callback de atrás estaba SIEMPRE activo, así que
 * Android tampoco podía enseñar su animación de «volver al inicio», y al
 * soltar la página cambiaba de golpe.
 *
 * LA SOLUCIÓN, la que pide Android para el atrás predictivo:
 *  - El callback solo está activo cuando la web tiene adónde volver (o hay un
 *    vídeo a pantalla completa). En la primera página queda inactivo y el
 *    sistema anima él solo la salida al inicio.
 *  - Mientras el dedo avanza, la web se encoge y se aparta del borde por el
 *    que entra el gesto, con las esquinas redondeadas (como la animación de
 *    Android entre actividades). Es solo una transformación de la vista: la
 *    compone el RenderThread sin volver a pintar la web.
 *  - Al soltar: `goBack()` y la web vuelve a su tamaño. Al cancelar, igual
 *    pero sin navegar.
 *
 * Lo que se ve detrás de la web encogida es [fondo] (negro), que solo se pinta
 * mientras dura el gesto: en reposo el WebView, opaco, cubre la ventana entera.
 *
 * COLOROS (OnePlus, Oppo). El sistema solo entrega el avance del gesto a las
 * apps de terceros con «Ajustes › Sistema y actualización › Navegación por el
 * sistema › Animaciones de deslizamiento (beta)» activado (y su opción para
 * apps de terceros, `secure oplus_third_part_apps_predictive_back=1`). Viene
 * apagado: entonces convierte el gesto en una tecla ATRÁS al soltar
 * (`QuickBackInputPolicy`, log «predictive settings is disabled»), solo llega
 * [handleOnBackPressed] y la web vuelve sin encogerse. No depende del
 * targetSdk (probado con 35 y 36 en Android 16) ni se puede forzar desde la app.
 */
class AtrasPredictivo(
    private val vista: View,
    private val fondo: ViewGroup,
    private val colorFondo: Int,
    private val puedeVolver: () -> Boolean,
    private val volver: () -> Unit,
    private val salir: () -> Unit,
) : OnBackPressedCallback(false) {

    private val densidad = vista.resources.displayMetrics.density
    private var radio = 0f

    init {
        vista.outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) {
                outline.setRoundRect(0, 0, view.width, view.height, radio)
            }
        }
    }

    /** Recalcula si el gesto es de la web o del sistema. Llamarlo tras navegar. */
    fun actualizar() {
        isEnabled = puedeVolver()
    }

    override fun handleOnBackStarted(backEvent: BackEventCompat) {
        vista.animate().cancel()
        fondo.setBackgroundColor(colorFondo)
        vista.clipToOutline = true
        aplicar(backEvent.progress, backEvent.swipeEdge)
    }

    override fun handleOnBackProgressed(backEvent: BackEventCompat) {
        aplicar(backEvent.progress, backEvent.swipeEdge)
    }

    override fun handleOnBackCancelled() {
        restaurar(DURACION_CANCELAR_MS)
    }

    override fun handleOnBackPressed() {
        if (puedeVolver()) volver() else salir()
        restaurar(DURACION_SOLTAR_MS)
        actualizar()
    }

    private fun aplicar(progreso: Float, borde: Int) {
        val t = Transformacion.para(
            progreso = INTERPOLADOR.getInterpolation(progreso.coerceIn(0f, 1f)),
            desdeIzquierda = borde == BackEventCompat.EDGE_LEFT,
            anchoPx = vista.width.toFloat(),
            densidad = densidad,
        )
        vista.scaleX = t.escala
        vista.scaleY = t.escala
        vista.translationX = t.desplazamientoX
        if (radio != t.radio) {
            radio = t.radio
            vista.invalidateOutline()
        }
    }

    private fun restaurar(duracionMs: Long) {
        vista.animate()
            .scaleX(1f).scaleY(1f).translationX(0f)
            .setDuration(duracionMs)
            .setInterpolator(INTERPOLADOR)
            .withEndAction {
                radio = 0f
                vista.invalidateOutline()
                vista.clipToOutline = false
                // En reposo nada que pintar debajo del WebView (ver arriba).
                fondo.background = null
            }
            .start()
    }

    /** La forma de la web según el avance del gesto. Puro, con pruebas. */
    data class Transformacion(val escala: Float, val desplazamientoX: Float, val radio: Float) {
        companion object {
            /** Encogimiento máximo: el 90 % del tamaño, como Android entre actividades. */
            const val ESCALA_MINIMA = 0.9f

            /** Lo que se aparta del borde del gesto, en dp, al llegar al final. */
            const val DESPLAZAMIENTO_DP = 24f

            /** Radio de las esquinas al final del gesto, en dp. */
            const val RADIO_DP = 28f

            fun para(progreso: Float, desdeIzquierda: Boolean, anchoPx: Float, densidad: Float): Transformacion {
                val p = progreso.coerceIn(0f, 1f)
                val escala = 1f - (1f - ESCALA_MINIMA) * p
                // La escala ya acerca el borde al centro (pivote en el centro);
                // el desplazamiento lo aleja más del borde por el que entra el dedo.
                val sentido = if (desdeIzquierda) 1f else -1f
                val desplazamiento = sentido * DESPLAZAMIENTO_DP * densidad * p
                val radio = RADIO_DP * densidad * minOf(1f, p * 4f)
                return Transformacion(escala, if (anchoPx > 0f) desplazamiento else 0f, radio)
            }
        }
    }

    private companion object {
        // Curva «emphasized decelerate» de Material 3: la de las transiciones
        // del sistema.
        val INTERPOLADOR = PathInterpolator(0.05f, 0.7f, 0.1f, 1f)
        const val DURACION_SOLTAR_MS = 250L
        const val DURACION_CANCELAR_MS = 200L
    }
}
