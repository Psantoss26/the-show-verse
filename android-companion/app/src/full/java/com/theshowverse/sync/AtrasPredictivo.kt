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
 * LA SOLUCIÓN. La app guarda una FOTO de cada página al tocarla ([alTocar],
 * PixelCopy del último fotograma, antes de que el toque cambie nada): el toque
 * que lleva a otra página deja así la anterior tal como se veía. Cuando el
 * historial avanza ([historialCambiado]) la foto se asocia a la entrada que se
 * deja, con su URL ([FotosHistorial]). Al volver, esa foto es la página
 * anterior, estática, desde el primer fotograma; si la entrada ya no tiene esa
 * URL (historial lleno que se ha desplazado, `replaceState`…), no se usa: nunca
 * se enseña la foto de otra página. Luego, en tres fases:
 *
 *  1. MIENTRAS EL DEDO AVANZA (si el sistema entrega el avance): la web se
 *     encoge, se aparta del borde por el que entra el gesto, sigue un poco al
 *     dedo en vertical y redondea las esquinas, como la animación de Android
 *     entre actividades; detrás se ve la foto de la página anterior. Antes de
 *     tocar nada se hace una CAPTURA de la página actual tal cual se ve
 *     (asíncrona y sin volver a pintar la web): la transformación solo empieza
 *     cuando la captura está lista.
 *
 *  2. AL SOLTAR (o al pulsar ATRÁS sin gesto, capturando en ese momento): la
 *     foto de la página anterior tapa la web, que vuelve a su tamaño y navega
 *     atrás sin que se vea, y la captura de la actual sale EN EL ACTO
 *     deslizándose hacia el lado contrario al borde del gesto.
 *
 *  3. Cuando la web avisa de que la página anterior ya está pintada
 *     ([paginaPintada], desde src/components/android/AndroidBackPaintSignal.jsx)
 *     y ese pintado llega a pantalla ([confirmarPintado]), la foto se funde con
 *     la página real, que es igual. Con una web que no avisa se espera poco;
 *     con una que sí, como mucho [ESPERA_MAX_MS].
 *
 * Sin foto de la página anterior (se llegó sin tocar, o tras reabrir la app):
 * un velo liso tapa la web y la captura espera quieta a que la web pinte para
 * salir, como antes; así nunca se ve una pantalla vacía detrás.
 *
 * Al cancelar, la web vuelve a su sitio sin navegar. Si la captura falla, se
 * navega igual y la web vuelve a su tamaño.
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
    /** El historial de la web: URL de cada entrada y posición actual. */
    private val historial: () -> FotosHistorial.Historial,
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

    /**
     * Tapa la web mientras pinta la página anterior, con su foto (o liso si no
     * la hay). Encima de la web, debajo de la captura.
     */
    private val velo = ImageView(vista.context).apply {
        scaleType = ImageView.ScaleType.FIT_XY
        setBackgroundColor(colorFondo)
        visibility = View.GONE
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    /** La foto de la página anterior DEBAJO de la web, mientras se arrastra. */
    private val debajo = ImageView(vista.context).apply {
        scaleType = ImageView.ScaleType.FIT_XY
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
        fondo.addView(debajo, indice - 1, tamano)
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

    /** Sin foto de la página anterior: la captura sale cuando la web ya pintó. */
    private var salidaPendiente = false
    private var inicioSalida = Transformacion.REPOSO

    private var animador: ValueAnimator? = null

    /** Fotos de las páginas que se han dejado (ver [FotosHistorial]). */
    private val fotos = FotosHistorial<Bitmap>(MAX_PAGINAS)

    private var capturandoToque = false

    /**
     * Un dedo toca la web: foto de la página tal como se ve (el último
     * fotograma, aún sin efecto del toque). Si el toque lleva a otra página,
     * será la que se vea al volver.
     */
    fun alTocar() {
        if (capturandoToque || enGesto || enTransicion != null || pendiente) return
        if (vista.scaleX != 1f || vista.translationX != 0f) return
        val ahora = historial()
        val destino = fotos.soltarToque()
        capturandoToque = true
        copiar(destino) { bitmap ->
            capturandoToque = false
            if (bitmap != null) fotos.tocado(bitmap, ahora.indice, ahora.urlActual)
        }
    }

    /** El historial de la web ha cambiado (también por `pushState` y `replaceState`). */
    fun historialCambiado() {
        fotos.cambio(historial())
    }

    /** La foto de la página a la que se vuelve, si la hay, es de esa página y encaja. */
    private fun fotoAnterior(): Bitmap? =
        fotos.anterior(historial())?.takeIf { it.width == vista.width && it.height == vista.height }

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
        fotoAnterior()?.let {
            debajo.setImageBitmap(it)
            debajo.visibility = View.VISIBLE
        }
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
        val destino = reutilizable
        reutilizable = null
        capturando = true
        copiar(destino) { bitmap ->
            capturando = false
            captura = bitmap
            listo()
            alCapturar?.let { alCapturar = null; it() }
        }
    }

    /** Copia lo que se ve de la web a un bitmap (`destino` si encaja). Null si falla. */
    private fun copiar(destino: Bitmap?, listo: (Bitmap?) -> Unit) {
        val ancho = vista.width
        val alto = vista.height
        if (ancho <= 0 || alto <= 0 || !vista.isAttachedToWindow) {
            listo(null)
            return
        }
        val bitmap = destino?.takeIf { it.width == ancho && it.height == alto && !it.isRecycled }
            ?: Bitmap.createBitmap(ancho, alto, Bitmap.Config.ARGB_8888)
        val origen = IntArray(2).also { vista.getLocationInWindow(it) }
        val zona = Rect(origen[0], origen[1], origen[0] + ancho, origen[1] + alto)
        try {
            PixelCopy.request(ventana, zona, bitmap, { resultado ->
                listo(if (resultado == PixelCopy.SUCCESS) bitmap else null)
            }, principal)
        } catch (e: IllegalArgumentException) {
            // Ventana sin superficie (se está cerrando): sin captura.
            listo(null)
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
        val anterior = fotoAnterior()
        velo.animate().cancel()
        velo.alpha = 1f
        velo.setImageBitmap(anterior)
        velo.visibility = View.VISIBLE
        quitarTransformacion(vista, esquinasWeb)

        if (anterior != null) {
            // Con la página anterior ya a la vista, la captura sale YA.
            salirCaptura(bitmap, inicio)
        } else {
            salidaPendiente = true
            inicioSalida = inicio
        }

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
        if (salidaPendiente) {
            salidaPendiente = false
            ocultarVelo()
            enTransicion?.let { salirCaptura(it, inicioSalida) }
            return
        }
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
        if (salidaPendiente) {
            salidaPendiente = false
            enTransicion?.let { limpiarCaptura(it) }
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
        velo.setImageDrawable(null)
        if (enTransicion == null) fondo.background = null
    }

    private fun limpiarCaptura(bitmap: Bitmap) {
        if (enTransicion === bitmap) enTransicion = null
        capturaVista.setImageDrawable(null)
        capturaVista.visibility = View.GONE
        reutilizable = bitmap
        quitarTransformacion(capturaVista, esquinasCaptura)
        quitarTransformacion(vista, esquinasWeb)
        ocultarDebajo()
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

    private fun ocultarDebajo() {
        debajo.visibility = View.GONE
        debajo.setImageDrawable(null)
    }

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
                ocultarDebajo()
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

        // Salida más suave que el gesto: la captura empieza a moverse en cuanto
        // se suelta, pero sin el tirón inicial del «emphasized decelerate»
        // (pendiente de arranque ~2,5 frente a ~14), y frena largo al final.
        val INTERPOLADOR_SALIDA = PathInterpolator(0.2f, 0.5f, 0.15f, 1f)

        const val DURACION_SALIDA_MS = 450L
        const val DURACION_VELO_MS = 200L
        const val DURACION_SOLTAR_MS = 350L
        const val DURACION_CANCELAR_MS = 280L

        /** Tope de espera a una web que avisa: luego el velo se quita igual. */
        const val ESPERA_MAX_MS = 900L

        /** Fotos de páginas anteriores que se guardan (unos 10 MB cada una). */
        const val MAX_PAGINAS = 4

        /** Con una web que no avisa (versión antigua): lo justo para un pintado. */
        const val ESPERA_SIN_AVISO_MS = 250L
    }
}
