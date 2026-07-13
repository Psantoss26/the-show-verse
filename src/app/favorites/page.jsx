// src/app/favorites/page.jsx
import FavoritesClient from './FavoritesClient'
import DetailModalProvider from '@/components/dashboard/DetailModalProvider'

export const metadata = {
    title: 'Favoritos',
    description: 'Tu colección personal de películas y series favoritas',
}

export default function FavoritesPage() {
    // Ficha rápida (DetailModal) como drawer desde la derecha al pulsar una tarjeta.
    return (
        <DetailModalProvider placement="right">
            <FavoritesClient />
        </DetailModalProvider>
    )
}
