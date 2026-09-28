package com.theshowverse.sync

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/**
 * Recibe los avisos de FCM. El backend manda mensajes SOLO de datos
 * (backend/src/lib/push.js), así que este método se ejecuta siempre, con la app
 * delante o cerrada, y es el que decide dónde se enseña el aviso.
 */
class PushMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        Prefs(this).pushToken = token
        // Si la web está abierta, que registre ya el token nuevo.
        WebAppActivity.enviarEventoALaWeb("tsv:push-token", JSONObject.quote(token))
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["title"].isNullOrBlank()) return
        // App a la vista: ventana emergente dentro de la web.
        if (WebAppActivity.enviarEventoALaWeb("tsv:push", JSONObject(data as Map<*, *>).toString())) return
        PushNotifications.show(this, data)
    }
}
