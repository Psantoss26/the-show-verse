package com.theshowverse.sync

import android.content.Context
import android.content.Intent

/**
 * Lo que cambia entre las dos apps en el código compartido. Esta es la de la app
 * COMPLETA: la ficha se abre dentro de ella, en el WebView. La de Sync está en
 * src/sync con la misma forma.
 */
object AppVariante {

    /** Dónde se abre la ficha de un título (aviso de acceso rápido). */
    fun abrirFicha(context: Context, url: String): Intent = WebAppActivity.intentFor(context, url)

    /** Pantalla de diagnóstico de fluidez de la web; null donde no hay web. */
    fun rendimiento(context: Context): Intent? = Intent(context, RendimientoActivity::class.java)
}
