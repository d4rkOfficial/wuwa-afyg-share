'use client'

// 顶栏主题开关（新系统）：逻辑来自 @/lib/theme；图标随主题切换（纸 / 墨夜两态）
import { useEffect } from 'react'
import { Icon } from '@iconify/react'
import { WkIconButton } from '@/design'
import { applyTheme, resolveTheme, THEME_KEY } from '@/lib/theme'

export default function WkThemeToggle() {
    useEffect(() => {
        applyTheme(resolveTheme())
        const media = window.matchMedia('(prefers-color-scheme: light)')
        const sync = () => applyTheme(resolveTheme())
        const onStorage = (event: StorageEvent) => {
            if (event.key === THEME_KEY) sync()
        }
        media.addEventListener('change', sync)
        window.addEventListener('storage', onStorage)
        return () => {
            media.removeEventListener('change', sync)
            window.removeEventListener('storage', onStorage)
        }
    }, [])

    function toggle() {
        const light = !document.documentElement.classList.contains('light')
        const next = light ? 'light' : 'dark'
        applyTheme(next)
        try {
            localStorage.setItem(THEME_KEY, next)
        } catch {}
    }

    return (
        <WkIconButton label="切换主题（纸 / 墨夜）" variant="quiet" size="sm" onClick={toggle}>
            <Icon icon="mdi:weather-sunny" className="wk-nav-icon wk-theme-icon-sun" aria-hidden="true" />
            <Icon icon="mdi:weather-night" className="wk-nav-icon wk-theme-icon-moon" aria-hidden="true" />
        </WkIconButton>
    )
}
