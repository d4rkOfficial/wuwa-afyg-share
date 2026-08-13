'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { getToyIdentity, type ToyIdentity } from '@/lib/bilibili-toy/toy-auth'

/**
 * @desc header 认证区（B站 Toy 身份感知）：
 *   有 B站 身份 → 显示可点击的头像（进入个人主页）+「上传工程」按钮（进入上传引导），并隐藏邮箱/GH 登录入口；
 *   无身份 → 渲染原登录按钮（非 Toy 环境界面不变）。
 */
export default function ToyHeaderAuth() {
    const [identity, setIdentity] = useState<ToyIdentity | null>(null)

    useEffect(() => {
        const update = () => setIdentity(getToyIdentity())
        update()
        window.addEventListener('hashchange', update)
        return () => window.removeEventListener('hashchange', update)
    }, [])

    if (identity) {
        return (
            <>
                <Link
                    href="/upload"
                    aria-label="上传工程"
                    title="上传工程（需登录工坊）"
                    className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium text-(--btn-text) transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97] md:w-auto md:px-3"
                    style={{ background: 'var(--btn-bg)' }}
                >
                    <Icon icon="mdi:plus" className="size-4 shrink-0" />
                    <span className="hidden md:inline">上传工程</span>
                </Link>
                <Link
                    href="/me"
                    title={`B站 身份：${identity.nickname}（进入个人主页）`}
                    className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-1 transition-[background-color] duration-150 ease-out hover:bg-(--card-hover)"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={identity.avatar} alt="" referrerPolicy="no-referrer" className="size-6 shrink-0 rounded-full" />
                    <span className="hidden max-w-28 truncate text-sm text-(--muted) 2xl:inline">
                        {identity.nickname}
                    </span>
                </Link>
            </>
        )
    }

    return (
        <Link
            href="/login"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-(--btn-text) transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97]"
            style={{ background: 'var(--btn-bg)' }}
        >
            登录
        </Link>
    )
}
