// /src/app/lists/community/[id]/page.jsx
'use client'

import { useParams } from 'next/navigation'
import TraktListDetailsClient from '@/components/lists/TraktListDetailsClient'

export default function CommunityListDetailsPage() {
    const params = useParams()

    const idRaw = params?.id
    const listId = Array.isArray(idRaw) ? idRaw[0] : idRaw

    if (!listId) {
        return (
            <div className="min-h-screen bg-[#101010] text-gray-100 flex items-center justify-center p-6">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-zinc-300 max-w-md w-full">
                    <p className="font-bold text-red-300">Error</p>
                    <p className="mt-2 text-sm text-zinc-400">Falta el identificador de la lista</p>
                </div>
            </div>
        )
    }

    return <TraktListDetailsClient listId={decodeURIComponent(String(listId))} />
}
