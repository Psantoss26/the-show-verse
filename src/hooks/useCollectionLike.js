'use client'

// Me gusta de UNA colección de TMDb (ficha de colección): recuento público y si
// el visitante ya se lo dio. `ready` es falso hasta que responde el servidor,
// para no pintar un corazón vacío que luego se rellena.

import { useCallback, useEffect, useState } from 'react'

export default function useCollectionLike(collectionId) {
    const [state, setState] = useState({ ready: false, likes: 0, liked: false })

    useEffect(() => {
        const id = Number(collectionId)
        if (!Number.isInteger(id) || id <= 0) return undefined
        const controller = new AbortController()
        fetch(`/api/community/collections/likes?ids=${id}`, { signal: controller.signal, cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                const entry = json?.likes?.[id]
                setState({ ready: true, likes: Number(entry?.likes) || 0, liked: Boolean(entry?.liked) })
            })
            .catch((error) => {
                if (error?.name !== 'AbortError') setState((prev) => ({ ...prev, ready: true }))
            })
        return () => controller.abort()
    }, [collectionId])

    // Lo que confirma el botón tras dar o quitar el me gusta.
    const update = useCallback((next) => {
        setState({ ready: true, likes: Number(next?.likes) || 0, liked: Boolean(next?.liked) })
    }, [])

    return { ...state, update }
}
