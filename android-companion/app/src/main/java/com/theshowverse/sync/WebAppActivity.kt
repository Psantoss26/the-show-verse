package com.theshowverse.sync

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import com.theshowverse.sync.databinding.ActivityWebBinding

/**
 * LA APP. The Show Verse completo dentro de una carcasa nativa.
 *
 * POR QUÉ UN WEBVIEW Y NO UNA TWA
 * Una Trusted Web Activity delega la web a Chrome, y desde ahí NO se puede
 * hablar con el servicio de sincronización ni abrir su pantalla nativa: harían
 * falta dos apps, justo lo contrario del objetivo. Con WebView la web y el
 * nativo viven en el mismo proceso y se comunican por [WebAppBridge].
 *
 * QUÉ RESUELVE ESTA CLASE, aparte de "cargar una URL":
 *  - Sesión: cookies persistentes y de terceros (el backend puede estar en otro
 *    origen), volcadas a disco al pausar para no perder el login al matar la app.
 *  - Navegación: lo del propio origen se queda dentro; lo de fuera se abre en
 *    una pestaña personalizada del navegador, y los esquemas raros
 *    (market://, mailto:, intent://) los resuelve el sistema.
 *  - Vídeo a pantalla completa: los tráileres de YouTube necesitan que la
 *    carcasa implemente onShowCustomView; sin eso el botón no hace nada.
 *  - Subida de ficheros: el selector de avatar es un <input type="file">, que en
 *    un WebView no funciona si la app no abre el selector del sistema.
 *  - Fallo de red y gate de acceso privado: pantalla propia con reintento en vez
 *    del "página no disponible" del WebView.
 */
class WebAppActivity : AppCompatActivity() {

    private lateinit var binding: ActivityWebBinding
    private lateinit var prefs: Prefs

    /** Origen que se está sirviendo. Lo lee el puente desde otro hilo. */
    @Volatile
    private var origin: String = ""

    /** URL cargada en este momento. Sirve al puente para comprobar que quien
     *  llama es la propia web y no una página ajena. */
    @Volatile
    private var currentUrl: String = ""

