// /src/app/layout.jsx
import './globals.css'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/context/AuthContext'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata = {
  title: 'The Show Verse',
  description: 'Tu plataforma de películas y series',

  // 👇 Iconos para navegadores y iOS
  icons: {
    icon: '/TheShowVerse2.png',       // favicon / icono general
    shortcut: '/TheShowVerse2.png',   // atajos
    apple: '/TheShowVerse2.png',      // icono al añadir a pantalla de inicio en iOS
  },

  // 👇 Manifest PWA (lo creamos en el paso 2)
  manifest: '/site.webmanifest',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-black text-white">
        <AuthProvider>
          <Navbar />
          <div className="pb-16 lg:pb-0">
            {children}
          </div>
          <Analytics />
          <SpeedInsights />
        </AuthProvider>
      </body>
    </html>
  )
}

