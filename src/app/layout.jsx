import "./globals.css";
import "@fontsource-variable/inter/wght.css";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/context/AuthContext";
import { ServerStatusProvider } from "@/context/ServerStatusContext";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_TITLE_SHORT } from "@/lib/pageTitle";
import PwaManager from "@/components/PwaManager";
import InAppNotifications from "@/components/notifications/InAppNotifications";
import AndroidSessionClaim from "@/components/android/AndroidSessionClaim";
import OfflineManager from "@/components/OfflineManager";
import LetterboxdAutoSync from "@/components/settings/LetterboxdAutoSync";
import OfflineBanner from "@/components/OfflineBanner";
import ScrollRestoration from "@/components/ScrollRestoration";
import OverlayRouteHost from "@/components/navigation/OverlayRouteHost";
import OutsideEmbed from "@/components/navigation/OutsideEmbed";
import DesktopSideNavInset from "@/components/navigation/DesktopSideNavInset";
import MobileUserPageSwipeNavigation from "@/components/MobileUserPageSwipeNavigation";
import MobileTitlePeek from "@/components/preview/MobileTitlePeek";
import { AVATAR_BOOT_SCRIPT } from "@/components/auth/AvatarBootScript";
import { anton, ptSans } from "./fonts";

export const metadata = {
  applicationName: "The Show Verse",
  title: {
    default: SITE_TITLE_SHORT,
    template: `%s • ${SITE_TITLE_SHORT}`,
  },
  description: "Tu plataforma de películas y series",
  manifest: "/site.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ShowVerse",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    shortcut: [{ url: "/favicon.ico?v=2", type: "image/x-icon" }],
    icon: [
      { url: "/favicon.ico?v=2", sizes: "any", type: "image/x-icon" },
      { url: "/browser-icon.png?v=2", sizes: "1280x1280", type: "image/png" },
    ],
    apple: [{ url: "/pwa-apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Como la PWA de Trakt: la página puede dibujarse bajo las barras del
  // sistema (la barra de gestos en Android, si Chrome lo permite; la barra de
  // estado en iOS) y `env(safe-area-inset-*)` da su alto. Las barras de la app
  // lo suman (`--sv-safe-top`, `--sv-safe-bottom` en globals.css).
  viewportFit: "cover",
};

const ANDROID_APP_BOOT_SCRIPT =
  'if(navigator.userAgent.indexOf("TheShowVerseApp/")!==-1){var d=document.documentElement;d.setAttribute("data-android-app","");try{var b=window.TSVAndroidBridge,h=b&&b.statusBarHeight&&b.statusBarHeight(),n=b&&b.navigationBarHeight&&b.navigationBarHeight();if(h>0)d.style.setProperty("--sv-android-top",h+"px");if(n>0)d.style.setProperty("--sv-android-bottom",n+"px")}catch(e){}}';

export default function RootLayout({ children, overlay }) {
  return (
    // `suppressHydrationWarning`: AvatarBootScript y el script de la app nativa
    // marcan <html> antes de hidratar, y React no debe leer esos atributos
    // como una discrepancia.
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      {/* <script> PLANO en el <head> del layout raíz (componente de servidor),
          no `next/script` con `beforeInteractive`.

          Va en el HTML inicial y el navegador lo ejecuta al leerlo, antes de
          hidratar: es lo que necesita el avatar. Con `next/script` dentro del
          <body>, en Next 16 + React 19 el nodo que emitía el servidor no
          coincidía con lo que renderizaba el cliente: la hidratación fallaba,
          React regeneraba el árbol y, al crear el <script> en el cliente,
          avisaba de que un script dentro de un componente nunca se ejecuta. */}
      <head>
        <script
          id="avatar-boot"
          dangerouslySetInnerHTML={{ __html: AVATAR_BOOT_SCRIPT }}
        />
        {/* App nativa de Android (su WebView añade `TheShowVerseApp/` al user
            agent): `data-android-app` en <html> y el alto de la barra de
            estado y de la de navegación, que pasan por el puente, ANTES del
            primer pintado. Así las barras de la app nacen ya en su sitio, sin
            saltar al cargar (ver `--sv-safe-top` en globals.css). */}
        <script
          id="android-app-boot"
          dangerouslySetInnerHTML={{ __html: ANDROID_APP_BOOT_SCRIPT }}
        />
      </head>
      <body
        className={`${ptSans.className} ${ptSans.variable} ${anton.variable} bg-black text-white antialiased`}
      >
        {/* Adelanta la conexión a TMDb (arte) y a YouTube (trailers de las
            vistas previas) para que el iframe del trailer cargue lo antes
            posible y se reproduzca de forma casi instantánea al hacer hover. */}
        <link rel="preconnect" href="https://api.themoviedb.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://www.youtube-nocookie.com" />
        <link rel="preconnect" href="https://s.ytimg.com" />
        <link rel="preconnect" href="https://i.ytimg.com" />
        <link rel="preconnect" href="https://player.vimeo.com" />
        <link rel="preconnect" href="https://i.vimeocdn.com" />
        <link rel="dns-prefetch" href="https://www.youtube.com" />
        <link rel="dns-prefetch" href="https://www.youtube-nocookie.com" />
        <link rel="dns-prefetch" href="https://player.vimeo.com" />
        {/* APP NATIVA DE ANDROID: franja de cristal bajo la barra de estado,
            que es transparente. Difumina lo que pasa por detrás (la portada,
            el contenido al desplazarse) en vez de dejarlo nítido bajo la hora
            y los iconos, y no ocupa sitio: mide lo que la barra de estado
            (`--sv-safe-top`) más 0,5rem, en los que se desvanece con una
            máscara para no dibujar un corte seco contra lo nítido. Solo se ve
            con `data-android-app` en <html>.
            Directamente en <body>, sin
            ancestros con opacidad o filtros que le quitarían el desenfoque. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[90] hidden h-[calc(var(--sv-safe-top,0px)+0.5rem)] [mask-image:linear-gradient(to_bottom,black_calc(100%_-_0.75rem),transparent)] [html[data-android-app]_&]:block bg-black/15 backdrop-blur-[16px] backdrop-saturate-[180%]"
        />
        <AuthProvider>
          <ServerStatusProvider>
            <ScrollRestoration />
            <Navbar />
            <MobileUserPageSwipeNavigation>
              <DesktopSideNavInset
                data-scroll-restoration-root
                className="relative min-h-[100svh] bg-black pb-[calc(5rem+var(--sv-safe-bottom,0px))] desktop:pb-0"
              >
                {/* Fichas abiertas desde la página por encima de ella, que
                    sigue viva debajo (ver OverlayRouteHost). */}
                <OverlayRouteHost overlay={overlay}>{children}</OverlayRouteHost>
              </DesktopSideNavInset>
            </MobileUserPageSwipeNavigation>
            <OutsideEmbed>
              <PwaManager />
              {/* Vista previa al mantener pulsada una tarjeta (móvil). */}
              <MobileTitlePeek />
              <InAppNotifications />
              <OfflineManager />
              <LetterboxdAutoSync />
              <AndroidSessionClaim />
              <OfflineBanner />
              <Analytics />
              <SpeedInsights />
            </OutsideEmbed>
          </ServerStatusProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
