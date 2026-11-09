'use client'

// 工程管理（新系统）
// 结构变化：搜索与状态过滤合成一条工具条（旧版是「大搜索框 + 主按钮 + 一排 11px 过滤按钮」）；
// 行内操作收到 2 个（编辑 / 更多）；所有破坏性操作走统一确认弹窗。
import { useEffect, useRef, useState, useTransition } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import {
    WkBadge,
    WkButton,
    WkConfirm,
    WkDialog,
    WkField,
    WkInput,
    WkMenu,
    WkSegmented,
    WkToolbar,
    wkToast
} from '@/design'
import {
    adminDeleteProject,
    adminListProjects,
    adminSetProjectExpiry,
    adminUpdateProject,
    type AdminProjectFilter
} from '@/lib/actions/admin-projects'
import { adminDeleteUserContent, adminUserSummary } from '@/lib/actions/project-protection'
import { setProjectProtected } from '@/lib/actions/project-protection'
import { formatCount, formatDate } from '@/lib/utils/format'
import { isExpiredProject, isGracePeriod } from '@/lib/utils/expiry'
import type { ProjectListItem } from '@/lib/types/db'
import { isImeComposing } from '@/lib/keyboard'

const PAGE_SIZE = 20

const FILTERS = [
    { value: 'all', label: '全部' },
    { value: 'expired', label: '已过期' },
    { value: 'permanent', label: '永久' },
    { value: 'protected', label: '已保护' },
    { value: 'unpublished', label: '未发布' }
]

function dateOnly(iso: string | null): string {
    return iso ? iso.slice(0, 10) : ''
}

