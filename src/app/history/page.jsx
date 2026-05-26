// src/app/history/page.jsx
import HistoryClient from './HistoryClient'

export const metadata = {
    title: 'Historial',
}

export const dynamic = 'force-dynamic'

export default function HistoryPage() {
    return <HistoryClient />
}
