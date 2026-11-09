'use client'

// 顶栏下拉：管理员的「管理」入口与窄屏「菜单」
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { WkButton, WkIconButton } from '@/design'
import { isImeComposing } from '@/lib/keyboard'

export interface WkTopbarMenuItem {
    key: string
    label: string
    href: string
    icon?: string
}

export default function WkTopbarMenu({
    label,
    items,
    icon,
    size = 'md',
    iconOnly = false
}: {
    label: string
    items: ReadonlyArray<WkTopbarMenuItem>
    icon?: string
    size?: 'md' | 'sm'
    /** 只显示图标（label 降为 aria-label / title） */
    iconOnly?: boolean
}) {
    const [open, setOpen] = useState(false)
    const wrapRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function onDown(event: MouseEvent) {
            if (wrapRef.current?.contains(event.target as Node)) return
            setOpen(false)
        }
        function onKey(event: KeyboardEvent) {
            if (isImeComposing(event)) return
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    if (items.length === 0) return null

    const toggle = () => setOpen((value) => !value)

    return (
        <div className="wk-pop" ref={wrapRef}>
            {iconOnly ? (
                <WkIconButton
                    label={label}
                    size={size}
                    variant="quiet"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={toggle}
                >
                    {icon && <Icon icon={icon} className="wk-nav-icon" />}
                </WkIconButton>
            ) : (
                <WkButton
                    size={size}
                    variant="quiet"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    leading={icon ? <Icon icon={icon} className="wk-nav-icon" /> : undefined}
                    onClick={toggle}
                >
                    {label}
                </WkButton>
            )}
            {open && (
                <div className="wk-pop-panel wk-pop-panel--menu" role="menu">
                    {items.map((item) => (
                        <Link
                            key={item.key}
                            href={item.href}
                            role="menuitem"
                            className="wk-menu-item wk-menu-link"
                            onClick={() => setOpen(false)}
                        >
                            {item.icon && <Icon icon={item.icon} className="wk-nav-icon" />}
                            {item.label}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
