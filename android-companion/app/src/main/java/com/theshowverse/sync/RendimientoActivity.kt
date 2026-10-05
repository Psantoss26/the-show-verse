package com.theshowverse.sync

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat

/**
 * DIAGNÓSTICO de la fluidez de la web dentro de la app.
 *
 * La ficha va fluida en la PWA y a tirones aquí. Cada interruptor quita UNA de
 * las diferencias sospechosas, y el medidor dice si eso cambia algo. Se aplican
 * al volver a la web, sin recargar.
 *
 * La interfaz va en código, como en ServerActivity: son cuatro filas.
 */
class RendimientoActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
        }

        raiz.addView(
            TextView(this).apply {
                text = getString(R.string.perf_title)
                textSize = 20f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setPadding(0, 0, 0, dp(8))
            },
            ancho(),
        )
        raiz.addView(etiqueta(getString(R.string.perf_intro)))

        raiz.addView(
            interruptor(R.string.perf_meter, R.string.perf_meter_hint, prefs.perfFrameMeter) {
                prefs.perfFrameMeter = it
            },
        )
        raiz.addView(
            interruptor(R.string.perf_max_refresh, R.string.perf_max_refresh_hint, prefs.perfMaxRefresh) {
                prefs.perfMaxRefresh = it
            },
        )
        raiz.addView(
            interruptor(R.string.perf_no_blur, R.string.perf_no_blur_hint, prefs.perfNoBlur) {
                prefs.perfNoBlur = it
            },
        )

        raiz.addView(etiqueta(getString(R.string.perf_a11y_hint), topDp = 20))
        raiz.addView(
            Button(this).apply {
                text = getString(R.string.a11y_open_settings)
                setOnClickListener {
                    try {
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                    } catch (e: Exception) {
                        /* Fabricante sin esa pantalla. */
                    }
                }
            },
            ancho(topDp = 4),
        )

        setContentView(ScrollView(this).apply { addView(raiz) })
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    // ------------------------------------------------------------------ ayudas

    private fun interruptor(
        titulo: Int,
        ayuda: Int,
        activo: Boolean,
        alCambiar: (Boolean) -> Unit,
    ): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(16), 0, 0)
        addView(
            SwitchCompat(this@RendimientoActivity).apply {
                text = getString(titulo)
                textSize = 16f
                isChecked = activo
                setOnCheckedChangeListener { _, valor -> alCambiar(valor) }
            },
            ancho(),
        )
        addView(etiqueta(getString(ayuda)))
    }

    private fun etiqueta(texto: String, topDp: Int = 0): TextView =
        TextView(this).apply {
            text = texto
            textSize = 13f
            alpha = 0.7f
            setPadding(0, dp(topDp), 0, dp(6))
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
}
