'use client'

// Me gusta de UN actor/persona de TMDb (ficha de actor): recuento público y si
// el visitante ya se lo dio. `ready` es falso hasta que responde el servidor,
// para no pintar un corazón vacío que luego se rellena.

import { useCallback, useEffect, useState } from 'react'

export default function useActorLike(personId) {
    const [state, setState] = useState({ ready: false, likes: 0, liked: false })

    useEffect(() => {
        const id = Number(personId)
        if (!Number.isInteger(id) || id <= 0) return undefined
        const controller = new AbortController()
        fetch(`/api/community/actors/likes?ids=${id}`, { signal: controller.signal, cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                const entry = json?.likes?.[id]
                if (!entry) throw new Error('likes')
                setState({ ready: true, likes: Number(entry?.likes) || 0, liked: Boolean(entry?.liked) })
            })
            .catch((error) => {
                if (error?.name !== 'AbortError') setState((prev) => ({ ...prev, ready: true }))
            })
        return () => controller.abort()
    }, [personId])

    // Lo que confirma el botón tras dar o quitar el me gusta.
    const update = useCallback((next) => {
        setState({ ready: true, likes: Number(next?.likes) || 0, liked: Boolean(next?.liked) })
    }, [])

    return { ...state, update }
}
