package com.theshowverse.sync

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Lo que cambia entre las dos apps en el código compartido. Esta es la de THE
 * SHOW VERSE SYNC: no tiene web, así que la ficha se abre fuera. Un enlace a
 * theshowverse.com lo recoge la PWA si está instalada (Chrome le asigna los
 * enlaces de su ámbito) y, si no, el navegador.
 */
object AppVariante {

    fun abrirFicha(context: Context, url: String): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    fun rendimiento(context: Context): Intent? = null
}
