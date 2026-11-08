'use client'

// 设计系统原语 · 浮层（保留 API，输出 .wk-* 类）
import { useEffect, type ReactNode } from 'react'

export function Dialog({
    open,
    onClose,
    title,
    icon,
    children,
    footer,
    width = 'min(94vw, 32rem)'
}: {
    open: boolean
    onClose: () => void
    title: ReactNode
    icon?: ReactNode
    children: ReactNode
    footer?: ReactNode
    width?: string
}) {
    // Esc 关闭（浮层统一行为）
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null
    return (
        <div className="wk-mask" onClick={onClose}>
            <div className="wk-dialog" style={{ width }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="wk-dialog-head">
                    {icon}
                    <span style={{ flex: 1, fontSize: 'var(--wk-t-body)', fontWeight: 600 }}>{title}</span>
                    <button
                        type="button"
                        className="wk-btn wk-btn--ghost wk-btn--icon wk-btn--sm"
                        onClick={onClose}
                        aria-label="关闭"
                        title="关闭"
                    >
                        ×
                    </button>
                </div>
                <div className="wk-dialog-body">{children}</div>
                {footer && <div className="wk-dialog-foot">{footer}</div>}
            </div>
        </div>
    )
}

export interface MenuItem {
    key: string
    label: ReactNode
    icon?: ReactNode
    danger?: boolean
    onSelect: () => void
}

/** @desc 行尾「更多」菜单本体（定位由调用方给一个 relative 容器） */
export function Menu({ items, onClose }: { items: ReadonlyArray<MenuItem>; onClose: () => void }) {
    return (
        <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={onClose} aria-hidden />
            <div className="wk-menu" role="menu" style={{ right: 0, bottom: '100%', marginBottom: '0.25rem' }}>
                {items.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        role="menuitem"
                        className={`wk-menu-item${item.danger ? ' wk-menu-item--danger' : ''}`}
                        onClick={() => {
                            item.onSelect()
                            onClose()
                        }}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                ))}
            </div>
        </>
    )
}
