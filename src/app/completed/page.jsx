// src/app/completed/page.jsx
// Ruta propia de "Completadas" (antes era un tab dentro de /in-progress).
// Reutiliza InProgressClient en modo "completed"; la navegación entre
// En progreso · Completadas · Continuar viendo la hace <WatchingSectionNav />.
import InProgressClient from '../in-progress/InProgressClient'
import DetailModalProvider from '@/components/dashboard/DetailModalProvider'

export const metadata = {
    title: 'Completadas',
    description: 'Series que ya has terminado de ver.',
}

export default function CompletedPage() {
    return (
        <DetailModalProvider placement="right">
            <InProgressClient mode="completed" />
        </DetailModalProvider>
    )
}
