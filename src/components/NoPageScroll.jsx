'use client'

import { useEffect } from 'react'

export default function NoPageScroll() {
    useEffect(() => {
        const html = document.documentElement
        const body = document.body

        const prevHtmlOverflow = html.style.overflow
        const prevBodyOverflow = body.style.overflow
        const prevHtmlOverScroll = html.style.overscrollBehavior
        const prevBodyOverScroll = body.style.overscrollBehavior

        html.style.overflow = 'hidden'
        body.style.overflow = 'hidden'
        html.style.overscrollBehavior = 'none'
        body.style.overscrollBehavior = 'none'

        return () => {
            html.style.overflow = prevHtmlOverflow
            body.style.overflow = prevBodyOverflow
            html.style.overscrollBehavior = prevHtmlOverScroll
            body.style.overscrollBehavior = prevBodyOverScroll
        }
    }, [])

    return null
}