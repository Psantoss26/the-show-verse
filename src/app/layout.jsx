import './globals.css'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/context/AuthContext'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
// 1. Importamos la fuente de Google
import { PT_Sans } from 'next/font/google'

// 2. Configuramos la fuente (pesos 400 normal y 700 negrita, típicos de Amazon)
const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
})

export const metadata = {
  title: 'The Show Verse',
  description: 'Tu plataforma de películas y series',
  manifest: '/site.webmanifest',
  // Next.js detecta automáticamente icon.png y apple-icon.png en src/app/
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      {/* 3. Aplicamos la clase de la fuente al body. 
          Añadimos 'antialiased' para que la letra se vea más nítida (estilo Apple/Amazon) */}
      <body className={`${ptSans.className} bg-black text-white antialiased`}>
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