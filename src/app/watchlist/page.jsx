// src/app/watchlist/page.jsx
import WatchlistClient from './WatchlistClient'

export const metadata = {
    title: 'Pendientes',
    description: 'Títulos guardados para ver más tarde',
}

export const dynamic = 'force-dynamic'

export default function WatchlistPage() {
    return <WatchlistClient />
}
