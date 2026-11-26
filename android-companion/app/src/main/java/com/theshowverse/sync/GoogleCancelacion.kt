package com.theshowverse.sync

/**
 * ¿Una `GetCredentialCancellationException` la provocó de verdad el usuario?
 *
 * Credential Manager usa la MISMA excepción para dos cosas muy distintas:
 * - El usuario cerró el selector («activity is cancelled by the user»): no hay
 *   que hacer nada.
 * - El usuario ELIGIÓ una cuenta y Google no pudo emitir el token para esta app
 *   («[16] Account reauth failed.»): pasa cuando en Google Cloud no existe el
 *   cliente OAuth de Android con este paquete y esta huella de firma. Tratarlo
 *   como cancelación dejaba el formulario de login tal cual tras elegir cuenta,
 *   una y otra vez, sin caer nunca al login por navegador.
 */
object GoogleCancelacion {

    /** Mensajes de "cancelación" que en realidad son un fallo tras elegir cuenta. */
    private val FALLOS_TRAS_ELEGIR = listOf(
        "reauth",           // "[16] Account reauth failed."
        "developer console", // "[28444] Developer console is not set up correctly."
    )

    fun esDelUsuario(mensaje: String?): Boolean {
        val texto = mensaje?.lowercase().orEmpty()
        return FALLOS_TRAS_ELEGIR.none { texto.contains(it) }
    }
}
