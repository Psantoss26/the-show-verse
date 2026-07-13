// src/app/watchlist/page.jsx
import WatchlistClient from './WatchlistClient'
import DetailModalProvider from '@/components/dashboard/DetailModalProvider'

export const metadata = {
    title: 'Pendientes',
    description: 'Títulos guardados para ver más tarde',
}

export default function WatchlistPage() {
    // Ficha rápida (DetailModal) como drawer desde la derecha al pulsar una tarjeta.
    return (
        <DetailModalProvider placement="right">
            <WatchlistClient />
        </DetailModalProvider>
    )
}
