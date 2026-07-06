package com.theshowverse.sync

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.result.contract.ActivityResultContracts
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.theshowverse.sync.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs

    private val notifPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = Prefs(this)
        requestNotifPermissionIfNeeded()

        binding.grantButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        binding.pauseSwitch.setOnCheckedChangeListener { _, checked ->
            prefs.paused = checked
            render()
        }
        binding.indicatorSwitch.setOnCheckedChangeListener { _, checked ->
            prefs.indicatorEnabled = checked
            if (checked) requestNotifPermissionIfNeeded()
        }
        binding.unpairButton.setOnClickListener {
            prefs.clearPairing()
            render()
        }
        binding.refreshButton.setOnClickListener { render() }
        binding.clearLogsButton.setOnClickListener {
            prefs.clearLogs()
            render()
        }
        binding.testButton.setOnClickListener { sendTest() }
    }

    /** Android 13+ requiere permiso en runtime para publicar la notificación. */
    private fun requestNotifPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics,
        ).toInt()

    /** Envía un visionado de prueba (película conocida) para verificar de punta a
     * punta el token + origen + backend, sin depender de la detección. */
    private fun sendTest() {
        val token = prefs.token
        val origin = prefs.origin
        if (token.isNullOrBlank() || origin.isNullOrBlank()) {
            prefs.addLog("Prueba: no vinculado (falta token/origen)")
            render()
            return
        }
        val test = PlaybackSignal(
            host = "test",
            platformId = "test",
            platformName = "Prueba",
            movieTitle = "Interstellar",
            tabTitle = "Interstellar",
        )
        prefs.addLog("Prueba enviada a $origin")
        SyncClient.send(origin, token, test) { ok, err, _ ->
            runOnUiThread {
                prefs.addLog(if (ok) "Prueba: ✓ OK (mira el historial)" else "Prueba: ✗ $err")
                render()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun hasNotificationAccess(): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(this).contains(packageName)

    private fun render() {
        val access = hasNotificationAccess()
        binding.pauseSwitch.isChecked = prefs.paused
        binding.indicatorSwitch.isChecked = prefs.indicatorEnabled
        binding.statusText.text = when {
            !prefs.isPaired() -> getString(R.string.status_not_paired)
            !access -> getString(R.string.status_no_access)
            prefs.paused -> getString(R.string.status_paused)
            else -> getString(R.string.status_active, prefs.origin ?: "")
        }
        binding.grantButton.visibility = if (access) View.GONE else View.VISIBLE
        renderLogs(prefs.logs())
        renderApps()
    }

    /** Pinta el registro con color por tipo: ✓ éxito (verde), ✗ error (rojo),
     * resto atenuado. Mucho más legible que un bloque monocromo. */
    private fun renderLogs(raw: String) {
        if (raw.isBlank()) {
            binding.logText.text = getString(R.string.log_empty)
            return
        }
        val success = ContextCompat.getColor(this, R.color.tsv_success)
        val error = ContextCompat.getColor(this, R.color.tsv_error)
        val muted = ContextCompat.getColor(this, R.color.tsv_muted)
        val sb = SpannableStringBuilder()
        raw.split("\n").forEachIndexed { i, line ->
            if (i > 0) sb.append("\n")
            val start = sb.length
            sb.append(line)
            val color = when {
                line.contains("✓") -> success
                line.contains("✗") -> error
                else -> muted
            }
            sb.setSpan(
                ForegroundColorSpan(color),
                start,
                sb.length,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
        }
        binding.logText.text = sb
    }

    private fun renderApps() {
        val container = binding.appsContainer
        container.removeAllViews()
        val packages = (Platforms.KNOWN.keys + prefs.seenPackages())
            .distinct()
            .sortedBy { Platforms.nameFor(it).lowercase() }

        for (pkg in packages) {
            val enabled = prefs.isEnabled(pkg)
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(8), 0, dp(8))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
            }
            // Punto con el color de marca de la plataforma; atenuado si está apagada.
            val dot = View(this).apply {
                layoutParams = LinearLayout.LayoutParams(dp(12), dp(12)).apply {
                    marginEnd = dp(12)
                }
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Platforms.colorFor(pkg))
                }
                alpha = if (enabled) 1f else 0.3f
            }
            val label = TextView(this).apply {
                text = Platforms.nameFor(pkg)
                alpha = if (enabled) 1f else 0.5f
                layoutParams = LinearLayout.LayoutParams(
                    0,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    1f,
                )
            }
            val toggle = SwitchCompat(this).apply {
                isChecked = enabled
                setOnCheckedChangeListener { _, checked ->
                    prefs.setEnabled(pkg, checked)
                    dot.alpha = if (checked) 1f else 0.3f
                    label.alpha = if (checked) 1f else 0.5f
                }
            }
            row.addView(dot)
            row.addView(label)
            row.addView(toggle)
            container.addView(row)
        }
    }
}
