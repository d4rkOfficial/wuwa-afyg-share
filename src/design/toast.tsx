'use client'

// 设计系统 v2 · Toast
// 与旧 toast 的差别：有 aria-live（读屏会念）、错误用 role=alert、时长 4s（旧的是 2.5s，来不及读）
import { useEffect, useState } from 'react'
import { cn } from './cn'

export type WkToastType = 'ok' | 'error' | 'info' | 'success'

interface WkToastItem {
    id: number
    type: Exclude<WkToastType, 'success'>
    message: string
}

let listeners: Array<(next: WkToastItem[]) => void> = []
let current: WkToastItem[] = []
let nextId = 1

/** @desc success 是历史别名（旧 toast 的调用点直接搬过来时用），内部归一为 ok */
export function wkToast(message: string, type: WkToastType = 'info', duration = 4000): void {
    const id = nextId++
    const normalized: WkToastItem['type'] = type === 'success' ? 'ok' : type
    current = [...current, { id, type: normalized, message }]
    listeners.forEach((listener) => listener(current))
    if (duration > 0) {
        setTimeout(() => wkDismiss(id), duration)
    }
}

export function wkDismiss(id: number): void {
    current = current.filter((item) => item.id !== id)
    listeners.forEach((listener) => listener(current))
}

export function WkToaster() {
    const [items, setItems] = useState<WkToastItem[]>([])

    useEffect(() => {
        const listener = (next: WkToastItem[]) => setItems([...next])
        listeners.push(listener)
        listener(current)
        return () => {
            listeners = listeners.filter((entry) => entry !== listener)
        }
    }, [])

    return (
        <div className="wk-toaster" aria-live="polite" aria-atomic="false">
            {items.map((item) => (
                <div
                    key={item.id}
                    className={cn('wk-toast', `wk-toast--${item.type}`)}
                    role={item.type === 'error' ? 'alert' : 'status'}
                >
                    <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{item.message}</span>
                    <button
                        type="button"
                        onClick={() => wkDismiss(item.id)}
                        aria-label="关闭提示"
                        className="wk-btn wk-btn--quiet wk-btn--sm wk-btn--icon"
                        style={{ borderColor: 'transparent' }}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    )
}
