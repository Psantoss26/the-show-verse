// src/app/in-progress/page.jsx
import InProgressClient from './InProgressClient'

export const metadata = {
    title: 'En progreso',
    description: 'Series que estás viendo actualmente con su progreso detallado',
}

export default function InProgressPage() {
    return <InProgressClient />
}
