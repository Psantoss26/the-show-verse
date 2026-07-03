package com.theshowverse.sync

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.app.NotificationManagerCompat
import com.theshowverse.sync.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = Prefs(this)

        binding.grantButton.setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        binding.pauseSwitch.setOnCheckedChangeListener { _, checked ->
            prefs.paused = checked
            render()
        }
        binding.unpairButton.setOnClickListener {
            prefs.clearPairing()
            render()
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
        binding.statusText.text = when {
            !prefs.isPaired() -> getString(R.string.status_not_paired)
            !access -> getString(R.string.status_no_access)
            prefs.paused -> getString(R.string.status_paused)
            else -> getString(R.string.status_active, prefs.origin ?: "")
        }
        binding.grantButton.visibility = if (access) View.GONE else View.VISIBLE
        renderApps()
    }

    private fun renderApps() {
        val container = binding.appsContainer
        container.removeAllViews()
        val packages = (Platforms.KNOWN.keys + prefs.seenPackages())
            .distinct()
            .sortedBy { Platforms.nameFor(it).lowercase() }

        for (pkg in packages) {
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                )
            }
            val label = TextView(this).apply {
                text = Platforms.nameFor(pkg)
                layoutParams = LinearLayout.LayoutParams(
                    0,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    1f,
                )
            }
            val toggle = SwitchCompat(this).apply {
                isChecked = prefs.isEnabled(pkg)
                setOnCheckedChangeListener { _, checked -> prefs.setEnabled(pkg, checked) }
            }
            row.addView(label)
            row.addView(toggle)
            container.addView(row)
        }
    }
}
