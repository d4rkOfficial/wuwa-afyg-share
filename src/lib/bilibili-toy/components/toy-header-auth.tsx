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
                    className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-sm whitespace-nowrap border border-(--card-border) bg-(--btn-bg) text-sm font-black tracking-tight text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) md:w-auto md:px-3"
                >
                    <Icon icon="mdi:plus" className="size-4 shrink-0" />
                    <span className="hidden md:inline">上传工程</span>
                </Link>
                <Link
                    href="/me"
                    title={`B站 身份：${identity.nickname}（进入个人主页）`}
                    className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-sm px-1 transition-colors hover:bg-(--card-hover)"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={identity.avatar} alt="" referrerPolicy="no-referrer" className="size-6 shrink-0 rounded-sm" />
                    <span className="hidden max-w-28 truncate text-sm text-(--muted) 2xl:inline">
                        {identity.nickname}
                    </span>
                </Link>
            </>
        )
    }

    // 登录入口：无底色，仅文字 + hover 实色底，弱化为顶栏的一个普通导航项
    return (
        <Link
            href="/login"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-sm px-3 text-sm font-black tracking-tight whitespace-nowrap text-(--fg) transition-colors hover:bg-(--card-hover)"
        >
            登录
        </Link>
    )
}
