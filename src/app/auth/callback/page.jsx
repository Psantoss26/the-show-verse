import { Suspense } from 'react'
import CallbackClient from './CallbackClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function CallbackPage() {
    // fallback null = no “Cargando...” durante el prerender
    return (
        <Suspense fallback={null}>
            <CallbackClient />
        </Suspense>
    )
}