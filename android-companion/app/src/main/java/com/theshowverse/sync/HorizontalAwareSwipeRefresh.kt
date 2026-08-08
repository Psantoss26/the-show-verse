package com.theshowverse.sync

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlin.math.abs

/**
 * "Deslizar para recargar" que NO se queda con los gestos horizontales.
 *
 * EL PROBLEMA. `SwipeRefreshLayout` empieza a vigilar cualquier arrastre en
 * cuanto el contenido está arriba del todo, y basta con que el dedo baje un poco
 * para que se apropie del gesto. Cuando eso pasa, el WebView recibe un
 * ACTION_CANCEL y la página, en vez de un `touchend`, recibe un `touchcancel`.
 *
 * QUÉ ROMPÍA. La web usa `touchstart` + `touchend` para pasar de sección
 * deslizando en el perfil, y descarta el gesto si llega un `touchcancel`. De ahí
 * que deslizar funcionara en la PWA —donde no hay ningún padre que intercepte— y
 * no dentro de la app. Lo mismo afectaba a las filas de carteles que se
 * desplazan en horizontal.
 *
 * LA REGLA. Si el dedo se ha movido en horizontal más que en vertical (pasado el
 * umbral del sistema), el gesto es de la página: este contenedor se aparta hasta
 * que se levante el dedo. Un arrastre vertical sigue recargando como siempre.
 */
class HorizontalAwareSwipeRefresh @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : SwipeRefreshLayout(context, attrs) {

    private val umbral = ViewConfiguration.get(context).scaledTouchSlop
    private var xInicial = 0f
    private var yInicial = 0f
    private var cedido = false

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                xInicial = ev.x
                yInicial = ev.y
                cedido = false
            }
            MotionEvent.ACTION_MOVE -> {
                if (!cedido &&
                    GestoHorizontal.esHorizontal(ev.x - xInicial, ev.y - yInicial, umbral)
                ) {
                    cedido = true
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> cedido = false
        }

        if (cedido) return false
        return super.onInterceptTouchEvent(ev)
    }
}

/**
 * La decisión, aparte y sin dependencias de Android para poder probarla: un
 * gesto es de la página cuando se ha movido en horizontal más que en vertical y
 * ya ha superado el umbral del sistema.
 */
object GestoHorizontal {
    fun esHorizontal(dx: Float, dy: Float, umbral: Int): Boolean {
        val horizontal = abs(dx)
        val vertical = abs(dy)
        return horizontal > umbral && horizontal > vertical
    }
}
