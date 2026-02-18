// src/app/in-progress/page.jsx
import InProgressClient from './InProgressClient'

export const metadata = {
    title: 'En Progreso - ShowVerse',
    description: 'Series que estás viendo actualmente con su progreso detallado',
}

export const dynamic = 'force-dynamic'

export default function InProgressPage() {
    return <InProgressClient />
}
