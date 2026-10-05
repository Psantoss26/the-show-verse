package com.theshowverse.sync

import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.text.format.DateUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import java.time.Instant

/**
 * REGISTRO DE DETECCIONES del móvil: lo que han detectado los servicios en los
 * últimos 7 días, para corregir lo que no era (también lo que ya no tiene
 * notificación, porque cada título nuevo sustituye al anterior).
 *
 * Es de la app y no de la web: lo usan The Show Verse Sync y la app completa,
 * con el token de vinculación. La web solo enseña las de la extensión.
 *
 * Interfaz en código, como ServerActivity: una lista corta de filas.
 */
class DeteccionesActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var api: DeteccionesApi
    private lateinit var estado: TextView
    private lateinit var filas: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        api = DeteccionesApi(prefs)

        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
        }
        raiz.addView(
            TextView(this).apply {
                text = getString(R.string.detections_title)
                textSize = 20f
                setTypeface(typeface, Typeface.BOLD)
            },
        )
        raiz.addView(
            TextView(this).apply {
                text = getString(R.string.detections_intro)
                textSize = 13f
                alpha = 0.7f
                setPadding(0, dp(6), 0, dp(12))
            },
        )
        estado = TextView(this).apply {
            textSize = 14f
            setPadding(0, dp(8), 0, dp(8))
        }
        raiz.addView(estado)
        filas = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        raiz.addView(filas)
        raiz.addView(
            Button(this).apply {
                text = getString(R.string.refresh)
                setOnClickListener { cargar() }
            },
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(16) },
        )

        setContentView(ScrollView(this).apply { addView(raiz) })
    }

    // Al volver de una corrección la lista ya ha cambiado.
    override fun onResume() {
        super.onResume()
        cargar()
    }

    private fun cargar() {
        if (filas.childCount == 0) mostrarEstado(getString(R.string.detections_loading))
        api.lista { resultado ->
            if (isFinishing || isDestroyed) return@lista
            when (resultado) {
                is DeteccionesApi.Resultado.Ok -> pintar(resultado.valor)
                is DeteccionesApi.Resultado.Error -> {
                    filas.removeAllViews()
                    mostrarEstado(
                        if (resultado.sinVincular) getString(R.string.detections_not_paired)
                        else resultado.mensaje,
                    )
                }
            }
        }
    }

    private fun pintar(lista: List<Deteccion>) {
        filas.removeAllViews()
        if (lista.isEmpty()) {
            mostrarEstado(getString(R.string.detections_empty))
            return
        }
        estado.visibility = View.GONE
        lista.forEach { filas.addView(fila(it)) }
    }

    private fun mostrarEstado(texto: String) {
        estado.text = texto
        estado.visibility = View.VISIBLE
    }

    private fun fila(d: Deteccion): View {
        val fila = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(8), 0, dp(8))
            isClickable = true
            isFocusable = true
            background = fondoPulsable()
            contentDescription = "${d.title ?: getString(R.string.detections_untitled)}. ${getString(R.string.detections_fix)}"
            setOnClickListener { startActivity(CorreccionActivity.intentFor(this@DeteccionesActivity, d.id)) }
        }
        val portada = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            setBackgroundColor(ContextCompat.getColor(this@DeteccionesActivity, R.color.tsv_row))
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        Portadas.en(portada, d.posterPath)
        fila.addView(portada, LinearLayout.LayoutParams(dp(44), dp(64)).apply { marginEnd = dp(12) })

        val textos = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        textos.addView(
            TextView(this).apply {
                text = d.title ?: getString(R.string.detections_untitled)
                textSize = 15f
                setTypeface(typeface, Typeface.BOLD)
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            },
        )
        textos.addView(
            TextView(this).apply {
                text = DeteccionesTexto.detalle(this@DeteccionesActivity, d)
                textSize = 12f
                alpha = 0.75f
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            },
        )
        textos.addView(
            TextView(this).apply {
                text = DeteccionesTexto.hace(d.createdAt)
                textSize = 12f
                alpha = 0.55f
            },
        )
        DeteccionesJson.estado(d)?.let { etiqueta ->
            textos.addView(
                TextView(this).apply {
                    text = etiqueta
                    textSize = 12f
                    setTypeface(typeface, Typeface.BOLD)
                    setTextColor(ContextCompat.getColor(this@DeteccionesActivity, R.color.tsv_success))
                },
            )
        }
        fila.addView(textos, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        fila.addView(
            TextView(this).apply {
                text = getString(if (d.status == "corrected") R.string.detections_change else R.string.detections_fix)
                textSize = 12f
                setTypeface(typeface, Typeface.BOLD)
                alpha = 0.7f
                setPadding(dp(8), 0, 0, 0)
            },
        )
        return fila
    }

    private fun fondoPulsable() = TypedValue().let { valor ->
        theme.resolveAttribute(android.R.attr.selectableItemBackground, valor, true)
        ContextCompat.getDrawable(this, valor.resourceId)
    }

    private fun dp(value: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value.toFloat(),
        resources.displayMetrics,
    ).toInt()

    companion object {
        fun intentFor(context: Context): Intent = Intent(context, DeteccionesActivity::class.java)
    }
}

/** Textos de una detección compartidos por la lista y la corrección. */
object DeteccionesTexto {

    /** «Ficha · Netflix · T1 · E2». */
    fun detalle(context: Context, d: Deteccion): String {
        val tipo = context.getString(
            if (d.kind == "detail") R.string.detections_kind_detail else R.string.detections_kind_playback,
        )
        val partes = mutableListOf(tipo, DeteccionesJson.plataforma(d.platform))
        if (d.season != null && d.episode != null) partes += "T${d.season} · E${d.episode}"
        return partes.joinToString(" · ")
    }

    /** «hace 5 minutos», en el idioma del sistema. */
    fun hace(createdAt: String): String = try {
        DateUtils.getRelativeTimeSpanString(
            Instant.parse(createdAt).toEpochMilli(),
            System.currentTimeMillis(),
            DateUtils.MINUTE_IN_MILLIS,
        ).toString()
    } catch (e: Exception) {
        ""
    }
}
