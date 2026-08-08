package com.theshowverse.sync

import android.app.Activity
import android.os.Handler
import android.os.Looper
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.util.concurrent.Executors

/**
 * Inicio de sesión con Google SIN NAVEGADOR.
 *
 * EL PROBLEMA QUE RESUELVE. El botón de Google de la web navega a
 * accounts.google.com, y Google RECHAZA su formulario dentro de un WebView
 * embebido (`disallowed_useragent`), así que la carcasa no tiene más remedio que
 * mandarlo al navegador. Ahí la sesión se crea en las cookies DEL NAVEGADOR, no
 * en las del WebView: aunque la vuelta a la app funcione, se ve un salto feo a
 * Chrome en mitad del login.
 *
 * LA SOLUCIÓN. Credential Manager pide el token directamente al sistema: sale el
 * selector de cuentas de Android, sin navegador. El `idToken` resultante se le
 * entrega a la web, que lo canjea contra el MISMO endpoint del backend que usa el
 * login por navegador (`/v1/auth/google`, que valida el token contra Google), y
 * las cookies de sesión se quedan donde tienen que estar: en el WebView.
 *
 * REQUISITO DE CONFIGURACIÓN. En Google Cloud tiene que existir un cliente OAuth
 * de tipo **Android** con el nombre de paquete `com.theshowverse.app` y la huella
 * SHA-1 del certificado de firma. Sin él, el sistema no devuelve credenciales y
 * esta clase informa del fallo para que la web caiga al flujo por navegador.
 */
object GoogleSignIn {

    /** Resultado tal cual lo consume la web. */
    data class Result(
        val ok: Boolean,
        val idToken: String? = null,
        val cancelled: Boolean = false,
        val error: String? = null,
    )

    private val ejecutor = Executors.newSingleThreadExecutor()
    private val principal = Handler(Looper.getMainLooper())

    /** ¿Está configurado el cliente web? Sin él ni se intenta. */
    fun configurado(): Boolean = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()

    /**
     * Lanza el selector de cuentas. [alTerminar] se invoca SIEMPRE, en el hilo
     * principal, con el resultado (token, cancelación o error).
     *
     * Todo lo que pasa queda anotado en el registro de la app (panel de
     * sincronización): cuando esto falla, el usuario solo ve que "no pasa nada",
     * y sin rastro no hay forma de saber si faltó el cliente de Google Cloud, si
     * canceló o si el sistema devolvió otra cosa.
     */
    fun solicitar(activity: Activity, alTerminar: (Result) -> Unit) {
        val prefs = Prefs(activity)
        if (!configurado()) {
            prefs.addLog("Google: ✗ sin cliente configurado en la app")
            alTerminar(Result(ok = false, error = "google_client_not_configured"))
            return
        }
        prefs.addLog("Google: pidiendo cuenta al sistema…")

        // `GetSignInWithGoogleOption` es el flujo de BOTÓN: muestra todas las
        // cuentas del dispositivo aunque nunca se haya entrado en la app. La
        // alternativa (GetGoogleIdOption) filtra por cuentas ya autorizadas y
        // dejaría a un usuario nuevo sin poder registrarse.
        val opcion = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).build()
        val peticion = GetCredentialRequest.Builder().addCredentialOption(opcion).build()

        CredentialManager.create(activity).getCredentialAsync(
            activity,
            peticion,
            null,
            ejecutor,
            object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                override fun onResult(result: GetCredentialResponse) {
                    val credencial = result.credential
                    val token = try {
                        if (credencial.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                            GoogleIdTokenCredential.createFrom(credencial.data).idToken
                        } else {
                            null
                        }
                    } catch (e: Exception) {
                        null
                    }
                    principal.post {
                        if (token.isNullOrBlank()) {
                            prefs.addLog("Google: ✗ credencial inesperada (${credencial.type})")
                            alTerminar(Result(ok = false, error = "unexpected_credential"))
                        } else {
                            prefs.addLog("Google: ✓ cuenta seleccionada")
                            alTerminar(Result(ok = true, idToken = token))
                        }
                    }
                }

                override fun onError(e: GetCredentialException) {
                    val resultado = when (e) {
                        // El usuario cerró el selector: NO es un error que deba
                        // provocar el salto al navegador.
                        is GetCredentialCancellationException ->
                            Result(ok = false, cancelled = true)
                        // Sin cuentas o sin servicios de Google: la web ofrece el
                        // flujo por navegador.
                        is NoCredentialException ->
                            Result(ok = false, error = "no_credentials")
                        else ->
                            Result(ok = false, error = e.type.ifBlank { "credential_error" })
                    }
                    // El caso típico: el selector aparece, eliges cuenta y el
                    // sistema no puede emitir el token porque en Google Cloud no
                    // existe el cliente OAuth de Android para este paquete y esta
                    // huella de firma. Se anota para que el flujo por navegador
                    // no tenga que adivinarlo.
                    if (resultado.cancelled) {
                        prefs.addLog("Google: cancelado por el usuario")
                    } else {
                        prefs.addLog("Google: ✗ ${e.type.ifBlank { e.javaClass.simpleName }} — ${e.message ?: "sin detalle"}")
                        prefs.nativeGoogleUnavailable = true
                    }
                    principal.post { alTerminar(resultado) }
                }
            },
        )
    }
}
