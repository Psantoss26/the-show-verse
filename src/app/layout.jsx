import './globals.css'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/context/AuthContext'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata = {
  title: 'The Show Verse',
  description: 'Tu plataforma de películas y series',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-black text-white">
        <Navbar />
        <AuthProvider>{children}</AuthProvider>

        {/* Añade los componentes al final del body */}
        <Analytics />
        <SpeedInsights /> {/* opcional */}
      </body>
    </html>
  )
}