export default function AdminProjects() {
    const [items, setItems] = useState<ProjectListItem[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [query, setQuery] = useState('')
    const [filter, setFilter] = useState<AdminProjectFilter>('all')
    const [loading, setLoading] = useState(true)
    const [pending, startTransition] = useTransition()

    const [editing, setEditing] = useState<ProjectListItem | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editAuthor, setEditAuthor] = useState('')
    const [editExpiry, setEditExpiry] = useState('')
    const [menuId, setMenuId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<ProjectListItem | null>(null)
    const [cleanUser, setCleanUser] = useState('')
    const [cleanInfo, setCleanInfo] = useState<{ username: string; projectCount: number } | null>(null)
    const [cleanOpen, setCleanOpen] = useState(false)

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    function load(next: { q?: string; page?: number; filter?: AdminProjectFilter } = {}) {
        startTransition(async () => {
            setLoading(true)
            const result = await adminListProjects({
                q: next.q ?? query,
                page: next.page ?? page,
                pageSize: PAGE_SIZE,
                filter: next.filter ?? filter
            })
            if (result.error) wkToast(result.error, 'error')
            else {
                setItems(result.data?.items ?? [])
                setTotal(result.data?.total ?? 0)
            }
            setLoading(false)
        })
    }

    useEffect(() => {
        load({ page: 1 })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function onSearch(value: string) {
        setQuery(value)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => {
            setPage(1)
            load({ q: value, page: 1 })
        }, 400)
    }

    function openEdit(row: ProjectListItem) {
        setMenuId(null)
        setEditing(row)
        setEditTitle(row.title)
        setEditAuthor(row.author_name)
        setEditExpiry(dateOnly(row.expires_at))
    }

    function saveEdit() {
        if (!editing) return
        startTransition(async () => {
            const updated = await adminUpdateProject(editing.id, { title: editTitle.trim(), authorName: editAuthor.trim() })
            if (updated.error) {
                wkToast(updated.error, 'error')
                return
            }
            if (dateOnly(editing.expires_at) !== editExpiry) {
                const expiry = await adminSetProjectExpiry(editing.id, editExpiry ? `${editExpiry}T23:59:59.999+08:00` : null)
                if (expiry.error) {
                    wkToast(expiry.error, 'error')
                    return
                }
            }
            wkToast('已保存', 'ok')
            setEditing(null)
            load()
        })
    }

    function remove(row: ProjectListItem) {
        startTransition(async () => {
            const result = await adminDeleteProject(row.id)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast('已删除工程', 'ok')
            setDeleting(null)
            load()
        })
    }

    function toggleProtect(row: ProjectListItem) {
        setMenuId(null)
        startTransition(async () => {
            const result = await setProjectProtected(row.id, !row.protected)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(row.protected ? '已取消保护' : '已保护', 'ok')
            load()
        })
    }

    function lookupUser() {
        const name = cleanUser.trim()
        if (!name) return
        startTransition(async () => {
            const result = await adminUserSummary(name)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            setCleanInfo(result.data ?? null)
            setCleanOpen(true)
        })
    }

    function wipeUser() {
        if (!cleanInfo) return
        startTransition(async () => {
            const result = await adminDeleteUserContent(cleanInfo.username)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(`已删除 ${result.data?.deletedProjects ?? 0} 个工程`, 'ok')
            setCleanOpen(false)
            setCleanInfo(null)
            setCleanUser('')
            load()
        })
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <WkToolbar>
                <WkInput
                    value={query}
                    onChange={(event) => onSearch(event.target.value)}
                    placeholder="搜索标题 / 作者 / 分享码"
                    aria-label="搜索工程"
                    style={{ flex: 1, minWidth: 200, maxWidth: 300 }}
                />
                <WkSegmented
                    value={filter}
                    onChange={(next) => {
                        setFilter(next as AdminProjectFilter)
                        setPage(1)
                        load({ filter: next as AdminProjectFilter, page: 1 })
                    }}
                    ariaLabel="状态过滤"
                    options={FILTERS}
                />
                <span className="wk-meta">共 {total} 个</span>
            </WkToolbar>

            <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 760 }}>
                    <div
                        className="wk-rows"
                        style={{ '--wk-cols': 'minmax(0, 1fr) 92px 112px 104px 116px 128px' } as CSSProperties}
                    >
                        <div className="wk-tr wk-tr--head">
                            <span>标题</span>
                            <span>分享码</span>
                            <span>作者</span>
                            <span>过期</span>
                            <span className="wk-num">查看 / 克隆</span>
                            <span className="wk-num">操作</span>
                        </div>
                        {loading && items.length === 0 && (
                            <div className="wk-tr wk-tr--body">
                                <span className="wk-meta">加载中…</span>
                            </div>
                        )}
                        {!loading && items.length === 0 && (
                            <div className="wk-tr wk-tr--body">
                                <span className="wk-meta">没有匹配的工程</span>
                            </div>
                        )}
                        {items.map((row) => {
                            const expired = isExpiredProject(row.expires_at, row.author_name)
                            const grace = isGracePeriod(row.expires_at, row.author_name)
                            return (
                                <div className="wk-tr wk-tr--body" key={row.id}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                        <Link
                                            href={`/share/${row.code}`}
                                            style={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                color: 'var(--wk-fg)',
                                                textDecoration: 'none'
                                            }}
                                        >
                                            {row.title}
                                        </Link>
                                        {row.protected && <WkBadge tone="accent">保护</WkBadge>}
                                        {!row.published && <WkBadge>未发布</WkBadge>}
                                    </span>
                                    <span className="wk-meta">/{row.code}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {row.author_name}
                                    </span>
                                    <span>
                                        {expired ? (
                                            <WkBadge tone="danger">已过期</WkBadge>
                                        ) : grace ? (
                                            <WkBadge tone="warn">宽限中</WkBadge>
                                        ) : row.expires_at ? (
                                            <span className="wk-meta">{dateOnly(row.expires_at)}</span>
                                        ) : (
                                            <WkBadge>永久</WkBadge>
                                        )}
                                    </span>
                                    <span className="wk-num wk-meta">
                                        {formatCount(row.view_count)} / {formatCount(row.clone_count)}
                                    </span>
                                    <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                        <WkButton size="sm" variant="quiet" onClick={() => openEdit(row)}>
                                            编辑
                                        </WkButton>
                                        <div className="wk-pop">
                                            <WkButton
                                                size="sm"
                                                variant="quiet"
                                                aria-haspopup="menu"
                                                onClick={() => setMenuId(menuId === row.id ? null : row.id)}
                                            >
                                                更多
                                            </WkButton>
                                            {menuId === row.id && (
                                                <WkMenu
                                                    onClose={() => setMenuId(null)}
                                                    items={[
                                                        {
                                                            key: 'protect',
                                                            label: row.protected ? '取消保护' : '保护工程',
                                                            onSelect: () => toggleProtect(row)
                                                        },
                                                        {
                                                            key: 'delete',
                                                            label: '删除…',
                                                            danger: true,
                                                            onSelect: () => setDeleting(row)
                                                        }
                                                    ]}
                                                />
                                            )}
                                        </div>
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {totalPages > 1 && (
                <nav className="wk-pager" aria-label="分页">
                    <WkButton
                        size="sm"
                        disabled={page <= 1 || pending}
                        onClick={() => {
                            const next = Math.max(1, page - 1)
                            setPage(next)
                            load({ page: next })
                        }}
                    >
                        上一页
                    </WkButton>
                    <span className="wk-meta">
                        第 {page} / {totalPages} 页
                    </span>
                    <WkButton
                        size="sm"
                        disabled={page >= totalPages || pending}
                        onClick={() => {
                            const next = Math.min(totalPages, page + 1)
                            setPage(next)
                            load({ page: next })
                        }}
                    >
                        下一页
                    </WkButton>
                </nav>
            )}

            {/* 按用户名清空：低频危险工具，独立一节而不是压在工具条里 */}
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--wk-line)' }}>
                <div className="wk-label" style={{ marginBottom: 6 }}>
                    按用户清空（保护工程除外）
                </div>
                <div className="wk-toolbar">
                    <WkInput
                        value={cleanUser}
                        onChange={(event) => setCleanUser(event.target.value)}
                        onKeyDown={(event) => {
                            if (isImeComposing(event)) return
                            if (event.key === 'Enter') lookupUser()
                        }}
                        placeholder="用户名"
                        aria-label="要清空的用户名"
                        style={{ maxWidth: 220 }}
                    />
                    <WkButton size="sm" variant="danger" onClick={lookupUser} disabled={pending || !cleanUser.trim()}>
                        查询并清空
                    </WkButton>
                </div>
            </div>

            {/* 编辑弹窗 */}
            <WkDialog
                open={!!editing}
                onClose={() => setEditing(null)}
                title="编辑工程"
                footer={
                    <>
                        <WkButton variant="quiet" onClick={() => setEditing(null)} disabled={pending}>
                            取消
                        </WkButton>
                        <WkButton variant="primary" onClick={saveEdit} disabled={pending}>
                            {pending ? '保存中…' : '保存'}
                        </WkButton>
                    </>
                }
            >
                <WkField label="标题">
                    <WkInput value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={60} />
                </WkField>
                <WkField label="作者名">
                    <WkInput value={editAuthor} onChange={(event) => setEditAuthor(event.target.value)} />
                </WkField>
                <WkField label="过期时间" hint={editExpiry ? `到期日 ${editExpiry} 23:59 后失效` : '永久有效'}>
                    <div className="wk-toolbar">
                        <WkInput
                            type="date"
                            value={editExpiry}
                            onChange={(event) => setEditExpiry(event.target.value)}
                            style={{ maxWidth: 200 }}
                            aria-label="到期日期"
                        />
                        <WkButton size="sm" variant="quiet" onClick={() => setEditExpiry('')}>
                            设为永久
                        </WkButton>
                    </div>
                </WkField>
                <p className="wk-meta">分享码 /{editing?.code ?? ''} · 创建于 {editing ? formatDate(editing.created_at) : ''}</p>
            </WkDialog>

            <WkConfirm
                open={!!deleting}
                onClose={() => setDeleting(null)}
                title={`删除「${deleting?.title ?? ''}」？`}
                description="分享链接会立刻失效，克隆过的人不受影响。受保护的工程需要先解除保护。"
                confirmLabel="永久删除"
                busy={pending}
                onConfirm={() => deleting && remove(deleting)}
            />

            <WkConfirm
                open={cleanOpen}
                onClose={() => {
                    setCleanOpen(false)
                    setCleanInfo(null)
                }}
                title={`清空「${cleanInfo?.username ?? ''}」的全部工程？`}
                description={`共 ${cleanInfo?.projectCount ?? 0} 个工程会被删除（受保护的除外），分享链接立即失效。`}
                confirmLabel="清空"
                busy={pending}
                onConfirm={wipeUser}
            />
        </div>
    )
}
