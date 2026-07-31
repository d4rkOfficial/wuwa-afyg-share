'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'

interface Props {
    expiresAt: string
}

function formatRemain(ms: number): string {
    const totalHours = Math.floor(ms / 3600000)
    if (totalHours <= 0) {
        const mins = Math.max(1, Math.floor(ms / 60000))
        return `${mins} 分钟后`
    }
    if (totalHours < 48) return `${totalHours} 小时后`
    return `${Math.floor(totalHours / 24)} 天后`
}

export default function ExpiryCountdown({ expiresAt }: Props) {
    const [remain, setRemain] = useState(() => new Date(expiresAt).getTime() - Date.now())

    useEffect(() => {
        const timer = setInterval(() => setRemain(new Date(expiresAt).getTime() - Date.now()), 60000)
        return () => clearInterval(timer)
    }, [expiresAt])

    if (remain <= 0) {
        return (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                <Icon icon="mdi:alert-decagram-outline" className="size-3.5" />
                已过期
            </span>
        )
    }

    return (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">
            <Icon icon="mdi:clock-outline" className="size-3.5" />
            {formatRemain(remain)}
        </span>
    )
}
