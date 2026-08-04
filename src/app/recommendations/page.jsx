// src/app/recommendations/page.jsx
import RecommendationsClient from './RecommendationsClient'
import DetailModalProvider from '@/components/dashboard/DetailModalProvider'

export const metadata = {
    title: 'Recomendaciones',
    description: 'Descubre títulos para ti deslizando: descarta, guarda en pendientes o marca como favorito',
}

export default function RecommendationsPage() {
    // Ficha rápida (DetailModal) como drawer desde la derecha, igual que en el
    // resto de páginas de usuario.
    return (
        <DetailModalProvider placement="right">
            <RecommendationsClient />
        </DetailModalProvider>
    )
}
