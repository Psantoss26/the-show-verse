// src/app/favorites/page.jsx
import FavoritesClient from './FavoritesClient'

export const metadata = {
    title: 'Favoritos - ShowVerse',
    description: 'Tu colección personal de películas y series favoritas',
}

export const dynamic = 'force-dynamic'

export default function FavoritesPage() {
    return <FavoritesClient />
}
