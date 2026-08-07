# Publicar The Show Verse en Google Play

Guía de lo que falta para que el proyecto de `android-companion/` esté en la
tienda. El código ya está listo: lo que queda es firma, empaquetado, verificación
de enlaces y —la parte que de verdad hace que una app así se rechace— las
declaraciones de permisos sensibles.

---

## 1. Clave de firma

La clave de subida se genera **una vez** y se guarda para siempre: si se pierde,
sin Play App Signing no se puede volver a actualizar la app nunca más.

```bash
keytool -genkeypair -v \
  -keystore ~/keys/theshowverse-upload.jks \
  -alias theshowverse -keyalg RSA -keysize 4096 -validity 10000
```

Después, `android-companion/keystore.properties` (ya está en `.gitignore`):

```properties
storeFile=/home/pablo/keys/theshowverse-upload.jks
storePassword=…
keyAlias=theshowverse
keyPassword=…
```

Alternativa para CI, sin fichero: `TSV_KEYSTORE_FILE`, `TSV_KEYSTORE_PASSWORD`,
`TSV_KEY_ALIAS`, `TSV_KEY_PASSWORD`. Sin ninguna de las dos cosas, el build de
release sale **sin firmar** (útil para compilar en cualquier máquina).

Activa **Play App Signing** al crear la app: subes firmada con la clave de
subida y Google firma la de distribución. Es lo que te permite recuperar el
control si un día pierdes la de subida.

## 2. Empaquetar

Play solo acepta **Android App Bundle**:

```bash
cd android-companion
./gradlew bundleRelease   # app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease # APK, para probar el release en un dispositivo
./gradlew test            # que los tests pasen antes de subir
```

Antes de cada subida hay que subir `versionCode` en `app/build.gradle.kts`
(`versionName` es lo que ve el usuario; `versionCode` es lo que ordena Play).

## 3. App Links: que los enlaces abran la app

El manifest declara `autoVerify="true"` para `theshowverse.com`. Para que Android
lo verifique, el dominio tiene que servir la huella del certificado.

1. Saca la huella SHA-256. **Ojo:** si usas Play App Signing, la que vale es la
   de la *clave de distribución*, que aparece en Play Console → *Configuración →
   Integridad de la aplicación*. La de tu almacén local se ve con:
   ```bash
   keytool -list -v -keystore ~/keys/theshowverse-upload.jks -alias theshowverse
   ```
2. Crea `public/.well-known/assetlinks.json` en la web con las **dos** huellas
   (subida y distribución) mientras convivan:
   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.theshowverse.app",
       "sha256_cert_fingerprints": [
         "AA:BB:…:99",
         "11:22:…:FF"
       ]
     }
   }]
   ```
3. Comprueba que se sirve como JSON en
   `https://theshowverse.com/.well-known/assetlinks.json` y sin redirecciones.
   `middleware.js` no lo bloquea (`.json` está exento del gate), pero verifícalo
   igualmente desde fuera de tu red.
4. En el dispositivo: `adb shell pm verify-app-links --re-verify com.theshowverse.app`
   y luego `adb shell pm get-app-links com.theshowverse.app`.

Hasta que esto esté, los enlaces siguen abriéndose en el navegador; la app
funciona igual.

## 4. Declaraciones obligatorias (la parte delicada)

Esta app usa **dos permisos que Play revisa a mano**. Es el motivo más probable
de rechazo, así que conviene tenerlo preparado antes de subir.

### 4.1 Acceso a notificaciones (`BIND_NOTIFICATION_LISTENER_SERVICE`)

- **Para qué se usa, tal cual hay que contarlo:** leer los metadatos de la sesión
  multimedia activa (título, posición) que las apps de streaming publican para
  los controles de la pantalla de bloqueo, y así registrar automáticamente en tu
  historial lo que ves. No se leen ni almacenan notificaciones de mensajería.
- En **Contenido de la app → Permisos sensibles** describe justo eso, con un
  vídeo corto del flujo (Play lo pide casi siempre).
