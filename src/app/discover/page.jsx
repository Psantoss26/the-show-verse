import DiscoverClient from '@/components/DiscoverClient'
import DetailModalProvider from '@/components/dashboard/DetailModalProvider'

export const metadata = {
    title: 'Descubrir',
}

export default function DiscoverPage() {
    // Ficha rápida (DetailModal) como drawer desde la derecha al pulsar una
    // tarjeta, como en Favoritos.
    return (
        <DetailModalProvider placement="right">
            <DiscoverClient />
        </DetailModalProvider>
    )
}
