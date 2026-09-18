'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'

const KEY = 'share-theme'

/**
 * @desc 解析 URL hash 里的主题透传（工具箱 iframe 打开时带 `#theme=light|dark`）。
 * 该值优先于本地保存与系统偏好：否则挂载时的 sync() 会把工具箱传来的主题覆盖回系统偏好。
 */
function hashTheme(): 'light' | 'dark' | null {
    if (typeof window === 'undefined') return null
    try {
        const matched = /(?:^|&)theme=(light|dark)(?:&|$)/.exec(window.location.hash.replace(/^#/, ''))
        return matched ? (matched[1] as 'light' | 'dark') : null
    } catch {
        return null
    }
}

export default function ThemeToggle() {
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: light)')
        const sync = () => {
            let saved: string | null = null
            try {
                saved = localStorage.getItem(KEY)
            } catch {}
            const effective = hashTheme() ?? saved
            const light = effective === 'light' || (effective !== 'dark' && media.matches)
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
