import { Suspense } from 'react'
import CallbackClient from './CallbackClient'

// Opcional pero recomendable para callbacks de OAuth:
// evita SSG y fuerza que siempre sea dinámico
export const dynamic = 'force-dynamic'

export default function TmdbCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-lg">Cargando callback de TMDb...</p>
        </main>
      }
    >
      <CallbackClient />
    </Suspense>
  )
}
