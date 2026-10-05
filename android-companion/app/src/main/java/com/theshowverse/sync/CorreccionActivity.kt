package com.theshowverse.sync

import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * CORRECCIÓN de una detección del móvil: «no había ninguna ficha» o «era otro
 * título» (con buscador, y temporada/episodio si es una serie). Lo mismo que la
 * página web de corrección, en nativo y con el token de vinculación: es lo que
 * abre el botón «No es correcto» del aviso y cada fila del registro.
 *
 * Al guardar, el servidor mueve o borra lo que guardó esa detección y aprende
 * para la próxima vez (ver backend routes/streamingDetections.js).
 */
class CorreccionActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var api: DeteccionesApi
    private lateinit var detectionId: String

    private lateinit var raiz: LinearLayout
    private lateinit var estado: TextView
    private lateinit var formulario: LinearLayout
    private lateinit var resumen: LinearLayout
    private lateinit var veredictos: RadioGroup
    private lateinit var seccionOtro: LinearLayout
    private lateinit var noSeCual: CheckBox
    private lateinit var buscador: EditText
    private lateinit var resultados: LinearLayout
    private lateinit var elegido: TextView
    private lateinit var seccionEpisodio: LinearLayout
    private lateinit var temporada: EditText
    private lateinit var episodio: EditText
    private lateinit var noSeEpisodio: CheckBox
    private lateinit var guardar: Button

    private var deteccion: Deteccion? = null
    private var tituloElegido: TituloEncontrado? = null
    private var guardando = false

    private val principal = Handler(Looper.getMainLooper())
    private var busquedaPendiente: Runnable? = null
    /** La última búsqueda lanzada: las respuestas de otras anteriores se ignoran. */
    private var ultimaBusqueda = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        api = DeteccionesApi(prefs)
        val id = intent.getStringExtra(EXTRA_ID)
        if (id == null || !DetailsUrl.isDetectionId(id)) {
            finish()
            return
        }
        detectionId = id

        construir()
        setContentView(ScrollView(this).apply { addView(raiz) })
        cargar()
    }

    override fun onDestroy() {
        busquedaPendiente?.let { principal.removeCallbacks(it) }
        super.onDestroy()
    }

    // ------------------------------------------------------------------ carga

    private fun cargar() {
        estado.text = getString(R.string.detections_loading)
        estado.visibility = View.VISIBLE
        formulario.visibility = View.GONE
        api.una(detectionId) { resultado ->
            if (isFinishing || isDestroyed) return@una
            when (resultado) {
                is DeteccionesApi.Resultado.Ok -> mostrar(resultado.valor)
                is DeteccionesApi.Resultado.Error -> estado.text =
                    if (resultado.sinVincular) getString(R.string.detections_not_paired) else resultado.mensaje
            }
        }
    }

    private fun mostrar(d: Deteccion) {
        deteccion = d
        estado.visibility = View.GONE
        formulario.visibility = View.VISIBLE
        pintarResumen(d)
        // Temporada y episodio que leyó el reproductor: suelen ser buenos aunque
        // el título no lo fuera.
        d.detectedSeason?.let { temporada.setText(it.toString()) }
        d.detectedEpisode?.let { episodio.setText(it.toString()) }
        actualizar()
    }

    private fun pintarResumen(d: Deteccion) {
        resumen.removeAllViews()
        val portada = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundColor(ContextCompat.getColor(this@CorreccionActivity, R.color.tsv_row))
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        Portadas.en(portada, d.posterPath)
        resumen.addView(portada, LinearLayout.LayoutParams(dp(64), dp(96)).apply { marginEnd = dp(12) })
        val textos = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        textos.addView(texto(getString(R.string.correction_detected), 12f, alpha = 0.6f))
        textos.addView(texto(d.title ?: getString(R.string.detections_untitled), 16f, negrita = true))
        textos.addView(texto(DeteccionesTexto.detalle(this, d), 12f, alpha = 0.75f))
        if (d.triggerText.isNotBlank()) {
            textos.addView(texto(getString(R.string.correction_read_text, d.triggerText), 12f, alpha = 0.6f))
        }
        DeteccionesJson.estado(d)?.let {
            textos.addView(
                texto(it, 12f, negrita = true).apply {
                    setTextColor(ContextCompat.getColor(this@CorreccionActivity, R.color.tsv_success))
                },
            )
        }
        resumen.addView(textos, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    }

    // ------------------------------------------------------------- formulario

    private fun construir() {
        raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
        }
        raiz.addView(texto(getString(R.string.correction_title), 20f, negrita = true))
        estado = texto("", 14f).apply { setPadding(0, dp(12), 0, 0) }
        raiz.addView(estado)

        formulario = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        raiz.addView(formulario)

        resumen = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(16), 0, dp(16))
        }
        formulario.addView(resumen)

        formulario.addView(texto(getString(R.string.correction_question), 15f, negrita = true))
        veredictos = RadioGroup(this).apply { orientation = RadioGroup.VERTICAL }
        val noEra = RadioButton(this).apply {
            id = View.generateViewId()
            text = getString(R.string.correction_not_a_title)
        }
        val otro = RadioButton(this).apply {
            id = View.generateViewId()
            text = getString(R.string.correction_wrong_title)
        }
        veredictos.addView(noEra)
        veredictos.addView(otro)
        veredictos.setOnCheckedChangeListener { _, _ -> actualizar() }
        formulario.addView(veredictos)

        seccionOtro = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(8), 0, 0)
            visibility = View.GONE
        }
        formulario.addView(seccionOtro)

        noSeCual = CheckBox(this).apply {
            text = getString(R.string.correction_unknown_title)
            setOnCheckedChangeListener { _, _ -> actualizar() }
        }
        seccionOtro.addView(noSeCual)

        buscador = EditText(this).apply {
            hint = getString(R.string.correction_search_hint)
            inputType = InputType.TYPE_CLASS_TEXT
            setSingleLine()
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
                override fun afterTextChanged(s: Editable?) = programarBusqueda(s?.toString().orEmpty())
            })
        }
        seccionOtro.addView(buscador, ancho())
        resultados = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        seccionOtro.addView(resultados)
        elegido = texto("", 14f, negrita = true).apply {
            setPadding(0, dp(8), 0, 0)
            visibility = View.GONE
        }
        seccionOtro.addView(elegido)

        seccionEpisodio = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(8), 0, 0)
            visibility = View.GONE
        }
        seccionOtro.addView(seccionEpisodio)
        val numeros = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        temporada = campoNumero(getString(R.string.correction_season))
        episodio = campoNumero(getString(R.string.correction_episode))
        numeros.addView(temporada, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(8) })
        numeros.addView(episodio, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        seccionEpisodio.addView(numeros)
        noSeEpisodio = CheckBox(this).apply {
            text = getString(R.string.correction_unknown_episode)
            setOnCheckedChangeListener { _, _ -> actualizar() }
        }
        seccionEpisodio.addView(noSeEpisodio)

        guardar = Button(this).apply {
            text = getString(R.string.correction_save)
            setOnClickListener { enviar() }
        }
        formulario.addView(guardar, ancho(topDp = 20))
    }

    private fun campoNumero(pista: String) = EditText(this).apply {
        hint = pista
        inputType = InputType.TYPE_CLASS_NUMBER
        setSingleLine()
        addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) = Unit
            override fun afterTextChanged(s: Editable?) = actualizar()
        })
    }

    private fun veredicto(): CorreccionPedida? {
        val marcado = veredictos.checkedRadioButtonId
        if (marcado == View.NO_ID) return null
        val noEraTitulo = veredictos.getChildAt(0).id == marcado
        if (noEraTitulo) return CorreccionPedida.NoEraTitulo
        if (noSeCual.isChecked) return CorreccionPedida.OtroTitulo(null, null, null)
        val titulo = tituloElegido ?: return null
        if (titulo.mediaType != "tv" || noSeEpisodio.isChecked) return CorreccionPedida.OtroTitulo(titulo, null, null)
        val t = temporada.text.toString().toIntOrNull()?.takeIf { it > 0 }
        val e = episodio.text.toString().toIntOrNull()?.takeIf { it > 0 }
        // Uno sin el otro no identifica un episodio: se pide completar o marcar
        // «no sé el episodio».
        if ((t == null) != (e == null)) return null
        return CorreccionPedida.OtroTitulo(titulo, t, e)
    }

    /** Muestra lo que toca según lo elegido y habilita guardar si está completo. */
    private fun actualizar() {
        val marcado = veredictos.checkedRadioButtonId
        val otro = marcado != View.NO_ID && veredictos.getChildAt(1).id == marcado
        seccionOtro.visibility = if (otro) View.VISIBLE else View.GONE
        val buscando = otro && !noSeCual.isChecked
        buscador.visibility = if (buscando) View.VISIBLE else View.GONE
        resultados.visibility = if (buscando) View.VISIBLE else View.GONE
        elegido.visibility = if (buscando && tituloElegido != null) View.VISIBLE else View.GONE
        seccionEpisodio.visibility =
            if (buscando && tituloElegido?.mediaType == "tv") View.VISIBLE else View.GONE
        temporada.isEnabled = !noSeEpisodio.isChecked
        episodio.isEnabled = !noSeEpisodio.isChecked
        guardar.isEnabled = !guardando && deteccion != null && veredicto() != null
    }

    // --------------------------------------------------------------- búsqueda

    private fun programarBusqueda(texto: String) {
        busquedaPendiente?.let { principal.removeCallbacks(it) }
        val q = texto.trim()
        if (q.length < 2) {
            ultimaBusqueda = ""
            resultados.removeAllViews()
            return
        }
        val tarea = Runnable { buscar(q) }
        busquedaPendiente = tarea
        principal.postDelayed(tarea, BUSQUEDA_ESPERA_MS)
    }

    private fun buscar(q: String) {
        ultimaBusqueda = q
        api.buscarTitulos(q) { resultado ->
            if (isFinishing || isDestroyed || q != ultimaBusqueda) return@buscarTitulos
            resultados.removeAllViews()
            when (resultado) {
                is DeteccionesApi.Resultado.Ok ->
                    if (resultado.valor.isEmpty()) {
                        resultados.addView(texto(getString(R.string.correction_no_results), 13f, alpha = 0.7f))
                    } else {
                        resultado.valor.forEach { resultados.addView(filaResultado(it)) }
                    }
                is DeteccionesApi.Resultado.Error ->
                    resultados.addView(texto(resultado.mensaje, 13f, alpha = 0.7f))
            }
        }
    }

    private fun filaResultado(t: TituloEncontrado): View {
        val fila = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(6), 0, dp(6))
            isClickable = true
            isFocusable = true
            background = fondoPulsable()
            setOnClickListener { elegir(t) }
        }
        val portada = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundColor(ContextCompat.getColor(this@CorreccionActivity, R.color.tsv_row))
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        Portadas.en(portada, t.posterPath)
        fila.addView(portada, LinearLayout.LayoutParams(dp(36), dp(54)).apply { marginEnd = dp(10) })
        fila.addView(
            texto(etiquetaTitulo(t), 14f),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
        )
        return fila
    }

    private fun etiquetaTitulo(t: TituloEncontrado): String {
        val tipo = getString(if (t.mediaType == "tv") R.string.correction_type_tv else R.string.correction_type_movie)
        return listOfNotNull(t.title, t.year?.toString(), tipo).joinToString(" · ")
    }

    private fun elegir(t: TituloEncontrado) {
        tituloElegido = t
        elegido.text = getString(R.string.correction_chosen, etiquetaTitulo(t))
        resultados.removeAllViews()
        actualizar()
    }

    // ----------------------------------------------------------------- enviar

    private fun enviar() {
        val pedida = veredicto() ?: return
        guardando = true
        actualizar()
        api.corregir(detectionId, pedida) { resultado ->
            if (isFinishing || isDestroyed) return@corregir
            guardando = false
            when (resultado) {
                is DeteccionesApi.Resultado.Ok -> {
                    // Lo mismo que hace la web dentro de la app (WebAppBridge):
                    // la ficha recordada pudo ser la equivocada, y la lista de
                    // textos que no son títulos ha podido cambiar.
                    RecentDetail.forgetAfterCorrection()
                    NotATitleList.refreshIfStale(prefs, force = true)
                    prefs.addLog("Detección corregida en la app")
                    Toast.makeText(this, R.string.correction_saved, Toast.LENGTH_SHORT).show()
                    finish()
                }
                is DeteccionesApi.Resultado.Error -> {
                    Toast.makeText(this, resultado.mensaje, Toast.LENGTH_LONG).show()
                    actualizar()
                }
            }
        }
    }

    // ------------------------------------------------------------------ ayudas

    private fun texto(valor: String, tamano: Float, negrita: Boolean = false, alpha: Float = 1f) =
        TextView(this).apply {
            text = valor
            textSize = tamano
            this.alpha = alpha
            if (negrita) setTypeface(typeface, Typeface.BOLD)
        }

    private fun fondoPulsable() = TypedValue().let { valor ->
        theme.resolveAttribute(android.R.attr.selectableItemBackground, valor, true)
        ContextCompat.getDrawable(this, valor.resourceId)
    }

    private fun ancho(topDp: Int = 0) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(topDp) }

    private fun dp(value: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        resources.displayMetrics,
    ).toInt()

    companion object {
        private const val EXTRA_ID = "detectionId"
        private const val BUSQUEDA_ESPERA_MS = 400L

        fun intentFor(context: Context, detectionId: String): Intent =
            Intent(context, CorreccionActivity::class.java).putExtra(EXTRA_ID, detectionId)
    }
}
