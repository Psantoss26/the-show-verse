package com.theshowverse.sync

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.MotionEvent
import android.view.RoundedCorner
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
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsClient
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
import org.json.JSONObject

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

    /**
     * Ya se probó a abrir la portada tras un fallo de carga. Sin servidor, la
     * página pedida puede no tener copia guardada pero la portada sí: el
     * service worker la sirve con el aviso «Sin conexión». Solo una vez por
     * carga, para no entrar en bucle si tampoco hay portada.
     */
    private var portadaIntentada = false
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var customView: View? = null

    /** Hay un modal de la web abierto: atrás lo cierra sin animar la página. */
    private var modalWebAbierto = false
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

    /** Medidor de fotogramas de diagnóstico; null mientras está apagado. */
    private var medidor: MedidorFotogramas? = null
    private lateinit var atras: AtrasPredictivo

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileChooserCallback ?: return@registerForActivityResult
            fileChooserCallback = null
            callback.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
            )
        }

    /** Permiso de notificaciones (Android 13+). La web espera la respuesta. */
    private val permisoPushLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            responderPermisoPush()
        }

    /**
     * Permiso de notificaciones para el aviso de acceso rápido a la ficha, al
     * vincular o activarlo desde la web. Sin respuesta a la web: el aviso lo
     * publica la sincronización nativa, que ya lo comprueba al mostrarse.
     */
    private val permisoAvisosLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

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

        // Antes que nada se pinte: la frecuencia alta de la pantalla (hasta
        // 120 Hz). Ver FrecuenciaPantalla.
        aplicarFrecuencia()

        configurarWebView()
        configurarRefresco()
        configurarBotonAtras()
        configurarVentana()
        configurarInsets()

        binding.retryButton.setOnClickListener {
            ocultarError()
            portadaIntentada = false
            binding.webView.reload()
        }
        binding.serverButton.setOnClickListener { abrirAjustesDeServidor() }

        // Token de notificaciones push al día (si la build lleva Firebase).
        PushNotifications.refreshToken(this, prefs)

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

        // MENOS RELLENOS A PANTALLA COMPLETA POR FOTOGRAMA. El WebView ya es
        // opaco (línea de arriba) y cubre toda la ventana, así que el fondo de la
        // ventana se pinta debajo para nada. Con la interfaz llena de
        // `backdrop-filter` —que ya es cara de por sí— ese relleno de más se paga
        // en cada fotograma. Se quita aquí, no en el tema, porque el tema es quien
        // pinta la pantalla de arranque antes de que exista el WebView.
        window.setBackgroundDrawable(null)

        // Sin estirado al llegar al principio o al final de la página: la web
        // ya lo corta con `overscroll-behavior-y: none` y así tampoco lo dibuja
        // el WebView. (La app no tiene "deslizar para recargar": ver
        // configurarRefresco.)
        web.overScrollMode = View.OVER_SCROLL_NEVER

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
            // FLUIDEZ AL DESPLAZARSE. Por defecto el WebView solo rasteriza lo
            // que se ve: al desplazar tiene que rasterizar la franja que entra,
            // en el mismo fotograma, y ahí es donde se notan los tirones frente a
            // Chrome/PWA (que mantiene rasterizada un área mayor). Con esto el
            // WebView sigue rasterizando fuera de la ventana visible. Cuesta
            // memoria, que es justo lo que sobra en una app de una sola pantalla.
            setOffscreenPreRaster(true)
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
                ::bloquearRecarga,
                ::pedirPermisoPush,
                ::abrirSoloEnNavegador,
                { altoBarraEstadoCss },
                { altoBarraNavegacionCss },
                { centroCamaraCss },
                { radioEsquinaCss },
                { if (::atras.isInitialized) atras.paginaPintada() },
                ::cambiarBarraEstado,
                { abierto -> modalWebAbierto = abierto },
                ::pedirPermisoAvisos,
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
                // Antes que el login: watch.plex.tv es subdominio de plex.tv y
                // isProviderLogin lo dejaría dentro del WebView.
                WebOrigin.isPlexTitle(url) -> {
                    abrirEnPlex(url)
                    true
                }
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
            medidor?.nuevaPagina()
            // Una página nueva no hereda el panel abierto de la anterior: si la
            // web se fue con el bloqueo puesto, aquí se libera.
            recargaBloqueada = false
            modalWebAbierto = false
        }

        override fun onPageFinished(view: WebView, url: String?) {
            currentUrl = url.orEmpty()
            binding.refresh.isRefreshing = false
            listoParaPintar = true
            aplicarSinDesenfoques()
            // Guardar la última ruta permite volver donde estabas si el sistema
            // mata la app en segundo plano.
            if (WebOrigin.isInternal(url, origin)) prefs.lastUrl = url
        }

        /** El enrutado de Next no recarga la página: sin esto, la app no se
         *  enteraría de en qué sección está el usuario. */
        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            if (url != currentUrl) medidor?.nuevaPagina()
            currentUrl = url.orEmpty()
            atras.historialCambiado()
            atras.actualizar()
            if (WebOrigin.isInternal(url, origin)) prefs.lastUrl = url
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            if (!request.isForMainFrame) return
            // Antes del panel de error, la portada: con el servidor caído es la
            // copia guardada con más probabilidad, y la web enseña el aviso de
            // sin conexión en vez de una pantalla negra.
            if (!portadaIntentada && esOtraPaginaDelOrigen(request.url.toString())) {
                portadaIntentada = true
                view.post { view.loadUrl(origin) }
                return
            }
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
            atras.actualizar()
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
            atras.actualizar()
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

    // ------------------------------------------------------ notificaciones push

    private fun pedirPermisoPush() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            PushNotifications.permission(this) == "default"
        ) {
            permisoPushLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            responderPermisoPush()
        }
    }

    /** Lo mismo que hace el panel de Sync con su interruptor del aviso. */
    private fun pedirPermisoAvisos() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            permisoAvisosLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /** Contesta a la web con el permiso final, después de tener el token. */
    private fun responderPermisoPush() {
        val estado = PushNotifications.permission(this)
        val responder = {
            evaluarJs("window.__tsvPushPermissionResult && window.__tsvPushPermissionResult(${JSONObject.quote(estado)})")
        }
        if (estado == "granted") PushNotifications.refreshToken(this, prefs) { responder() } else responder()
    }

    // ------------------------------------------------------------- navegación

    /**
     * Atrás: vídeo a pantalla completa > página anterior de la web > salir.
     * Con gesto predictivo (ver AtrasPredictivo): solo se queda el gesto
     * cuando la web tiene adónde volver, y lo anima con una transición entre
     * páginas; si no, el sistema anima la salida.
     */
    @SuppressLint("ClickableViewAccessibility") // solo observa el toque
    private fun configurarBotonAtras() {
        val web = binding.webView
        atras = AtrasPredictivo(
            ventana = window,
            vista = binding.refresh,
            fondo = binding.root,
            colorFondo = ContextCompat.getColor(this, R.color.tsv_black),
            puedeVolver = { customView != null || web.canGoBack() },
            historial = {
                val lista = web.copyBackForwardList()
                FotosHistorial.Historial(
                    urls = List(lista.size) { lista.getItemAtIndex(it)?.url.orEmpty() },
                    indice = lista.currentIndex,
                )
            },
            // Con un modal de la web abierto, atrás solo lo cierra (la web lo
            // anima): ni encogido de la página ni foto de la anterior; el
            // gesto mueve el modal (modalAbierto, gestoModal).
            animable = { customView == null && !modalWebAbierto },
            // El gesto mueve entonces el panel del modal en la web (GestoModal).
            modalAbierto = { customView == null && modalWebAbierto },
            gestoModal = { fase, progreso, desdeIzquierda ->
                evaluarJs(GestoModal.js(fase, progreso, desdeIzquierda))
            },
            // Lo que la web acaba de pintar llega a pantalla en el siguiente
            // dibujado del WebView: entonces se puede quitar lo que lo tapa.
            confirmarPintado = { listo ->
                web.postVisualStateCallback(
                    0L,
                    object : WebView.VisualStateCallback() {
                        override fun onComplete(requestId: Long) = listo()
                    },
                )
            },
            volver = {
                if (customView != null) web.webChromeClient?.onHideCustomView() else web.goBack()
            },
            salir = ::finish,
        )
        onBackPressedDispatcher.addCallback(this, atras)
        // Cada toque guarda una foto de la página: si lleva a otra, es la que
        // se ve al volver atrás (ver AtrasPredictivo). No consume el toque.
        web.setOnTouchListener { _, evento ->
            if (evento.actionMasked == MotionEvent.ACTION_DOWN) atras.alTocar()
            false
        }
    }

    /**
     * Huecos de las barras y de la cámara. La app dibuja EDGE-TO-EDGE (ver
     * `configurarVentana`) con la barra de navegación visible y transparente y
     * la BARRA DE ESTADO OCULTA.
     *
     * La web no se rellena ni arriba ni abajo: arriba, su barra superior ocupa
     * la franja de la barra de estado, centrada en la cámara y sin logo (que
     * quedaría bajo ella), con los botones apartados de las esquinas
     * redondeadas (`--sv-android-camera-y`, `--sv-android-corner`); abajo pasa
     * por detrás de la barra de navegación y sube su barra inferior lo que
     * mide (`--sv-android-bottom`). Todo se le pasa aquí y por el puente
     * (`cameraCenterY()`, `screenCornerRadius()`, `navigationBarHeight()`). A
     * los lados sí se rellena (en horizontal, los botones de navegación y la
     * cámara van en un lateral).
     *
     * Los huecos de las barras se leen IGNORANDO SI SE VEN: al salir a
     * recientes o al ocultarlas un vídeo cambia su visibilidad, y un relleno que
     * siguiera ese cambio movía el WebView justo mientras el sistema capturaba
     * la miniatura (salía con la barra superior duplicada).
     *
     * El panel de error, nativo, esquiva barras y cámara con relleno.
     */
    private fun configurarInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.refresh) { view, insets ->
            val barras = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars())
            val camara = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            view.setPadding(
                maxOf(barras.left, camara.left),
                0,
                maxOf(barras.right, camara.right),
                0,
            )
            // El círculo de recarga y el medidor, por debajo de la cámara (y
            // de la barra de estado si se ve).
            val arriba = if (prefs.statusBarVisible) maxOf(barras.top, camara.top) else 0
            bajarIndicadorDeRecarga(maxOf(arriba, camara.top))
            binding.frameMeter.translationY = maxOf(arriba, camara.top).toFloat()
            pasarHuecosDeBarras(
                arriba,
                maxOf(barras.bottom, camara.bottom),
                centroDeLaCamara(insets),
                radioDeEsquina(insets),
            )
            insets
        }
        ViewCompat.setOnApplyWindowInsetsListener(binding.errorPanel) { view, insets ->
            val huecos = insets.getInsetsIgnoringVisibility(
                WindowInsetsCompat.Type.systemBars(),
            )
            val camara = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
            view.setPadding(
                maxOf(huecos.left, camara.left),
                maxOf(huecos.top, camara.top),
                maxOf(huecos.right, camara.right),
                maxOf(huecos.bottom, camara.bottom),
            )
            insets
        }
    }

    /**
     * Geometría de la parte superior y alto de la barra de navegación, en
     * píxeles CSS, para la web. Los lee el script de arranque del <head> por
     * el puente antes del primer pintado, y si cambian con la página ya
     * cargada (girar la pantalla, cambiar el modo de la barra de estado) se
     * le escriben directamente. Con la barra de estado OCULTA (modo por
     * defecto) su alto, para la web, es 0 y la web va en modo inmersivo
     * (`data-android-immersive`); VISIBLE, la web pasa por detrás de ella,
     * baja su barra superior su alto (`--sv-android-top`) y las portadas
     * empiezan justo debajo (`data-android-statusbar`).
     */
    @Volatile
    private var altoBarraEstadoCss = 0.0

    @Volatile
    private var altoBarraNavegacionCss = 0.0

    @Volatile
    private var centroCamaraCss = 0.0

    @Volatile
    private var radioEsquinaCss = 0.0

    private var barraEstadoVisibleEnWeb = false

    private fun pasarHuecosDeBarras(arriba: Int, abajo: Int, centroCamara: Int, radioEsquina: Int) {
        val densidad = resources.displayMetrics.density.toDouble()
        val estado = arriba / densidad
        val navegacion = abajo / densidad
        val camara = centroCamara / densidad
        val esquina = radioEsquina / densidad
        val visible = prefs.statusBarVisible
        if (
            visible == barraEstadoVisibleEnWeb &&
            estado == altoBarraEstadoCss &&
            navegacion == altoBarraNavegacionCss &&
            camara == centroCamaraCss &&
            esquina == radioEsquinaCss
        ) {
            return
        }
        // Las fichas miden dónde empieza su portada al cargar y al redimensionar:
        // si cambia la franja de arriba (modo de la barra de estado) sin que el
        // WebView cambie de tamaño, se les avisa con un `resize`.
        val cambiaArriba = visible != barraEstadoVisibleEnWeb || estado != altoBarraEstadoCss
        barraEstadoVisibleEnWeb = visible
        altoBarraEstadoCss = estado
        altoBarraNavegacionCss = navegacion
        centroCamaraCss = camara
        radioEsquinaCss = esquina
        evaluarJs(
            "var d=document.documentElement,s=d.style;" +
                (if (visible) "d.removeAttribute('data-android-immersive');d.setAttribute('data-android-statusbar','');"
                else "d.removeAttribute('data-android-statusbar');d.setAttribute('data-android-immersive','');") +
                "s.setProperty('--sv-android-top','${estado}px');" +
                "s.setProperty('--sv-android-bottom','${navegacion}px');" +
                (if (camara > 0) "s.setProperty('--sv-android-camera-y','${camara}px');"
                else "s.removeProperty('--sv-android-camera-y');") +
                "s.setProperty('--sv-android-corner','${esquina}px');" +
                (if (cambiaArriba) "window.dispatchEvent(new Event('resize'))" else ""),
        )
    }

    /**
     * Centro vertical de la cámara del borde SUPERIOR (su rectángulo de
     * recorte), en píxeles físicos; 0 si arriba no hay cámara (en horizontal
     * queda en un lateral).
     */
    private fun centroDeLaCamara(insets: WindowInsetsCompat): Int {
        val recorte = insets.displayCutout ?: return 0
        val arriba = recorte.boundingRects.filter { it.top <= 0 && it.height() > 0 }
        if (arriba.isEmpty() || recorte.safeInsetTop <= 0) return 0
        return arriba.maxOf { it.centerY() }
    }

    /** Radio de las esquinas superiores de la pantalla, en píxeles físicos. */
    private fun radioDeEsquina(insets: WindowInsetsCompat): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return 0
        val nativos = insets.toWindowInsets() ?: return 0
        val izquierda = nativos.getRoundedCorner(RoundedCorner.POSITION_TOP_LEFT)?.radius ?: 0
        val derecha = nativos.getRoundedCorner(RoundedCorner.POSITION_TOP_RIGHT)?.radius ?: 0
        return maxOf(izquierda, derecha)
    }

    /**
     * Baja el círculo de "deslizar para recargar" por debajo de la barra de
     * estado.
     *
     * SwipeRefreshLayout coloca ese círculo tomando como referencia su BORDE
     * SUPERIOR, sin tener en cuenta el relleno. Como aquí el relleno es el hueco
     * de la barra de estado, el círculo aparecía metido debajo del reloj y se
     * veía cortado por el borde. Se desplazan su posición inicial y su destino
     * justo esos píxeles.
     */
    private var desplazamientoIndicador = -1

    private fun bajarIndicadorDeRecarga(insetSuperior: Int) {
        if (desplazamientoIndicador == insetSuperior) return
        desplazamientoIndicador = insetSuperior
        val enDp = (insetSuperior / resources.displayMetrics.density).toInt()
        // Valores por defecto de SwipeRefreshLayout: empieza oculto justo encima
        // del borde (-40dp) y baja hasta 64dp.
        binding.refresh.setProgressViewOffset(false, INICIO_INDICADOR_DP + enDp, FIN_INDICADOR_DP + enDp)
    }

    // La web avisa por el puente de que tiene abierto un panel con scroll propio
    // (WebAppBridge.setPullToRefreshLocked). Ya no hace falta para nada: el
    // gesto de deslizar para recargar está quitado (ver configurarRefresco), pero
    // la web lo sigue llamando y se deja como no-op.
    private var recargaBloqueada = false

    private fun bloquearRecarga(bloqueada: Boolean) {
        recargaBloqueada = bloqueada
    }

    private fun configurarRefresco() {
        // SIN "deslizar hacia abajo para recargar". Arrastrar desde arriba del
        // todo recargaba la página entera por accidente (y perdía lo que tenías
        // abierto). El contenedor se queda en el layout, pero siempre
        // DESACTIVADO: así Android ni siquiera le pasa el táctil
        // (`onInterceptTouchEvent`) y los eventos van directos al WebView. Para
        // reintentar tras un error queda el botón de la pantalla de error.
        binding.refresh.isEnabled = false
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

    /**
     * Como [abrirEnNavegador], pero la pestaña va dirigida al navegador por su
     * paquete. Sin él, Android resuelve la URL y una app verificada para el
     * dominio (App Links) se la queda antes que el navegador: así pasaba con la
     * exportación de Letterboxd, que su app no tiene.
     */
    private fun abrirSoloEnNavegador(url: String) {
        val navegador = CustomTabsClient.getPackageName(this, null)
        try {
            val pestana = CustomTabsIntent.Builder().setShowTitle(true).build()
            if (navegador != null) pestana.intent.setPackage(navegador)
            pestana.launchUrl(this, Uri.parse(url))
        } catch (e: ActivityNotFoundException) {
            abrirEnNavegador(url)
        }
    }

    /**
     * Ficha de un título en Plex: se abre en la app de Plex si está instalada
     * (en su ficha exacta, no en el inicio). El intent va dirigido al paquete
     * porque Plex no tiene watch.plex.tv verificado como App Link y, sin
     * dirigirlo, Android lo resuelve al navegador. Sin la app, la ficha web.
     */
    private fun abrirEnPlex(url: String) {
        val plex = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            .addCategory(Intent.CATEGORY_BROWSABLE)
            .setPackage(WebOrigin.PLEX_PACKAGE)
        try {
            startActivity(plex)
        } catch (e: ActivityNotFoundException) {
            abrirEnNavegador(url)
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
        portadaIntentada = false
        binding.webView.loadUrl(url)
    }

    /** ¿Es una página de la web propia distinta de la portada? */
    private fun esOtraPaginaDelOrigen(url: String): Boolean {
        if (!WebOrigin.isInternal(url, origin)) return false
        return Uri.parse(url).path.orEmpty().trim('/').isNotEmpty()
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
    }

    private fun ocultarError() {
        binding.errorPanel.visibility = View.GONE
    }

    /**
     * Ventana EDGE-TO-EDGE (`enableEdgeToEdge`, barras TRANSPARENTES) que se
     * dibuja también dentro del recorte de la cámara, con la BARRA DE ESTADO
     * OCULTA: su franja la ocupa la barra superior de la web, centrada en la
     * cámara (ver `configurarInsets`). Deslizando desde el borde superior la
     * barra de estado aparece un momento por encima de la página. La barra de
     * navegación sigue visible y transparente, con la web por detrás. `dark` =
     * iconos claros, porque la web es oscura.
     */
    private fun configurarVentana() {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        aplicarBarraEstado()
    }

    /** Muestra u oculta la barra de estado según el modo elegido en Ajustes. */
    private fun aplicarBarraEstado() {
        if (prefs.statusBarVisible) {
            WindowCompat.getInsetsController(window, window.decorView)
                .show(WindowInsetsCompat.Type.statusBars())
        } else {
            ocultarBarras(WindowInsetsCompat.Type.statusBars())
        }
    }

    /**
     * Cambio de modo desde Ajustes (`WebAppBridge.setStatusBarVisible`, ya
     * guardado): la ventana y, al volver a pedir los huecos, la web.
     */
    private fun cambiarBarraEstado(@Suppress("UNUSED_PARAMETER") visible: Boolean) {
        aplicarBarraEstado()
        ViewCompat.requestApplyInsets(binding.refresh)
    }

    private fun ocultarBarras(tipos: Int) {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(tipos)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    /**
     * Solo para el vídeo a pantalla completa: oculta también la barra de
     * navegación y, al salir, la devuelve (y la de estado, si su modo es
     * visible).
     */
    private fun pantallaCompleta(activa: Boolean) {
        if (activa) {
            ocultarBarras(WindowInsetsCompat.Type.systemBars())
        } else {
            WindowCompat.getInsetsController(window, window.decorView)
                .show(WindowInsetsCompat.Type.navigationBars())
            aplicarBarraEstado()
        }
    }

    // ------------------------------------------------- diagnóstico (Rendimiento)

    private fun aplicarFrecuencia() {
        if (prefs.perfMaxRefresh) {
            FrecuenciaPantalla.pedirFluida(this)
        } else {
            FrecuenciaPantalla.soltar(this)
        }
    }

    private fun aplicarMedidor() {
        if (prefs.perfFrameMeter) {
            if (medidor == null) {
                medidor = MedidorFotogramas(this, binding.frameMeter).also { it.arrancar() }
            }
            binding.frameMeter.visibility = View.VISIBLE
        } else {
            medidor?.parar()
            medidor = null
            binding.frameMeter.visibility = View.GONE
        }
    }

    /**
     * Prueba "sin desenfoques": una hoja de estilo inyectada que apaga
     * `backdrop-filter` y `filter` en toda la web. Es lo más caro de pintar de la
     * ficha; si con esto va fluida, el problema es el coste de GPU de esos efectos
     * en el WebView. Va desde aquí para no tener que desplegar la web.
     * La navegación interna de Next no recarga el documento, así que basta con
     * aplicarla al terminar cada carga completa y al volver de los ajustes.
     */
    private fun aplicarSinDesenfoques() {
        val activo = prefs.perfNoBlur
        binding.webView.evaluateJavascript(
            """
            (function () {
              var id = 'tsv-perf-no-blur';
              var s = document.getElementById(id);
              if ($activo) {
                if (s) return;
                s = document.createElement('style');
                s.id = id;
                s.textContent = '*,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;filter:none!important}';
                (document.head || document.documentElement).appendChild(s);
              } else if (s) {
                s.remove();
              }
            })();
            """.trimIndent(),
            null,
        )
    }

    // ------------------------------------------------------------ ciclo de vida

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        // La pantalla puede haber cambiado mientras la app estaba detrás (un
        // plegable que se abre, otra pantalla): se vuelve a pedir su máximo.
        aplicarFrecuencia()
        // Los ajustes de diagnóstico se cambian en otra pantalla: al volver.
        aplicarMedidor()
        aplicarSinDesenfoques()
        aLaVista = this
        // Estando delante, la vigilancia del login sobra: la web reclama la
        // sesión al recuperar el foco.
        LoginWatcher.cancelar()
        // Volver de los ajustes nativos (permisos, servidor) puede haber cambiado
        // el origen: se comprueba sin recargar si no ha cambiado nada.
        val configurado = WebOrigin.normalize(prefs.webOrigin) ?: BuildConfig.DEFAULT_ORIGIN
        if (configurado != origin) aplicarOrigen(recargar = true)
    }

    override fun onPause() {
        if (aLaVista === this) aLaVista = null
        binding.webView.onPause()
        // Volcado a disco: sin esto se pierde la sesión si el sistema mata la app.
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        medidor?.parar()
        medidor = null
        binding.webView.apply {
            (parent as? ViewGroup)?.removeView(this)
            stopLoading()
            destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val INICIO_INDICADOR_DP = -40
        private const val FIN_INDICADOR_DP = 64

        /** Instancia que está delante del usuario, o null con la app en segundo plano. */
        @Volatile
        private var aLaVista: WebAppActivity? = null

        /**
         * Lanza `CustomEvent(nombre, { detail })` en la web si la app está a la
         * vista. [detalleJson] tiene que ser JSON válido. Devuelve false si no
         * hay nadie delante (entonces el aviso va a la barra de notificaciones).
         */
        fun enviarEventoALaWeb(nombre: String, detalleJson: String): Boolean {
            val actividad = aLaVista ?: return false
            actividad.evaluarJs(
                "window.dispatchEvent(new CustomEvent(${JSONObject.quote(nombre)}, { detail: $detalleJson }))",
            )
            return true
        }

        /** Intent explícito para abrir una URL de la web DENTRO de la app. */
        fun intentFor(context: Context, url: String): Intent =
            Intent(context, WebAppActivity::class.java).apply {
                data = Uri.parse(url)
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
    }
}
