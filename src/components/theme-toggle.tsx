'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'

const KEY = 'share-theme'

export default function ThemeToggle() {
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: light)')
        const sync = () => {
            let saved: string | null = null
            try {
                saved = localStorage.getItem(KEY)
            } catch {}
            const light = saved === 'light' || (saved !== 'dark' && media.matches)
            document.documentElement.classList.toggle('light', light)
            document.documentElement.style.colorScheme = light ? 'light' : 'dark'
        }
        const onStorage = (event: StorageEvent) => {
            if (event.key === KEY) sync()
        }

        sync()
        media.addEventListener('change', sync)
        window.addEventListener('storage', onStorage)
        return () => {
            media.removeEventListener('change', sync)
            window.removeEventListener('storage', onStorage)
        }
    }, [])

    function toggle() {
        const next = !document.documentElement.classList.contains('light')
        document.documentElement.classList.toggle('light', next)
        document.documentElement.style.colorScheme = next ? 'light' : 'dark'
        try {
            localStorage.setItem(KEY, next ? 'light' : 'dark')
        } catch {}
    }

    return (
        <button
            onClick={toggle}
            aria-label="切换主题"
            className="theme-toggle inline-flex size-9 shrink-0 items-center justify-center text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg)"
        >
            <Icon icon="mdi:weather-sunny" className="theme-icon-dark size-5" />
            <Icon icon="mdi:weather-night" className="theme-icon-light size-5" />
        </button>
    )
}
