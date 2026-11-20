package com.theshowverse.sync

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.graphics.Outline
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.Window
import android.view.animation.PathInterpolator
import android.widget.ImageView
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback

/**
 * GESTO DE ATRÁS PREDICTIVO dentro de la web, con transición entre páginas.
 *
 * EL PROBLEMA. `goBack()` no cambia la página en el acto: Next procesa el
 * `popstate` y tarda unos fotogramas en pintar la anterior (con las fichas
 * superpuestas, en revelar la pantalla que tenía oculta). Lo que se veía al
 * soltar el gesto era un cambio de golpe y, cuando se animaba la web enseguida,
 * debajo seguía la misma ficha duplicada o un estado intermedio que parpadeaba.
 *
 * LA SOLUCIÓN, en tres fases:
 *
 *  1. MIENTRAS EL DEDO AVANZA (si el sistema entrega el avance): la web se
 *     encoge, se aparta del borde por el que entra el gesto, sigue un poco al
 *     dedo en vertical y redondea las esquinas, como la animación de Android
 *     entre actividades. Antes de tocar nada se hace una CAPTURA de la página
 *     tal cual se ve (PixelCopy, asíncrona y sin volver a pintar la web): la
 *     transformación solo empieza cuando la captura está lista.
 *
 *  2. AL SOLTAR (o al pulsar ATRÁS sin gesto, capturando en ese momento): la
 *     captura empieza a salir EN EL ACTO, deslizándose hacia el lado contrario
 *     al borde del gesto, sin esperar a la web. Debajo, un velo opaco tapa la
 *     web, que vuelve a su tamaño y navega atrás sin que se vea.
 *
 *  3. Cuando la web avisa de que la página anterior ya está pintada
 *     ([paginaPintada], desde src/components/android/AndroidBackPaintSignal.jsx)
 *     y ese pintado llega a pantalla ([confirmarPintado]), el velo se desvanece
 *     y la página aparece entera y ESTÁTICA. Con una web que no avisa se espera
 *     poco; con una que sí, como mucho [ESPERA_MAX_MS]. Normalmente ocurre
 *     mientras la captura aún está saliendo.
 *
 * Al cancelar, la web vuelve a su sitio sin navegar. Si la captura falla, se
 * navega igual y la web vuelve a su tamaño.
 *
 * Lo que se ve detrás es [fondo] (negro), que solo se pinta mientras dura el
 * gesto: en reposo el WebView, opaco, cubre la ventana entera.
 *
 * COLOROS (OnePlus, Oppo). El sistema solo entrega el avance del gesto a las
 * apps de terceros con «Ajustes › Sistema y actualización › Navegación por el
 * sistema › Animaciones de deslizamiento (beta)» activado (y su opción para
 * apps de terceros, `secure oplus_third_part_apps_predictive_back=1`). Viene
 * apagado: entonces convierte el gesto en una tecla ATRÁS al soltar
 * (`QuickBackInputPolicy`) y solo llega [handleOnBackPressed]. Las fases 2 y 3
 * se hacen igual; solo falta el encogido mientras se arrastra, que no se puede
 * forzar desde la app.
 */
