# Notificaciones: dentro de la app y en el dispositivo

Los avisos (progreso sincronizado, vistos, series completadas, recordatorios de
puntuar y reseñar) salen de la misma fuente que la campana del navbar:
`getUserNotifications` en `backend/src/lib/notifications.js`. Hay dos formas de
enseñarlos:

| Situación | Dónde se ve | Cómo llega |
|---|---|---|
| App abierta y a la vista | Ventana emergente dentro de la app (`InAppNotifications`) | Push (instantáneo) o, sin push, sondeo de la campana cada minuto |
| App cerrada o en segundo plano | Notificación del sistema | Web Push (navegador, PWA, escritorio) o FCM (app de Android) |

Además, **cualquier acción hecha en la web** (favoritas, pendientes, notas,
vistos, listas, reseñas, seguir, ajustes, conexiones…) muestra su ventana
emergente al terminar bien. `installActionFeedback`
(`src/lib/notifications/actionFeedbackClient.js`) envuelve `fetch` y las reglas
de `src/lib/notifications/actionFeedback.js` traducen cada petición de escritura
a `/api/*` en un aviso. Una ruta nueva que modifique algo solo necesita su regla
allí. Otras partes de la web pueden avisar con `showToast(...)`.

Todas las ventanas emergentes usan el mismo diseño liquid glass
(`LIQUID_GLASS_PANEL`), con los colores de cada sección.

## Flujo

1. Un cambio que puede generar una alerta termina bien:
   - visto manual: `POST /v1/history/*`;
   - progreso con sesión: `POST /v1/progress`;
   - sincronización con token del dispositivo: `/v1/auth/netflix/{sync,progress,sync/batch}`
     (marcan `req.pushUserId`).
2. `plugins/pushDispatch.js` (hook `onResponse`) programa un despacho para ese
   usuario. Las llamadas seguidas (una temporada marcada, un lote) se agrupan en
   un solo despacho a los 4 s.
3. `lib/push.js` recalcula las alertas y `lib/pushMessages.js` elige las de los
   últimos 15 minutos que no se hayan enviado (`push_deliveries`). Las del
   mismo título van en una sola notificación: *"Has terminado S01E03. Puntúa
   el episodio S01E03"*.
4. Se envía a cada dispositivo de `push_subscriptions`. Los destinos que el
   servicio da por muertos (404/410, `UNREGISTERED`) se borran.
5. En el dispositivo:
   - **Navegador:** `public/sw.js`. Si hay una pestaña a la vista, le pasa el
     mensaje (`TSV_PUSH`) y no pinta nada; si no, `showNotification`. Al tocar
     la notificación se enfoca la app y navega con el router (`TSV_NAVIGATE`).
   - **Android:** `PushMessagingService`. Los mensajes son solo de datos, así
     que siempre los recibe el nativo: con la app delante lanza el evento
     `tsv:push` en la web; si no, pinta la notificación con la portada.

El usuario activa las notificaciones del dispositivo en **Ajustes → Preferencias →
Notificaciones en este dispositivo**, donde también puede enviar una prueba. Las
ventanas emergentes dentro de la app funcionan sin activar nada.

## Puesta en marcha

### Web Push (navegador, PWA, escritorio)

```sh
cd backend
npx web-push generate-vapid-keys
```

Variables del backend (Railway):

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@theshowverse.com
```

La clave pública llega al navegador por `GET /api/push/config`; no hace falta
ninguna variable `NEXT_PUBLIC_*`. **No cambies las claves una vez en
producción**: las suscripciones existentes dejarían de funcionar y cada
dispositivo tendría que volver a activarlas.

El service worker solo se registra en producción (`PwaManager`), así que en
`npm run dev` el interruptor avisa de que no hay service worker.

### Firebase Cloud Messaging (app de Android)

1. En la [consola de Firebase](https://console.firebase.google.com/), crea un
   proyecto (o usa uno existente) y añade una app **Android** con el paquete
   `com.theshowverse.app`.
2. Descarga `google-services.json` y guárdalo en
   `android-companion/app/google-services.json`. Sin ese fichero la app compila
   igual, pero sin push (`BuildConfig.PUSH_CONFIGURED = false`) y la web no
   ofrece la opción.
3. En **Configuración del proyecto → Cuentas de servicio**, genera una clave
   privada nueva (JSON). Ponla en el backend, en una línea o en base64:

   ```env
   FCM_SERVICE_ACCOUNT_JSON=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Ii...
   ```

   Esta clave **sí es secreta**: solo en las variables de Railway, nunca en git.
4. Compila y publica una versión nueva de la app.

## Comprobar

- `GET /v1/push/config` → `{ webPushPublicKey, web: true, fcm: true }` cuando
  todo está configurado.
- Ajustes → *Enviar prueba* manda una notificación a todos los dispositivos de
  la cuenta.
- Tests: `backend/src/lib/pushMessages.test.js`,
  `backend/src/plugins/pushDispatch.test.js`,
  `src/lib/notifications/alerts.test.mjs`.
