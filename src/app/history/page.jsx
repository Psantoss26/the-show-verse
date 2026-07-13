// src/app/history/page.jsx
import HistoryClient from './HistoryClient'
import DetailModalProvider from '@/components/dashboard/DetailModalProvider'

export const metadata = {
    title: 'Historial',
}

export default function HistoryPage() {
    // Ficha rápida (DetailModal) como drawer desde la derecha al pulsar una tarjeta.
    return (
        <DetailModalProvider placement="right">
            <HistoryClient />
        </DetailModalProvider>
    )
}