class AtrasPredictivo(
    private val ventana: Window,
    private val vista: View,
    private val fondo: ViewGroup,
    private val colorFondo: Int,
    private val puedeVolver: () -> Boolean,
    /** Falso con un vídeo a pantalla completa: ahí no hay página que animar. */
    private val animable: () -> Boolean,
    /** Llama a `listo` cuando lo que la web acaba de pintar llega a pantalla. */
    private val confirmarPintado: (listo: () -> Unit) -> Unit,
    private val volver: () -> Unit,
    private val salir: () -> Unit,
) : OnBackPressedCallback(false) {

    private val densidad = vista.resources.displayMetrics.density
    private val principal = Handler(Looper.getMainLooper())

    private val esquinasWeb = Esquinas(vista)

    /** Tapa la web mientras pinta la página anterior. Encima de la web, debajo de la captura. */
    private val velo = View(vista.context).apply {
        setBackgroundColor(colorFondo)
        visibility = View.GONE
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    /** La página que se va, congelada. */
    private val capturaVista = ImageView(vista.context).apply {
        scaleType = ImageView.ScaleType.FIT_XY
        visibility = View.GONE
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    private val esquinasCaptura = Esquinas(capturaVista)

    init {
        // Justo encima de la web y por debajo de lo demás (medidor, vídeo, error).
        val indice = fondo.indexOfChild(vista) + 1
        val tamano = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        fondo.addView(velo, indice, tamano)
        fondo.addView(capturaVista, indice + 1, tamano)
    }

    // ------------------------------------------------------------ estado

    /** Captura de la página actual sin transformar, lista para usar. */
    private var captura: Bitmap? = null

    /** Bitmap de una transición anterior, para no reservar 10 MB cada vez. */
    private var reutilizable: Bitmap? = null

    private var capturando = false
    private var alCapturar: (() -> Unit)? = null

    /** Hay un gesto en curso (llegó handleOnBackStarted). */
    private var enGesto = false
    private var progreso = 0f
    private var desdeIzquierda = true
    private var yInicial = 0f
    private var deltaY = 0f

    /** Pulsación sin gesto esperando a su captura: las repetidas se ignoran. */
    private var pendiente = false

    /** Transición en marcha (fases 2 y 3): la captura que la ocupa. */
    private var enTransicion: Bitmap? = null

    /** El velo sigue puesto: esperando a que la web pinte la página anterior. */
    private var esperandoPagina = false
    private val tiempoAgotado = Runnable { revelarPagina() }

    /** La web ha avisado alguna vez: manda [paginaPintada] y vale la pena esperarla. */
    private var webAvisa = false

    private var animador: ValueAnimator? = null

    /** Recalcula si el gesto es de la web o del sistema. Llamarlo tras navegar. */
    fun actualizar() {
        isEnabled = puedeVolver()
    }

    /**
     * La web avisa de que la página a la que se volvió ya está pintada (también
     * al cargar cada documento, que es como se sabe que esta web avisa).
     */
    fun paginaPintada() {
        webAvisa = true
        if (!esperandoPagina) return
        confirmarPintado { revelarPagina() }
    }

    // ------------------------------------------------------------ callback

    override fun handleOnBackStarted(backEvent: BackEventCompat) {
        if (!animable()) return
        terminarTransicion()
        vista.animate().cancel()
        enGesto = true
        progreso = backEvent.progress
        desdeIzquierda = backEvent.swipeEdge != BackEventCompat.EDGE_RIGHT
        yInicial = backEvent.touchY
        deltaY = 0f
        captura = null
        // Solo se captura una web en reposo: si aún volvía de un gesto
        // cancelado, la captura saldría encogida y se quedaría sin ella.
        if (vista.scaleX == 1f && vista.translationX == 0f && vista.translationY == 0f) {
            capturar { aplicarGesto() }
        }
        fondo.setBackgroundColor(colorFondo)
        vista.clipToOutline = true
        aplicarGesto()
    }

    override fun handleOnBackProgressed(backEvent: BackEventCompat) {
        if (!enGesto) return
        progreso = backEvent.progress
        deltaY = backEvent.touchY - yInicial
        aplicarGesto()
    }

    override fun handleOnBackCancelled() {
        if (!enGesto) return
        enGesto = false
        alCapturar = null
        captura?.let { reutilizable = it }
        captura = null
        restaurar(DURACION_CANCELAR_MS)
    }

    override fun handleOnBackPressed() {
        val conGesto = enGesto
        enGesto = false

        if (!animable() || !puedeVolver()) {
            if (puedeVolver()) volver() else salir()
            if (conGesto) restaurar(DURACION_SOLTAR_MS)
            actualizar()
            return
        }

        if (conGesto) {
            when {
                captura != null -> transicion(transformacionGesto())
                // La web aún no se ha movido (espera a la captura): sale desde reposo.
                capturando -> alCapturar = {
                    if (captura != null) transicion(Transformacion.REPOSO) else sinCaptura()
                }
                else -> sinCaptura()
            }
            return
        }

        // Sin avance del gesto (tecla ATRÁS, tres botones, ColorOS): se captura
        // ahora y se anima la vuelta igualmente.
        if (pendiente) return
        terminarTransicion()
        vista.animate().cancel()
        if (vista.scaleX != 1f || vista.translationX != 0f) {
            sinCaptura()
            return
        }
        pendiente = true
        desdeIzquierda = true
        capturar {
            pendiente = false
            if (captura != null) transicion(Transformacion.REPOSO) else sinCaptura()
        }
    }

    // ------------------------------------------------------------ fase 1

    private fun transformacionGesto() = Transformacion.para(
        progreso = INTERPOLADOR_GESTO.getInterpolation(progreso.coerceIn(0f, 1f)),
        desdeIzquierda = desdeIzquierda,
        anchoPx = vista.width.toFloat(),
        densidad = densidad,
        deltaYPx = deltaY,
        altoPx = vista.height.toFloat(),
    )

    private fun aplicarGesto() {
        // Hasta tener la captura la web no se mueve (ver arriba): es un
        // fotograma o dos, al principio del gesto, cuando apenas se nota.
        if (capturando || !enGesto) return
        poner(vista, esquinasWeb, transformacionGesto())
    }

    private fun capturar(listo: () -> Unit) {
        val ancho = vista.width
        val alto = vista.height
        if (ancho <= 0 || alto <= 0 || !vista.isAttachedToWindow) {
            captura = null
            listo()
            return
        }
        val bitmap = reutilizable?.takeIf { it.width == ancho && it.height == alto && !it.isRecycled }
            ?: Bitmap.createBitmap(ancho, alto, Bitmap.Config.ARGB_8888)
        reutilizable = null
        val origen = IntArray(2).also { vista.getLocationInWindow(it) }
        val zona = Rect(origen[0], origen[1], origen[0] + ancho, origen[1] + alto)
        capturando = true
        try {
            PixelCopy.request(ventana, zona, bitmap, { resultado ->
                capturando = false
                if (resultado == PixelCopy.SUCCESS) {
                    captura = bitmap
                } else {
                    captura = null
                    reutilizable = bitmap
                }
                listo()
                alCapturar?.let { alCapturar = null; it() }
            }, principal)
        } catch (e: IllegalArgumentException) {
            // Ventana sin superficie (se está cerrando): sin captura.
            capturando = false
            captura = null
            reutilizable = bitmap
            listo()
        }
    }

    // ------------------------------------------------------------ fase 2

    private fun transicion(inicio: Transformacion) {
        val bitmap = captura ?: return sinCaptura()
        captura = null
        enTransicion = bitmap

        // La captura, donde estaba la web; debajo, el velo tapa la web entera,
        // que vuelve a su tamaño (no hace falta repintarla) y navega atrás.
        fondo.setBackgroundColor(colorFondo)
        capturaVista.setImageBitmap(bitmap)
        capturaVista.clipToOutline = true
        poner(capturaVista, esquinasCaptura, inicio)
        capturaVista.visibility = View.VISIBLE
        velo.animate().cancel()
        velo.alpha = 1f
        velo.visibility = View.VISIBLE
        quitarTransformacion(vista, esquinasWeb)

        // La captura sale YA, en el mismo fotograma: sin esperar a la web.
        salirCaptura(bitmap, inicio)

        volver()
        actualizar()

        esperandoPagina = true
        principal.removeCallbacks(tiempoAgotado)
        principal.postDelayed(tiempoAgotado, if (webAvisa) ESPERA_MAX_MS else ESPERA_SIN_AVISO_MS)
    }

    // ------------------------------------------------------------ fase 3

    /** La captura sale deslizándose; lo de debajo (velo o página) no se mueve. */
    private fun salirCaptura(bitmap: Bitmap, inicio: Transformacion) {
        val izquierda = desdeIzquierda
        val ancho = vista.width.toFloat()
        animador = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = DURACION_SALIDA_MS
            interpolator = INTERPOLADOR_SALIDA
            addUpdateListener {
                val t = Salida.para(it.animatedValue as Float, inicio, izquierda, ancho, densidad)
                poner(capturaVista, esquinasCaptura, t)
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (animador === animation) animador = null
                    limpiarCaptura(bitmap)
                }
            })
            start()
        }
    }

    /** La página anterior ya está pintada (o se agotó la espera): se quita el velo. */
    private fun revelarPagina() {
        if (!esperandoPagina) return
        esperandoPagina = false
        principal.removeCallbacks(tiempoAgotado)
        velo.animate()
            .alpha(0f)
            .setDuration(DURACION_VELO_MS)
            .withEndAction { ocultarVelo() }
            .start()
    }

    /** Si hay una transición a medias, la lleva al final al instante. */
    private fun terminarTransicion() {
        if (esperandoPagina) {
            esperandoPagina = false
            principal.removeCallbacks(tiempoAgotado)
        }
        if (velo.visibility == View.VISIBLE) {
            velo.animate().cancel()
            ocultarVelo()
        }
        animador?.end()
        animador = null
    }

    private fun ocultarVelo() {
        velo.visibility = View.GONE
        velo.alpha = 1f
        if (enTransicion == null) fondo.background = null
    }

    private fun limpiarCaptura(bitmap: Bitmap) {
        if (enTransicion === bitmap) enTransicion = null
        capturaVista.setImageDrawable(null)
        capturaVista.visibility = View.GONE
        reutilizable = bitmap
        quitarTransformacion(capturaVista, esquinasCaptura)
        quitarTransformacion(vista, esquinasWeb)
        // El fondo hace falta mientras el velo siga puesto (se está desvaneciendo).
        if (velo.visibility != View.VISIBLE) fondo.background = null
    }

    /** Sin captura no hay transición: se navega y la web vuelve a su tamaño. */
    private fun sinCaptura() {
        volver()
        actualizar()
        restaurar(DURACION_SOLTAR_MS)
    }

    // ------------------------------------------------------------ utilidades

    private fun poner(v: View, esquinas: Esquinas, t: Transformacion) {
        v.scaleX = t.escala
        v.scaleY = t.escala
        v.translationX = t.desplazamientoX
        v.translationY = t.desplazamientoY
        esquinas.poner(t.radio)
    }

    private fun quitarTransformacion(v: View, esquinas: Esquinas) {
        poner(v, esquinas, Transformacion.REPOSO)
        v.clipToOutline = false
    }

    private fun restaurar(duracionMs: Long) {
        vista.animate()
            .scaleX(1f).scaleY(1f).translationX(0f).translationY(0f)
            .setDuration(duracionMs)
            .setInterpolator(INTERPOLADOR_GESTO)
            .withEndAction {
                quitarTransformacion(vista, esquinasWeb)
                // En reposo nada que pintar debajo del WebView (ver arriba).
                fondo.background = null
            }
            .start()
    }

    /** Esquinas redondeadas de una vista, con el radio cambiable. */
    private class Esquinas(private val v: View) {
        private var radio = 0f

        init {
            v.outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, radio)
                }
            }
        }

        fun poner(r: Float) {
            if (r != radio) {
                radio = r
                v.invalidateOutline()
            }
        }
    }

    // ------------------------------------------------------------ cálculo puro

    /** La forma de una página: escala, desplazamiento y esquinas. Puro, con pruebas. */
    data class Transformacion(
        val escala: Float,
        val desplazamientoX: Float,
        val radio: Float,
        val desplazamientoY: Float = 0f,
    ) {
        companion object {
            val REPOSO = Transformacion(1f, 0f, 0f, 0f)

            /** Encogimiento máximo: el 90 % del tamaño, como Android entre actividades. */
            const val ESCALA_MINIMA = 0.9f

            /** Lo que se aparta del borde del gesto, en dp, al llegar al final. */
            const val DESPLAZAMIENTO_DP = 24f

            /** Radio de las esquinas al final del gesto, en dp. */
            const val RADIO_DP = 28f

            /** Cuánto sigue la página al dedo en vertical (fracción del recorrido). */
            const val SEGUIMIENTO_Y = 0.1f

            /**
             * La página durante el gesto.
             * @param deltaYPx cuánto se ha movido el dedo en vertical desde el inicio.
             * @param altoPx alto de la página; limita el seguimiento vertical.
             */
            fun para(
                progreso: Float,
                desdeIzquierda: Boolean,
                anchoPx: Float,
                densidad: Float,
                deltaYPx: Float = 0f,
                altoPx: Float = 0f,
            ): Transformacion {
                val p = progreso.coerceIn(0f, 1f)
                val escala = 1f - (1f - ESCALA_MINIMA) * p
                // La escala ya acerca el borde al centro (pivote en el centro);
                // el desplazamiento lo aleja más del borde por el que entra el dedo.
                val sentido = if (desdeIzquierda) 1f else -1f
                val desplazamiento = sentido * DESPLAZAMIENTO_DP * densidad * p
                val radio = RADIO_DP * densidad * minOf(1f, p * 4f)
                // Como en Android: la página sigue al dedo en vertical, poco y
                // con tope (1/20 del alto menos 8 dp).
                val topeY = maxOf(0f, altoPx / 20f - 8f * densidad)
                val y = (deltaYPx * SEGUIMIENTO_Y).coerceIn(-topeY, topeY)
                return Transformacion(escala, if (anchoPx > 0f) desplazamiento else 0f, radio, y)
            }
        }
    }

    /**
     * La página que se va (la captura) durante la salida: desde donde se soltó
     * hasta fuera de la pantalla, por el lado contrario al borde del gesto. La
     * página anterior no se mueve. Puro, con pruebas.
     */
    object Salida {
        /**
         * @param t avance de la salida, 0…1 (ya interpolado).
         * @param inicio dónde estaba la página al soltar (REPOSO sin gesto).
         */
        fun para(
            t: Float,
            inicio: Transformacion,
            desdeIzquierda: Boolean,
            anchoPx: Float,
            densidad: Float,
        ): Transformacion {
            val p = t.coerceIn(0f, 1f)
            val sentido = if (desdeIzquierda) 1f else -1f
            val radioMax = Transformacion.RADIO_DP * densidad
            return Transformacion(
                escala = mezclar(inicio.escala, Transformacion.ESCALA_MINIMA, p),
                desplazamientoX = mezclar(inicio.desplazamientoX, sentido * anchoPx, p),
                radio = mezclar(inicio.radio, radioMax, minOf(1f, p * 4f)),
                desplazamientoY = inicio.desplazamientoY,
            )
        }

        private fun mezclar(a: Float, b: Float, t: Float) = a + (b - a) * t
    }

    private companion object {
        // Curva «emphasized decelerate» de Material 3 para seguir al dedo.
        val INTERPOLADOR_GESTO = PathInterpolator(0.05f, 0.7f, 0.1f, 1f)

        // «Emphasized decelerate» también para la salida: arranca rápido, para
        // que la captura se mueva en cuanto se suelta, y frena al final.
        val INTERPOLADOR_SALIDA = PathInterpolator(0.05f, 0.7f, 0.1f, 1f)

        const val DURACION_SALIDA_MS = 300L
        const val DURACION_VELO_MS = 120L
        const val DURACION_SOLTAR_MS = 250L
        const val DURACION_CANCELAR_MS = 200L

        /** Tope de espera a una web que avisa: luego el velo se quita igual. */
        const val ESPERA_MAX_MS = 900L

        /** Con una web que no avisa (versión antigua): lo justo para un pintado. */
        const val ESPERA_SIN_AVISO_MS = 250L
    }
}
