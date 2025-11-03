import './globals.css'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/context/AuthContext'

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
      </body>
    </html>
  )
}
