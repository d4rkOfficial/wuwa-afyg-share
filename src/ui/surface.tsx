'use client'

// 设计系统原语 · 版面与展示（保留 API，输出 .wk-* 类）
import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`wk-card ${className}`}>{children}</div>
}

export function CardHead({
    title,
    icon,
    actions,
    children
}: {
    title?: ReactNode
    icon?: ReactNode
    actions?: ReactNode
    children?: ReactNode
}) {
    return (
        <div className="wk-card-head">
            {icon}
            {title != null && <span style={{ fontSize: 'var(--wk-t-lead)', fontWeight: 600 }}>{title}</span>}
            {children}
            <div style={{ flex: 1 }} />
            {actions}
        </div>
    )
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`wk-card-body ${className}`}>{children}</div>
}

export type BadgeTone = 'default' | 'accent' | 'ok' | 'warn' | 'danger'

export function Badge({ tone = 'default', children }: { tone?: BadgeTone; children: ReactNode }) {
    return <span className={`wk-badge${tone === 'default' ? '' : ` wk-badge--${tone}`}`}>{children}</span>
}

export function Divider({ className = '' }: { className?: string }) {
    return <div className={`wk-divider ${className}`} />
}

export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <div className={`wk-toolbar ${className}`}>{children}</div>
}

export function ToolbarSep() {
    return <span className="wk-toolbar-sep" aria-hidden />
}

export function EmptyState({
    icon,
    title,
    hint,
    action
}: {
    icon?: ReactNode
    title: ReactNode
    hint?: ReactNode
    action?: ReactNode
}) {
    return (
        <div className="wk-empty">
            {icon}
            <p style={{ fontSize: 'var(--wk-t-body)', color: 'var(--wk-fg)' }}>{title}</p>
            {hint && <p className="wk-meta">{hint}</p>}
            {action}
        </div>
    )
}

export function Skeleton({ className = '', height = '1rem' }: { className?: string; height?: string }) {
    return <div className={`wk-skeleton ${className}`} style={{ height }} />
}

/** @desc 统一页面标题区（标题 + 一句说明 + 右侧操作） */
export function PageHeader({
    title,
    sub,
    actions,
    badge
}: {
    title: ReactNode
    sub?: ReactNode
    actions?: ReactNode
    badge?: ReactNode
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
            {actions && <Toolbar>{actions}</Toolbar>}
        </header>
    )
}

export interface Column {
    key: string
    title: ReactNode
    width?: string
    align?: 'left' | 'right' | 'center'
}

/** @desc 极简表格：调用方只给列定义和行内容（行内容自己拼 <td>） */
export function Table({
    columns,
    children,
    minWidth = 640
}: {
    columns: ReadonlyArray<Column>
    children: ReactNode
    minWidth?: number
}) {
    return (
        <div className="wk-table-wrap">
            <table className="wk-table" style={{ minWidth }}>
                <thead>
                    <tr>
                        {columns.map((col) => (
                            <th key={col.key} style={{ width: col.width, textAlign: col.align ?? 'left' }} scope="col">
                                {col.title}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    )
}
