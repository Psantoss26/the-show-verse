import "./globals.css";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/context/AuthContext";
import { ServerStatusProvider } from "@/context/ServerStatusContext";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_TITLE_SHORT } from "@/lib/pageTitle";
import PwaManager from "@/components/PwaManager";
import AndroidSessionClaim from "@/components/android/AndroidSessionClaim";
import OfflineBanner from "@/components/OfflineBanner";
import ScrollRestoration from "@/components/ScrollRestoration";
import MobileUserPageSwipeNavigation from "@/components/MobileUserPageSwipeNavigation";
import { AVATAR_BOOT_SCRIPT } from "@/components/auth/AvatarBootScript";
import Script from "next/script";
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
};

export default function RootLayout({ children }) {
  return (
    // `suppressHydrationWarning`: AvatarBootScript marca <html> antes de
    // hidratar, y React no debe leer ese atributo como una discrepancia.
    <html lang="es" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${ptSans.className} ${ptSans.variable} ${anton.variable} bg-black text-white antialiased`}
      >
        {/* Debe declararse directamente en el root layout: Next lo inyecta
            antes de hidratar, sin que React intente renderizar un <script>. */}
        <Script
          id="avatar-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: AVATAR_BOOT_SCRIPT }}
        />
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
        <AuthProvider>
          <ServerStatusProvider>
            <ScrollRestoration />
            <Navbar />
            <MobileUserPageSwipeNavigation>
              <div
                data-scroll-restoration-root
                className="relative min-h-[100svh] bg-black pb-[calc(5rem+env(safe-area-inset-bottom))] desktop:pb-0"
              >
                {children}
              </div>
            </MobileUserPageSwipeNavigation>
            <PwaManager />
            <AndroidSessionClaim />
            <OfflineBanner />
            <Analytics />
            <SpeedInsights />
          </ServerStatusProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
