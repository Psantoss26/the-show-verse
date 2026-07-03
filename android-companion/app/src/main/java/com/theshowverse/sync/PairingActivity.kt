package com.theshowverse.sync

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast

/** Recibe theshowverse://pair?token=&origin=, guarda las credenciales y abre la app. */
class PairingActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val data = intent?.data
        val token = data?.getQueryParameter("token")
        val origin = data?.getQueryParameter("origin")

        if (!token.isNullOrBlank() && !origin.isNullOrBlank()) {
            val prefs = Prefs(this)
            prefs.token = token
            prefs.origin = origin
            Toast.makeText(this, R.string.paired_ok, Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(this, R.string.paired_fail, Toast.LENGTH_LONG).show()
        }

        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        finish()
    }
}
