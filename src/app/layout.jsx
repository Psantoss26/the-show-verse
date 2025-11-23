// /src/app/layout.jsx
import './globals.css'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/context/AuthContext'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { cookies } from 'next/headers'

export const metadata = {
  title: 'The Show Verse',
  description: 'Tu plataforma de películas y series',
}

export default async function RootLayout({ children }) {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('tmdb_session')?.value || null
  const accountRaw = cookieStore.get('tmdb_account')?.value || null

  let initialAccount = null
  if (accountRaw) {
    try {
      initialAccount = JSON.parse(accountRaw)
    } catch {
      initialAccount = null
    }
  }

  return (
    <html lang="es">
      <body className="bg-black text-white">
        <AuthProvider initialSession={sessionId} initialAccount={initialAccount}>
          <Navbar />
          {children}
          <Analytics />
          <SpeedInsights />
        </AuthProvider>
      </body>
    </html>
  )
}
