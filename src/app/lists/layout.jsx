// src/app/lists/layout.jsx
import DetailModalProvider from '@/components/dashboard/DetailModalProvider'

export default function ListsLayout({ children }) {
    // Ficha rápida (DetailModal) como drawer desde la derecha al pulsar un
    // título, tanto en el índice de listas como en el detalle de cada lista
    // (propias, de la comunidad y colecciones).
    return <DetailModalProvider placement="right">{children}</DetailModalProvider>
}
