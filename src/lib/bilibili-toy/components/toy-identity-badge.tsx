'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getToyIdentity, type ToyIdentity } from '@/lib/bilibili-toy/toy-auth'

/**
 * @desc B站 身份徽标（仅头像）：有身份 → 显示可点击的头像（进入个人主页）；
 *   无身份 → 渲染 null。独立于账号登录态，登录账号后右上角仍显示 B站 头像。
 */
export default function ToyIdentityBadge() {
    const [identity, setIdentity] = useState<ToyIdentity | null>(null)

    useEffect(() => {
        const update = () => setIdentity(getToyIdentity())
        update()
        window.addEventListener('hashchange', update)
        return () => window.removeEventListener('hashchange', update)
    }, [])

    if (!identity) return null

    return (
        <Link
            href="/me"
            title={`B站 身份：${identity.nickname}（进入个人主页）`}
            className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 px-1 transition-colors hover:bg-(--card-hover)"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={identity.avatar} alt="" referrerPolicy="no-referrer" className="size-6 shrink-0" />
            <span className="hidden max-w-28 truncate text-sm text-(--muted) 2xl:inline">{identity.nickname}</span>
        </Link>
    )
}
