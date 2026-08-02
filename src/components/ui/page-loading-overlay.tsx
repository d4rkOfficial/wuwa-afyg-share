'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Icon } from '@iconify/react'

// 模块级控制：供 <AppLink> 与提交类操作手动触发
let _visible = false
let _listeners: Array<(v: boolean) => void> = []

export function showPageLoading(): void {
    _visible = true
    _listeners.forEach((l) => l(true))
}

export function hidePageLoading(): void {
    _visible = false
    _listeners.forEach((l) => l(false))
}

export default function PageLoadingOverlay() {
    const [visible, setVisible] = useState(false)
    const pathname = usePathname()
    const prevPath = useRef(pathname)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const listener = (v: boolean) => setVisible(v)
        _listeners.push(listener)
        listener(_visible)
        return () => {
            _listeners = _listeners.filter((l) => l !== listener)
        }
    }, [])

    // 导航完成后自动隐藏（新路径渲染出来 → 隐藏，带小延迟让动画自然）
    useEffect(() => {
        if (prevPath.current !== pathname) {
            prevPath.current = pathname
            if (hideTimer.current) clearTimeout(hideTimer.current)
            hideTimer.current = setTimeout(() => {
                _visible = false
                _listeners.forEach((l) => l(false))
            }, 150)
        }
    }, [pathname])

    if (!visible) return null

    return (
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            role="status"
            aria-label="加载中"
        >
            <div className="flex flex-col items-center gap-3">
                <Icon icon="mdi:loading" className="size-10 animate-spin text-white" />
                <span className="text-sm text-white">加载中…</span>
            </div>
        </div>
    )
}
