import './globals.css'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/context/AuthContext'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { SITE_TITLE_SHORT } from '@/lib/pageTitle'
import PwaManager from '@/components/PwaManager'
import { anton, ptSans } from './fonts'

export const metadata = {
  applicationName: 'The Show Verse',
  title: {
    default: SITE_TITLE_SHORT,
    template: `%s • ${SITE_TITLE_SHORT}`,
  },
  description: 'Tu plataforma de películas y series',
  manifest: '/site.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ShowVerse',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icon.png', sizes: '256x256', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon.png', sizes: '1024x1024', type: 'image/png' }
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }]
  }
}

export const viewport = {
  themeColor: '#000000',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${ptSans.className} ${ptSans.variable} ${anton.variable} bg-black text-white antialiased`}>
        <AuthProvider>
          <Navbar />
          <div className="pb-16 lg:pb-0">
            {children}
          </div>
          <PwaManager />
          <Analytics />
          <SpeedInsights />
        </AuthProvider>
      </body>
    </html>
  )
}