    private var listoParaPintar = false
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback ?: return@registerForActivityResult
            fileChooserCallback = null
            callback.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
        }

    /** Los ajustes de servidor devuelven aquí para recargar con el origen nuevo. */
    private val serverSettingsLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            aplicarOrigen(recargar = true)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        // La pantalla de arranque se mantiene hasta que la web tiene algo que
        // enseñar: así no se ve un rectángulo blanco antes del primer pintado.
        val splash = installSplashScreen()
        splash.setKeepOnScreenCondition { !listoParaPintar }
        super.onCreate(savedInstanceState)

        binding = ActivityWebBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = Prefs(this)

        configurarWebView()
        configurarRefresco()
        configurarBotonAtras()
        configurarInsets()

        binding.retryButton.setOnClickListener {
            ocultarError()
            binding.webView.reload()
        }
        binding.serverButton.setOnClickListener { abrirAjustesDeServidor() }

        aplicarOrigen(recargar = false)
        // Prioridad: el enlace con el que han abierto la app > la última página
        // vista (volver donde lo dejaste) > la portada.
        val destino = urlDelIntent(intent)
            ?: prefs.lastUrl?.takeIf { WebOrigin.isInternal(it, origin) }
            ?: origin
        cargar(destino)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        urlDelIntent(intent)?.let { cargar(it) }
    }

    // ---------------------------------------------------------------- WebView

    @SuppressLint("SetJavaScriptEnabled")
    private fun configurarWebView() {
        val web = binding.webView
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.tsv_black))

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            // Los tráileres deben poder arrancar al pulsar sin un gesto extra.
            mediaPlaybackRequiresUserGesture = false
            // La web es responsive y ya trae `width=device-width`. Chrome/PWA
            // respeta ese viewport sin volver a escalar toda la página; el modo
            // "overview" del WebView sí podría encoger botones, logos y texto si
            // detecta cualquier desbordamiento horizontal.
            useWideViewPort = true
            loadWithOverviewMode = false
            textZoom = 100
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            // Nada de acceso al sistema de ficheros: la app solo carga red.
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString ${BuildConfig.UA_SUFFIX}"
        }

        // The Show Verse ya pinta su tema oscuro y su liquid glass en CSS. Si el
        // WebView vuelve a oscurecer la página de forma algorítmica modifica los
        // colores, transparencias, botones e imágenes respecto a Chrome/PWA.
        // Se desactiva tanto la API actual como el respaldo de WebView antiguos.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(web.settings, false)
        }
        @Suppress("DEPRECATION")
        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            WebSettingsCompat.setForceDark(
                web.settings,
                WebSettingsCompat.FORCE_DARK_OFF,
            )
        }

        // SIN BARRAS DE SCROLL. En una app nativa no pintan nada, y el WebView
        // las "despierta" solo con cargar o restaurar la posición: aparece una
        // barra gris sobre el contenido justo al abrir una ficha. Con
        // SCROLLBARS_INSIDE_OVERLAY, además, el contenido no se estrecha para
        // dejarles hueco. La barra CSS de la propia web se apaga aparte, en
        // globals.css, para los dispositivos táctiles.
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false
        web.scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }

        web.addJavascriptInterface(
            WebAppBridge(
                this,
                prefs,
                { origin },
                { currentUrl },
                ::evaluarJs,
                ::abrirEnNavegador,
            ),
            WebAppBridge.NAME,
        )

        web.webViewClient = ClienteWeb()
        web.webChromeClient = ClienteChrome()
        web.setDownloadListener(descargas)
    }

    private inner class ClienteWeb : WebViewClient() {

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest,
        ): Boolean {
            val url = request.url?.toString() ?: return false
            return when {
                WebOrigin.isInternal(url, origin) -> false // se queda dentro
                // El login de Trakt/Plex/TMDb TAMBIÉN se queda dentro: sacarlo
                // al navegador dejaría su sesión en las cookies de Chrome y la
                // conexión no llegaría a completarse en la app.
                WebOrigin.isProviderLogin(url) -> false
                WebOrigin.isExternalScheme(url) -> {
                    abrirConElSistema(url)
                    true
                }
                else -> {
                    abrirEnNavegador(url)
                    true
                }
            }
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
            currentUrl = url.orEmpty()
            binding.progress.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String?) {
            currentUrl = url.orEmpty()
            binding.progress.visibility = View.GONE
            binding.refresh.isRefreshing = false
            listoParaPintar = true
            // Guardar la última ruta permite volver donde estabas si el sistema
            // mata la app en segundo plano.
            if (WebOrigin.isInternal(url, origin)) prefs.lastUrl = url
        }

        /** El enrutado de Next no recarga la página: sin esto, la app no se
         *  enteraría de en qué sección está el usuario. */
        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            currentUrl = url.orEmpty()
            if (WebOrigin.isInternal(url, origin)) prefs.lastUrl = url
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            if (!request.isForMainFrame) return
            listoParaPintar = true
            mostrarError(
                getString(R.string.web_error_title),
                getString(R.string.web_error_body, origin),
            )
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            if (!request.isForMainFrame) return
            // El gate de acceso privado de la web responde 404 a los dispositivos
            // no autorizados. Es indistinguible de "no existe", así que se explica
            // como lo que casi siempre es y se ofrece meter la clave.
            if (errorResponse.statusCode == 404) {
                listoParaPintar = true
                mostrarError(
                    getString(R.string.web_private_title),
                    getString(R.string.web_private_body),
                )
            }
        }
    }

    private inner class ClienteChrome : WebChromeClient() {

        override fun onProgressChanged(view: WebView, newProgress: Int) {
            binding.progress.progress = newProgress
            if (newProgress >= 100) binding.progress.visibility = View.GONE
        }

        /** Tráileres a pantalla completa. */
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (customView != null) {
                callback.onCustomViewHidden()
                return
            }
            customView = view
            customViewCallback = callback
            binding.videoContainer.addView(
                view,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            binding.videoContainer.visibility = View.VISIBLE
            binding.refresh.visibility = View.GONE
            pantallaCompleta(true)
        }

        override fun onHideCustomView() {
            val view = customView ?: return
            binding.videoContainer.removeView(view)
            binding.videoContainer.visibility = View.GONE
            binding.refresh.visibility = View.VISIBLE
            customView = null
            customViewCallback?.onCustomViewHidden()
            customViewCallback = null
            pantallaCompleta(false)
        }

        /** Selector de ficheros (avatar, importaciones). */
        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = filePathCallback
            return try {
                fileChooserLauncher.launch(fileChooserParams.createIntent())
                true
            } catch (e: ActivityNotFoundException) {
                fileChooserCallback = null
                false
            }
        }

        /** La web no necesita cámara ni micrófono: se deniega siempre. */
        override fun onPermissionRequest(request: PermissionRequest) {
            request.deny()
        }
    }

    /** Las descargas las hace el gestor del sistema, no el WebView. */
    private val descargas = DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
        try {
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setMimeType(mimeType)
                addRequestHeader("User-Agent", userAgent)
                addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED,
                )
                setDestinationInExternalPublicDir(
                    android.os.Environment.DIRECTORY_DOWNLOADS,
                    android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType),
                )
            }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            abrirEnNavegador(url)
        }
    }

    /**
     * Ejecuta JS en la página. Lo usa el puente para devolver resultados
     * ASÍNCRONOS (el login de Google), que es lo único que no cabe en el
     * valor de retorno de un método del puente.
     */
    private fun evaluarJs(codigo: String) {
        runOnUiThread { binding.webView.evaluateJavascript(codigo, null) }
    }

    // ------------------------------------------------------------- navegación

    private fun configurarBotonAtras() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    when {
                        customView != null -> binding.webView.webChromeClient?.onHideCustomView()
                        binding.webView.canGoBack() -> binding.webView.goBack()
                        else -> finish()
                    }
                }
            },
        )
    }

    /**
     * Barras del sistema. Al apuntar a Android 15 (API 35) la app dibuja
     * EDGE-TO-EDGE de forma obligatoria: sin esto, la cabecera de la web
     * quedaría debajo del reloj y el navbar inferior debajo de los botones de
     * navegación. Se traslada el hueco de las barras a relleno del contenedor,
     * y el fondo que asoma es el de la app (negro), así que se sigue viendo como
     * una sola pieza. El vídeo a pantalla completa NO se rellena a propósito:
     * ahí sí debe ocupar hasta el borde.
     *
     * En versiones anteriores el sistema ya coloca la ventana bajo las barras,
     * los insets llegan a cero y esto no hace nada.
     */
    private fun configurarInsets() {
        for (vista in listOf(binding.refresh, binding.errorPanel)) {
            ViewCompat.setOnApplyWindowInsetsListener(vista) { view, insets ->
                val barras = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or
                        WindowInsetsCompat.Type.displayCutout(),
                )
                view.setPadding(barras.left, barras.top, barras.right, barras.bottom)
                insets
            }
        }
    }

    private fun configurarRefresco() {
        // Deslizar para recargar SOLO cuando la página está arriba del todo: si
        // no, el gesto compite con el scroll y con los carruseles horizontales.
        binding.refresh.setOnChildScrollUpCallback { _, _ -> binding.webView.scrollY > 0 }
        binding.refresh.setColorSchemeColors(ContextCompat.getColor(this, R.color.tsv_amber))
        binding.refresh.setProgressBackgroundColorSchemeColor(
            ContextCompat.getColor(this, R.color.tsv_black),
        )
        binding.refresh.setOnRefreshListener {
            ocultarError()
            binding.webView.reload()
        }
    }

    /** Enlace externo: pestaña personalizada, que conserva el aspecto de la app. */
    private fun abrirEnNavegador(url: String) {
        try {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
                .launchUrl(this, Uri.parse(url))
        } catch (e: ActivityNotFoundException) {
            abrirConElSistema(url)
        }
    }

    private fun abrirConElSistema(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show()
        }
    }

    private fun urlDelIntent(intent: Intent?): String? {
        val data = intent?.data?.toString() ?: return null
        // theshowverse://open?url=… (respaldo cuando no hay App Links verificados)
        if (data.startsWith("theshowverse://open")) {
            val url = intent.data?.getQueryParameter("url")
            return url?.takeIf { WebOrigin.isInternal(it, origin) }
        }
        return data.takeIf { WebOrigin.isInternal(it, origin) }
    }

    private fun cargar(url: String) {
        ocultarError()
        binding.webView.loadUrl(url)
    }

    // ------------------------------------------------------------------ estado

    /** Relee el origen configurado (ajustes) y, si cambió, recarga. */
    private fun aplicarOrigen(recargar: Boolean) {
        val nuevo = WebOrigin.normalize(prefs.webOrigin) ?: BuildConfig.DEFAULT_ORIGIN
        val cambió = nuevo != origin
        origin = nuevo
        if (recargar && cambió) {
            // Al cambiar de servidor la sesión anterior no vale: se limpian las
            // cookies para no mezclar dos instalaciones distintas.
            CookieManager.getInstance().removeAllCookies(null)
            cargar(WebOrigin.privateAccessUrl(origin, prefs.accessKey) ?: origin)
        } else if (recargar) {
            cargar(WebOrigin.privateAccessUrl(origin, prefs.accessKey) ?: origin)
        }
    }

    private fun abrirAjustesDeServidor() {
        serverSettingsLauncher.launch(Intent(this, ServerActivity::class.java))
    }

    private fun mostrarError(titulo: String, cuerpo: String) {
        binding.errorTitle.text = titulo
        binding.errorBody.text = cuerpo
        binding.errorPanel.visibility = View.VISIBLE
        binding.refresh.isRefreshing = false
        binding.progress.visibility = View.GONE
    }

    private fun ocultarError() {
        binding.errorPanel.visibility = View.GONE
    }

    private fun pantallaCompleta(activa: Boolean) {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (activa) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    // ------------------------------------------------------------ ciclo de vida

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        // Estando delante, la vigilancia del login sobra: la web reclama la
        // sesión al recuperar el foco.
        LoginWatcher.cancelar()
        // Volver de los ajustes nativos (permisos, servidor) puede haber cambiado
        // el origen: se comprueba sin recargar si no ha cambiado nada.
        val configurado = WebOrigin.normalize(prefs.webOrigin) ?: BuildConfig.DEFAULT_ORIGIN
        if (configurado != origin) aplicarOrigen(recargar = true)
    }

    override fun onPause() {
        binding.webView.onPause()
        // Volcado a disco: sin esto se pierde la sesión si el sistema mata la app.
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        binding.webView.apply {
            (parent as? ViewGroup)?.removeView(this)
            stopLoading()
            destroy()
        }
        super.onDestroy()
    }

    companion object {
        /** Intent explícito para abrir una URL de la web DENTRO de la app. */
        fun intentFor(context: Context, url: String): Intent =
            Intent(context, WebAppActivity::class.java).apply {
                data = Uri.parse(url)
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
    }
}
