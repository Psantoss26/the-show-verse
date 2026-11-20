package com.theshowverse.sync

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Bitmap
import android.graphics.Color
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
 * EL PROBLEMA. En la PWA, Chrome acompaña el gesto de atrás con su propia
 * animación. En el WebView, al soltar el gesto la página cambiaba de golpe:
 * `goBack()` sustituye el contenido en el mismo fotograma y no hay una «página
 * anterior» pintada debajo que se pueda enseñar. Y cuando el sistema no entrega
 * el avance del gesto (ColorOS con las animaciones de deslizamiento apagadas,
 * navegación con tres botones, tecla ATRÁS) no había animación ninguna.
 *
 * LA SOLUCIÓN, en dos fases:
 *
 *  1. MIENTRAS EL DEDO AVANZA (si el sistema entrega el avance): la web se
 *     encoge, se aparta del borde por el que entra el gesto, sigue un poco al
 *     dedo en vertical y redondea las esquinas, como la animación de Android
 *     entre actividades. Antes de tocar nada se hace una CAPTURA de la página
 *     tal cual se ve (PixelCopy, asíncrona y sin volver a pintar la web): la
 *     transformación solo empieza cuando la captura está lista, para que no
 *     salga ya encogida.
 *
 *  2. AL SOLTAR (o al pulsar ATRÁS sin gesto, capturando en ese momento): la
 *     captura se pone encima, exactamente donde estaba la web, y se navega
 *     atrás. La captura sale deslizándose hacia el lado contrario al borde del
 *     gesto mientras la web —ya con la página anterior— entra desde el otro
 *     lado con un poco de paralaje, crece hasta su tamaño y pierde un velo
 *     oscuro. Todo son transformaciones de vistas que compone el RenderThread.
 *
 * Al cancelar, la web vuelve a su sitio sin navegar. Si la captura falla, se
 * navega igual y la web vuelve a su tamaño (el comportamiento de antes).
 *
 * Lo que se ve detrás es [fondo] (negro), que solo se pinta mientras dura el
 * gesto: en reposo el WebView, opaco, cubre la ventana entera.
 *
 * COLOROS (OnePlus, Oppo). El sistema solo entrega el avance del gesto a las
 * apps de terceros con «Ajustes › Sistema y actualización › Navegación por el
 * sistema › Animaciones de deslizamiento (beta)» activado (y su opción para
 * apps de terceros, `secure oplus_third_part_apps_predictive_back=1`). Viene
 * apagado: entonces convierte el gesto en una tecla ATRÁS al soltar
 * (`QuickBackInputPolicy`) y solo llega [handleOnBackPressed]. Con la fase 2
 * la vuelta atrás se anima igualmente; solo falta el encogido mientras se
 * arrastra, que no se puede forzar desde la app.
 */
