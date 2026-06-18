import "./globals.css";
import Navbar from "@/components/Navbar";
import { AuthProvider } from "@/context/AuthContext";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_TITLE_SHORT } from "@/lib/pageTitle";
import PwaManager from "@/components/PwaManager";
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
    <html lang="es">
      <body
        className={`${ptSans.className} ${ptSans.variable} ${anton.variable} bg-black text-white antialiased`}
      >
        <AuthProvider>
          <Navbar />
          <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
          <PwaManager />
          <Analytics />
          <SpeedInsights />
        </AuthProvider>
      </body>
    </html>
  );
}
