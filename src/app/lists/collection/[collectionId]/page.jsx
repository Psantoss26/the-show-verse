// /src/app/lists/collection/[collectionId]/page.jsx
'use client'

import { useParams } from 'next/navigation'
import CollectionDetailsClient from '@/components/lists/CollectionDetailsClient'

export default function CollectionDetailsPage() {
    const params = useParams()

    const collectionIdRaw = params?.collectionId
    const collectionId = Array.isArray(collectionIdRaw) ? collectionIdRaw[0] : collectionIdRaw

    if (!collectionId) {
        return (
            <div className="min-h-screen bg-[#101010] text-gray-100 flex items-center justify-center p-6">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-zinc-300 max-w-md w-full">
                    <p className="font-bold text-red-300">Error</p>
                    <p className="mt-2 text-sm text-zinc-400">ID de colección no válido</p>
                </div>
            </div>
        )
    }

    return (
        <CollectionDetailsClient
            collectionId={decodeURIComponent(String(collectionId))}
        />
    )
}