class AtrasPredictivo(
    private val ventana: Window,
    private val vista: View,
    private val fondo: ViewGroup,
    private val colorFondo: Int,
    private val puedeVolver: () -> Boolean,
    /** Falso con un vídeo a pantalla completa: ahí no hay página que animar. */
    private val animable: () -> Boolean,
    private val volver: () -> Unit,
    private val salir: () -> Unit,
) : OnBackPressedCallback(false) {

    private val densidad = vista.resources.displayMetrics.density
    private val principal = Handler(Looper.getMainLooper())

    private val esquinasWeb = Esquinas(vista)

    /** Velo que oscurece la página que entra. Encima de la web, debajo de la captura. */
    private val velo = View(vista.context).apply {
        setBackgroundColor(Color.BLACK)
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

    private var animador: ValueAnimator? = null

    /** Recalcula si el gesto es de la web o del sistema. Llamarlo tras navegar. */
    fun actualizar() {
        isEnabled = puedeVolver()
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
            val inicio = transformacionGesto()
            when {
                captura != null -> transicion(inicio)
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
        val izquierda = desdeIzquierda
        val ancho = vista.width.toFloat()

        fondo.setBackgroundColor(colorFondo)
        vista.clipToOutline = true
        capturaVista.setImageBitmap(bitmap)
        capturaVista.clipToOutline = true
        capturaVista.visibility = View.VISIBLE
        velo.visibility = View.VISIBLE

        val pintar = { t: Float ->
            val f = Fotograma.para(t, inicio, izquierda, ancho, densidad)
            poner(capturaVista, esquinasCaptura, f.saliente)
            poner(vista, esquinasWeb, f.entrante)
            velo.alpha = f.velo
        }
        pintar(0f)

        // La captura ya tapa la web: ahora sí se navega.
        volver()
        actualizar()

        animador = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = DURACION_TRANSICION_MS
            interpolator = INTERPOLADOR_TRANSICION
            addUpdateListener { pintar(it.animatedValue as Float) }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (animador === animation) animador = null
                    limpiarTransicion(bitmap)
                }
            })
            start()
        }
    }

    /** Si hay una transición a medias, la lleva al final al instante. */
    private fun terminarTransicion() {
        animador?.end()
        animador = null
    }

    private fun limpiarTransicion(bitmap: Bitmap) {
        capturaVista.setImageDrawable(null)
        capturaVista.visibility = View.GONE
        velo.visibility = View.GONE
        reutilizable = bitmap
        quitarTransformacion(capturaVista, esquinasCaptura)
        quitarTransformacion(vista, esquinasWeb)
        fondo.background = null
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
     * Un fotograma de la transición al soltar: la página que se va (la
     * captura), la que entra (la web) y la opacidad del velo. Puro, con pruebas.
     */
    data class Fotograma(val saliente: Transformacion, val entrante: Transformacion, val velo: Float) {
        companion object {
            /** La página anterior entra desde este tamaño. */
            const val ESCALA_ENTRANTE = 0.9f

            /** Y desde esta fracción del ancho, por el lado del gesto. */
            const val PARALAJE = 0.25f

            /** Opacidad inicial del velo sobre la página que entra. */
            const val VELO_MAXIMO = 0.55f

            /**
             * @param t avance de la transición, 0…1 (ya interpolado).
             * @param inicio dónde estaba la página al soltar (REPOSO sin gesto).
             */
            fun para(
                t: Float,
                inicio: Transformacion,
                desdeIzquierda: Boolean,
                anchoPx: Float,
                densidad: Float,
            ): Fotograma {
                val p = t.coerceIn(0f, 1f)
                val sentido = if (desdeIzquierda) 1f else -1f
                val radioMax = Transformacion.RADIO_DP * densidad

                // La que se va: sale del todo por el lado contrario al borde.
                val saliente = Transformacion(
                    escala = mezclar(inicio.escala, Transformacion.ESCALA_MINIMA, p),
                    desplazamientoX = mezclar(inicio.desplazamientoX, sentido * anchoPx, p),
                    radio = mezclar(inicio.radio, radioMax, minOf(1f, p * 4f)),
                    desplazamientoY = inicio.desplazamientoY,
                )
                // La que entra: desde el lado del gesto, más pequeña, hasta su sitio.
                val entrante = Transformacion(
                    escala = mezclar(ESCALA_ENTRANTE, 1f, p),
                    desplazamientoX = mezclar(-sentido * anchoPx * PARALAJE, 0f, p),
                    radio = mezclar(radioMax, 0f, p),
                    desplazamientoY = 0f,
                )
                return Fotograma(saliente, entrante, mezclar(VELO_MAXIMO, 0f, p))
            }

            private fun mezclar(a: Float, b: Float, t: Float) = a + (b - a) * t
        }
    }

    private companion object {
        // Curva «emphasized decelerate» de Material 3 para seguir al dedo.
        val INTERPOLADOR_GESTO = PathInterpolator(0.05f, 0.7f, 0.1f, 1f)

        // «Emphasized» de Material 3 para la transición al soltar.
        val INTERPOLADOR_TRANSICION = PathInterpolator(0.2f, 0f, 0f, 1f)

        const val DURACION_TRANSICION_MS = 380L
        const val DURACION_SOLTAR_MS = 250L
        const val DURACION_CANCELAR_MS = 200L
    }
}
