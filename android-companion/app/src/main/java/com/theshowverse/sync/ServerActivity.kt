package com.theshowverse.sync

import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Ajustes de servidor: a qué origen apunta la app y, si ese servidor tiene el
 * gate de acceso privado activado, con qué clave se autoriza el dispositivo.
 *
 * Existe por dos motivos concretos:
 *  - Probar una versión de la web (NAS por IP, `next dev` con `adb reverse`)
 *    sin recompilar la app.
 *  - Desatascar el caso en que theshowverse.com responde 404 a todo porque este
 *    dispositivo no está autorizado: sin esta pantalla la app sería un ladrillo.
 *
 * La interfaz se construye en código a propósito: son cuatro campos y así no
 * arrastra un layout más que mantener.
 */
class ServerActivity : AppCompatActivity() {

    private lateinit var prefs: Prefs
    private lateinit var origenInput: EditText
    private lateinit var claveInput: EditText

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
                text = getString(R.string.server_title)
                textSize = 20f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setPadding(0, 0, 0, dp(16))
            },
            ancho(),
        )
        raiz.addView(
            etiqueta(getString(R.string.server_origin_label), bold = true),
        )
        raiz.addView(etiqueta(getString(R.string.server_origin_hint)))
        origenInput = EditText(this).apply {
            setText(prefs.webOrigin ?: BuildConfig.DEFAULT_ORIGIN)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine()
        }
        raiz.addView(origenInput, ancho())

        raiz.addView(
            etiqueta(getString(R.string.server_key_label), bold = true, topDp = 24),
        )
        raiz.addView(etiqueta(getString(R.string.server_key_hint)))
        claveInput = EditText(this).apply {
            setText(prefs.accessKey.orEmpty())
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine()
        }
        raiz.addView(claveInput, ancho())

        raiz.addView(
            Button(this).apply {
                text = getString(R.string.server_save)
                setOnClickListener { guardar() }
            },
            ancho(topDp = 24),
        )
        raiz.addView(
            Button(this).apply {
                text = getString(R.string.server_reset)
                setOnClickListener {
                    origenInput.setText(BuildConfig.DEFAULT_ORIGIN)
                    claveInput.setText("")
                }
            },
            ancho(topDp = 8),
        )

        setContentView(ScrollView(this).apply { addView(raiz) })
    }

    private fun guardar() {
        val normalizado = WebOrigin.normalize(origenInput.text?.toString())
        if (normalizado == null) {
            Toast.makeText(this, R.string.server_invalid, Toast.LENGTH_LONG).show()
            return
        }
        prefs.webOrigin = normalizado
        prefs.accessKey = claveInput.text?.toString()?.trim().orEmpty().ifBlank { null }
        // Al cambiar de servidor, la última página guardada ya no vale.
        prefs.lastUrl = null
        setResult(RESULT_OK)
        finish()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    // ------------------------------------------------------------------ ayudas

    private fun etiqueta(texto: String, bold: Boolean = false, topDp: Int = 0): TextView =
        TextView(this).apply {
            text = texto
            textSize = if (bold) 16f else 13f
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
            alpha = if (bold) 1f else 0.7f
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
