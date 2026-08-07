# OkHttp / Okio platform-specific warnings.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# El puente JS se invoca por reflexión desde el WebView: R8 no ve esas llamadas y
# sin esta regla eliminaría o renombraría los métodos, dejando a la web sin
# emparejamiento ni acceso al panel de sincronización.
-keepclasseswithmembers class com.theshowverse.sync.WebAppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# Modelos serializados a/desde JSON por nombre de campo.
-keep class com.theshowverse.sync.PlaybackSignal { *; }
-keep class com.theshowverse.sync.SyncedInfo { *; }
