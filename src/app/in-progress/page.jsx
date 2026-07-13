// src/app/in-progress/page.jsx
import InProgressClient from './InProgressClient'
import DetailModalProvider from '@/components/dashboard/DetailModalProvider'

export const metadata = {
    title: 'En progreso',
    description: 'Series que estás viendo actualmente con su progreso detallado',
}

export default function InProgressPage() {
    // Ficha rápida (DetailModal) como drawer desde la derecha al pulsar una tarjeta.
    return (
        <DetailModalProvider placement="right">
            <InProgressClient />
        </DetailModalProvider>
    )
}
