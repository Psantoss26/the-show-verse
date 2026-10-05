import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Credenciales de firma de release. Se leen de `keystore.properties` (fuera de
// git) o, si no existe, de variables de entorno, para poder firmar en CI sin
// meter el almacén de claves en el repositorio. Si no hay ninguna de las dos,
// el build de release simplemente sale SIN firmar: se puede compilar el
// proyecto en cualquier máquina sin tener las claves.
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun signingSecret(property: String, environment: String): String? =
    (keystoreProperties.getProperty(property) ?: System.getenv(environment))
        ?.takeIf { it.isNotBlank() }

// Notificaciones push (Firebase Cloud Messaging). La configuración del proyecto
// de Firebase va en app/google-services.json (Consola de Firebase → Configuración
// del proyecto → Tus apps → Android, paquete com.theshowverse.app). Sin ese
// fichero la app compila igual y simplemente no ofrece notificaciones push.
val hasFirebaseConfig = file("google-services.json").exists()
if (hasFirebaseConfig) {
    apply(plugin = "com.google.gms.google-services")
    // Firebase es solo de la app completa: The Show Verse Sync no tiene cliente
    // en ese fichero (otro paquete) y su tarea fallaría al no encontrarlo.
    tasks.configureEach {
        if (name.startsWith("processSync") && name.endsWith("GoogleServices")) enabled = false
    }
}

// Dos apps salen de este proyecto (ver productFlavors): la completa y Sync.
val appVersionName = "1.5"
val syncVersionName = "3.0"

// Cliente OAuth WEB de Google (el mismo que usa la web). Es el `serverClientId`
// que se le pasa a Credential Manager, y es lo que hace que el `aud` del token
// coincida con lo que valida el backend. No es un secreto: viaja en la URL de
// autorización de cualquier login por navegador. Se puede sobrescribir con
// -Ptsv.googleWebClientId=… sin tocar el fichero.
val googleWebClientId: String = (findProperty("tsv.googleWebClientId") as String?)
    ?: "84707825765-o0kokgcqiqouq1fjhm7i5l0oldd5kaqp.apps.googleusercontent.com"

android {
    // OJO: `namespace` (paquete del código, R y ViewBinding) NO es lo mismo que
    // `applicationId` (identidad de instalación y URL en Play). El código sigue
    // en com.theshowverse.sync —renombrarlo no aportaría nada y tocaría cada
    // fichero— mientras que la app se publica como com.theshowverse.app.
    namespace = "com.theshowverse.sync"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
        targetSdk = 35

        // Origen por defecto: el que carga la app completa y al que The Show
        // Verse Sync manda a vincular mientras no se emparejen.
        buildConfigField("String", "DEFAULT_ORIGIN", "\"https://theshowverse.com\"")
    }

    // DOS APPS, UN CÓDIGO.
    //  - full: The Show Verse completo (WebView) + sincronización. Lo propio en
    //    src/full: carcasa web, puente JS, login con Google, push, ajustes.
    //  - sync: The Show Verse Sync, solo sincronización y registro de detecciones,
    //    para quien usa la PWA. Su pantalla de inicio es el panel nativo.
    // Los servicios de detección, el emparejamiento y el registro son de las
    // dos (src/main). Con Sync instalada, la completa le cede la sincronización
    // (ver Delegacion), así que nunca detectan las dos a la vez.
    flavorDimensions += "app"
    productFlavors {
        create("full") {
            dimension = "app"
            applicationId = "com.theshowverse.app"
            versionCode = 6
            versionName = appVersionName
            // Sufijo de User-Agent: es cómo la web sabe que se está ejecutando
            // dentro de la app (además del puente JS).
            buildConfigField("String", "UA_SUFFIX", "\"TheShowVerseApp/$appVersionName\"")
            buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
            buildConfigField("boolean", "PUSH_CONFIGURED", hasFirebaseConfig.toString())
            // Cede la sincronización a The Show Verse Sync si está instalada.
            buildConfigField("boolean", "CEDE_A_SYNC", "true")
        }
        create("sync") {
            dimension = "app"
            // El paquete de la antigua APK sideload (2.2, versionCode 13): si
            // está firmada con la misma clave, esta la actualiza.
            applicationId = "com.theshowverse.sync"
            versionCode = 20
            versionName = syncVersionName
            buildConfigField("boolean", "CEDE_A_SYNC", "false")
        }
    }

    signingConfigs {
        create("release") {
            val store = signingSecret("storeFile", "TSV_KEYSTORE_FILE")
            if (store != null) {
                storeFile = file(store)
                storePassword = signingSecret("storePassword", "TSV_KEYSTORE_PASSWORD")
                keyAlias = signingSecret("keyAlias", "TSV_KEY_ALIAS")
                keyPassword = signingSecret("keyPassword", "TSV_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Solo se firma si hay claves configuradas (ver arriba).
            signingConfig = signingConfigs.getByName("release")
                .takeIf { it.storeFile != null }
        }
        debug {
            // Mismo applicationId que release a propósito: el emparejamiento y el
            // acceso a notificaciones se conceden por paquete, así que un sufijo
            // obligaría a repetirlo todo al pasar de debug a release.
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    implementation("androidx.activity:activity-ktx:1.9.3")

    // Carcasa web: solo la app completa.
    "fullImplementation"("androidx.webkit:webkit:1.11.0")
    "fullImplementation"("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    "fullImplementation"("androidx.browser:browser:1.8.0")
    "fullImplementation"("androidx.core:core-splashscreen:1.0.1")

    // Inicio de sesión con Google SIN navegador (selector de cuentas del sistema).
    "fullImplementation"("androidx.credentials:credentials:1.3.0")
    "fullImplementation"("androidx.credentials:credentials-play-services-auth:1.3.0")
    "fullImplementation"("com.google.android.libraries.identity.googleid:googleid:1.1.1")

    // Notificaciones push (ver hasFirebaseConfig arriba).
    // Solo la completa: Sync no tiene web a la que entregar los avisos (la PWA
    // recibe los suyos por Web Push).
    "fullImplementation"(platform("com.google.firebase:firebase-bom:33.7.0"))
    "fullImplementation"("com.google.firebase:firebase-messaging")

    testImplementation("junit:junit:4.13.2")
    // org.json de verdad en las pruebas JVM: la del android.jar es un stub que
    // lanza "not mocked" (NotATitleListTest interpreta la respuesta del servidor).
    testImplementation("org.json:json:20240303")
}
