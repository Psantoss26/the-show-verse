package com.theshowverse.sync

import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Las pantallas nativas (panel de sincronización, detecciones, corrección…) se
 * ven como la PWA instalada: barra de estado y de navegación NEGRAS con iconos
 * claros, y el contenido ENTRE ellas, nunca debajo.
 *
 * Con targetSdk 35, Android 15 dibuja todas las ventanas de borde a borde y
 * pasa por alto statusBarColor/navigationBarColor, así que el contenido quedaba
 * bajo la barra de estado y la de gestos. Aquí se activa el borde a borde en
 * todas las versiones (mismo resultado en Android 14 y 15) y se aparta el
 * contenido con los huecos de las barras, la cámara y el teclado; el fondo negro
 * de la ventana es lo que se ve detrás de las barras.
 */
object BarrasDelSistema {

    fun ajustar(activity: ComponentActivity) {
        activity.enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        val contenido = activity.findViewById<android.view.View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(contenido) { view, insets ->
            val huecos = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            // Sustituye a adjustResize, que de borde a borde ya no encoge la ventana.
            val teclado = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(
                huecos.left,
                huecos.top,
                huecos.right,
                maxOf(huecos.bottom, teclado.bottom),
            )
            WindowInsetsCompat.CONSUMED
        }
    }
}