- La app ya lo hace bien de cara a la revisión: el permiso **no** se pide al
  arrancar; se explica en Ajustes y solo se abre la pantalla del sistema cuando
  el usuario pulsa *Conceder*.

### 4.2 Accesibilidad (`AccessibilityStreamingService`)

Este es el que se rechaza con más frecuencia: Play exige que la API de
accesibilidad sirva para **ayudar a personas con discapacidad**, y aquí se usa
para detectar el título de una ficha. Opciones, en orden de menos a más
drástico:

1. **Declararlo bien.** En Play Console marca que **no** es una herramienta de
   accesibilidad (`isAccessibilityTool="false"`, ya está así en
   `accessibility_service_config.xml`) y justifica el uso. La app ya cumple los
   requisitos formales: es **opcional**, está apagada hasta que el usuario la
   activa, se explica para qué sirve y está limitada a apps de streaming
   concretas.
2. **Publicar sin ella.** Si la rechazan, se saca del build de Play con un
   *flavor*, sin tocar el código, y se mantiene en la APK de sideload:

   ```kotlin
   // app/build.gradle.kts
   flavorDimensions += "distribucion"
   productFlavors {
       create("play") { dimension = "distribucion" }
       create("sideload") { dimension = "distribucion"; isDefault = true }
   }
   ```

   ```xml
   <!-- app/src/play/AndroidManifest.xml -->
   <manifest xmlns:android="http://schemas.android.com/apk/res/android"
       xmlns:tools="http://schemas.android.com/tools">
       <application>
           <service android:name=".AccessibilityStreamingService" tools:node="remove" />
       </application>
   </manifest>
   ```

   Y ocultar su fila en `AndroidSyncPanel.jsx` cuando el estado nativo no la
   reporte (`accessibilityGranted` seguiría siendo `false` siempre).

### 4.3 Seguridad de los datos

Lo que hay que declarar en el formulario:

- **Se recogen:** correo y nombre de usuario (cuenta), actividad de visionado
  (títulos, fechas, puntuaciones, reseñas). Se transmiten cifrados a tu propio
  servidor. El usuario puede borrarlos desde su cuenta.
- **No se comparten con terceros.**
- **Política de privacidad:** obligatoria y accesible por URL pública. Si la web
  tiene el gate de acceso privado activo, esa URL **tiene que quedar fuera del
  gate** o Play no podrá abrirla.

## 5. Ficha de la tienda

- Nombre: **The Show Verse**. Descripción corta (80) y larga (4000).
- Icono 512×512 PNG, gráfico destacado 1024×500.
- Capturas: **teléfono** (mín. 2) y **tablet 7" y 10"** — sin capturas de tablet,
  Play avisa de que la app no está optimizada para pantallas grandes. Se sacan
  del emulador o con `adb exec-out screencap -p > captura.png`.
- Categoría: Entretenimiento. Clasificación por contenido: rellena el
  cuestionario (hay contenido generado por usuarios: reseñas y listas).

## 6. Antes de darle a publicar

- [ ] `./gradlew test` en verde.
- [ ] Release **firmado** probado en un dispositivo real: sesión, tráileres,
      subida de avatar, enlaces externos, rotación, tablet.
- [ ] Sin red: sale la pantalla de reintento, no el error del WebView.
- [ ] Emparejar y sincronizar algo de verdad desde una app de streaming.
- [ ] `assetlinks.json` publicado y verificado.
- [ ] Política de privacidad accesible **sin** el gate de acceso privado.
- [ ] Si el gate sigue activo en producción, decidir qué ve un usuario nuevo de
      Play: hoy vería *"Dispositivo no autorizado"*. O se desactiva el gate, o la
      app se publica en **acceso interno / prueba cerrada** hasta entonces.

## 7. Después

- Canal de pruebas internas primero (hasta 100 correos, publicación en minutos),
  producción después.
- Cada versión: subir `versionCode`, `bundleRelease`, subir el AAB y escribir las
  novedades.
- Play obliga a actualizar el `targetSdk` una vez al año (ahora 35); es un
  cambio de una línea más la comprobación de que nada se rompe.
