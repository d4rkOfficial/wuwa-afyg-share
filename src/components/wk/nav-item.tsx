'use client'

// 顶栏主导航项：按当前路径高亮，并在下方显示选中横条
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@iconify/react'

export default function WkNavItem({
    href,
    icon,
    label
}: {
    href: string
    icon: string
    label: string
}) {
    const pathname = usePathname() ?? '/'
    const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

    return (
        <Link
            href={href}
            className="wk-nav-item"
            data-active={active}
            aria-current={active ? 'page' : undefined}
        >
            <Icon icon={icon} className="wk-nav-icon" aria-hidden="true" />
            {label}
        </Link>
    )
}
