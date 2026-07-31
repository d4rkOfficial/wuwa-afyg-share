'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'

const KEY = 'share-theme'

export default function ThemeToggle() {
    const [light, setLight] = useState(() => {
        if (typeof window === 'undefined') return false
        const saved = localStorage.getItem(KEY)
        return saved === 'light' || (saved === null && !window.matchMedia('(prefers-color-scheme: dark)').matches)
    })

    useEffect(() => {
        document.documentElement.classList.toggle('light', light)
    }, [light])

    function toggle() {
        const next = !light
        setLight(next)
        document.documentElement.classList.toggle('light', next)
        localStorage.setItem(KEY, next ? 'light' : 'dark')
    }

    return (
        <button
            onClick={toggle}
            aria-label="切换主题"
            className="rounded-lg p-2 text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg)"
        >
            <Icon icon={light ? 'mdi:weather-night' : 'mdi:weather-sunny'} className="size-5" />
        </button>
    )
}
