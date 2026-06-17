// src/app/in-progress/page.jsx
import InProgressClient from './InProgressClient'
import { cookies } from 'next/headers'

export const metadata = {
    title: 'En progreso',
    description: 'Series que estás viendo actualmente con su progreso detallado',
}

export const dynamic = 'force-dynamic'

export default async function InProgressPage() {
    const cookieStore = await cookies()
    const hasTraktSession =
        !!cookieStore.get('trakt_access_token')?.value ||
        !!cookieStore.get('trakt_refresh_token')?.value

    return (
        <InProgressClient
            initialAuth={{
                loading: hasTraktSession,
                connected: false,
            }}
        />
    )
}
