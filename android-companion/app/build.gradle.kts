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

val appVersionName = "1.0"

android {
    // OJO: `namespace` (paquete del código, R y ViewBinding) NO es lo mismo que
    // `applicationId` (identidad de instalación y URL en Play). El código sigue
    // en com.theshowverse.sync —renombrarlo no aportaría nada y tocaría cada
    // fichero— mientras que la app se publica como com.theshowverse.app.
    namespace = "com.theshowverse.sync"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.theshowverse.app"
        minSdk = 26
        targetSdk = 35
        // App oficial: numeración nueva. La APK sideload anterior era
        // com.theshowverse.sync 2.2 (versionCode 13) y es otro paquete.
        versionCode = 1
        versionName = appVersionName

        // Origen que carga el shell mientras el usuario no configure otro.
        buildConfigField("String", "DEFAULT_ORIGIN", "\"https://theshowverse.com\"")
        // Sufijo de User-Agent: es cómo la web sabe que se está ejecutando
        // dentro de la app (además del puente JS).
        buildConfigField("String", "UA_SUFFIX", "\"TheShowVerseApp/$appVersionName\"")
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

    // Carcasa web
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.activity:activity-ktx:1.9.3")

    testImplementation("junit:junit:4.13.2")
}
