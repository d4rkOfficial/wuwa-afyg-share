'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
    id: number
    type: ToastType
    message: string
}

let _listeners: Array<(items: ToastItem[]) => void> = []
let _toasts: ToastItem[] = []
let _nextId = 1

export function toast(message: string, type: ToastType = 'info', duration = 2500): void {
    const id = _nextId++
    _toasts = [..._toasts, { id, type, message }]
    _listeners.forEach((l) => l(_toasts))
    if (duration > 0) {
        setTimeout(() => dismissToast(id), duration)
    }
}

export function dismissToast(id: number): void {
    _toasts = _toasts.filter((t) => t.id !== id)
    _listeners.forEach((l) => l(_toasts))
}

const TYPE_STYLE: Record<ToastType, { icon: string; ring: string }> = {
    success: { icon: 'mdi:check-circle', ring: 'border-(--success) text-(--success)' },
    error: { icon: 'mdi:alert-circle', ring: 'border-(--danger) text-(--danger)' },
    info: { icon: 'mdi:information', ring: 'border-(--info) text-(--info)' }
}

export function Toaster() {
    const [items, setItems] = useState<ToastItem[]>([])

    useEffect(() => {
        const listener = (list: ToastItem[]) => setItems([...list])
        _listeners.push(listener)
        listener(_toasts)
        return () => {
            _listeners = _listeners.filter((l) => l !== listener)
        }
    }, [])

    return (
        <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 flex-col gap-2">
            {items.map((t) => {
                const style = TYPE_STYLE[t.type]
                return (
                    <div
                        key={t.id}
                        className={`pointer-events-auto flex items-start gap-2 rounded-none border-2 bg-(--card) px-3 py-2.5 text-sm text-(--fg) ${style.ring}`}
                        style={{ animation: 'toast-in 0.1s ease-out' }}
                    >
                        <Icon icon={style.icon} className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 flex-1 break-words">{t.message}</span>
                        <button
                            onClick={() => dismissToast(t.id)}
                            className="shrink-0 rounded p-0.5 text-(--muted) transition-colors hover:text-(--fg)"
                            aria-label="关闭"
                        >
                            <Icon icon="mdi:close" className="size-3.5" />
                        </button>
                    </div>
                )
            })}
            <style>{`@keyframes toast-in { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </div>
    )
}
