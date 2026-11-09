// 设计系统 v2 · 版面与展示（纯展示，无交互状态 → 不加 'use client'，服务端组件也能直接用）
// 硬规则 H4：表头与每一行共用同一套 --wk-cols；H5：一个视野最多一条分区线，禁止卡片套卡片
import type { CSSProperties, ReactNode } from 'react'
import { cn } from './cn'

export function WkCard({
    children,
    pad = false,
    className,
    ...rest
}: {
    children: ReactNode
    /** @desc 是否加统一内边距（16）。卡内分组优先用留白，不要再套一层卡 */
    pad?: boolean
    className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>) {
    return (
        <div className={cn('wk-card', pad && 'wk-card-pad', className)} {...rest}>
            {children}
        </div>
    )
}

export type WkBadgeTone = 'default' | 'accent' | 'ok' | 'warn' | 'danger'

export function WkBadge({ tone = 'default', children }: { tone?: WkBadgeTone; children: ReactNode }) {
    return <span className={cn('wk-badge', tone !== 'default' && `wk-badge--${tone}`)}>{children}</span>
}

export function WkDivider({ className }: { className?: string }) {
    return <div className={cn('wk-divider', className)} />
}

export function WkSpacer() {
    return <span className="wk-spacer" />
}

export function WkToolbar({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('wk-toolbar', className)}>{children}</div>
}

/** @desc 分区标题：一条线 + 字号对比。区块本身不套卡片 */
export function WkSectionHead({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
    return (
        <div className="wk-section-head">
            <h2 style={{ fontSize: 'var(--wk-t-sec)' }}>{title}</h2>
            {aside && <span className="wk-meta">{aside}</span>}
        </div>
    )
}

export function WkPageHead({
    title,
    sub,
    badge,
    actions
}: {
    title: ReactNode
    sub?: ReactNode
    badge?: ReactNode
    actions?: ReactNode
}) {
    return (
        <header className="wk-page-head">
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <h1 className="wk-page-title">{title}</h1>
                    {badge}
                </div>
                {sub && <p className="wk-page-sub">{sub}</p>}
            </div>
            {actions && <WkToolbar>{actions}</WkToolbar>}
        </header>
    )
}

/**
 * @desc 行网格容器：把列模板写在这里，表头与每一行共用（H4）。
 * 例：<WkRows cols="minmax(0,1fr) 72px 96px">…</WkRows>
 */
export function WkRows({
    cols,
    children,
    className
}: {
    /** @default 'minmax(0, 1fr) 72px 88px 96px' */
    cols?: string
    children: ReactNode
    className?: string
}) {
    return (
        <div
            className={cn('wk-rows', className)}
            style={cols ? ({ ['--wk-cols']: cols } as CSSProperties) : undefined}
        >
            {children}
        </div>
    )
}

export function WkRow({
    head = false,
    children,
    className
}: {
    head?: boolean
    children: ReactNode
    className?: string
}) {
    return <div className={cn('wk-tr', head ? 'wk-tr--head' : 'wk-tr--body', className)}>{children}</div>
}

/** @desc 数字列：右对齐。仿心书没有等宽数字，对齐靠定宽列 + 右对齐，不靠字体 */
export function WkNum({ children }: { children: ReactNode }) {
    return <span className="wk-num">{children}</span>
}

export function WkEmpty({
    icon,
    title,
    hint,
    action,
    className
}: {
    icon?: ReactNode
    title: ReactNode
    hint?: ReactNode
    action?: ReactNode
    /** @desc 额外类名：`wk-empty--card` 可以把空态撑成一张大卡片，避免页面留白 */
    className?: string
}) {
    return (
        <div className={cn('wk-empty', className)}>

            {icon}
            <p style={{ color: 'var(--wk-fg-2)', fontSize: 'var(--wk-t-body)' }}>{title}</p>
            {hint && <p className="wk-meta">{hint}</p>}
            {action}
        </div>
    )
}
