'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import {
    adminListProjects,
    adminUpdateProject,
    adminSetProjectExpiry,
    adminDeleteProject
} from '@/lib/actions/admin-projects'
import { setProjectProtected } from '@/lib/actions/project-protection'
import AdminUserCleaner from '@/components/admin/admin-user-cleaner'
import { toast } from '@/components/ui/toast'
import { isExpiredProject, isGracePeriod } from '@/lib/utils/expiry'
import type { ProjectListItem } from '@/lib/types/db'

export default function AdminProjects() {
    const [items, setItems] = useState<ProjectListItem[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [q, setQ] = useState('')
    const [loading, setLoading] = useState(true)
    const [pending, startTransition] = useTransition()
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editAuthor, setEditAuthor] = useState('')
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
    const pageSize = 20
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page])

    function load() {
        startTransition(async () => {
            setLoading(true)
            const res = await adminListProjects({ q, page, pageSize })
            if (res.error) toast(res.error, 'error')
            else {
                setItems(res.data?.items ?? [])
                setTotal(res.data?.total ?? 0)
            }
            setLoading(false)
        })
    }

    function onSearch(value: string) {
        setQ(value)
        if (searchTimer.current) clearTimeout(searchTimer.current)
        searchTimer.current = setTimeout(() => {
            setPage(1)
            load()
        }, 400)
    }

    function openEdit(row: ProjectListItem) {
        setEditingId(row.id)
        setEditTitle(row.title)
        setEditAuthor(row.author_name)
    }

    function run(fn: () => Promise<unknown>, successMsg = '已保存') {
        startTransition(async () => {
            const res = await fn()
            const r = res as { error?: string } | undefined
            if (r?.error) toast(r.error, 'error')
            else {
                toast(successMsg, 'success')
                setEditingId(null)
                setConfirmDeleteId(null)
                load()
            }
        })
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return (
        <div className="buff-admin-shell space-y-4">
            {/* 工具栏 */}
            <div className="flex flex-wrap items-center gap-2">
                <input
                    value={q}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="搜索标题 / 分享码 / 作者"
                    className="w-64 rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                />
                <button
                    onClick={() => {
                        setPage(1)
                        load()
                    }}
                    disabled={pending}
                    className="toolbar-btn toolbar-btn-primary"
                    style={{ background: 'var(--btn-bg)' }}
                >
                    <Icon icon={loading ? 'mdi:loading' : 'mdi:magnify'} className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
                    搜索
                </button>
                <span className="text-xs text-(--muted)">共 {total} 个工程</span>
                <div className="flex-1" />
                <AdminUserCleaner />
            </div>

            {/* 列表 */}
            <div className="overflow-x-auto rounded-xl border border-(--card-border) bg-(--card)">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                        <tr className="border-b border-(--card-border) text-xs text-(--muted)">
                            <th className="px-3 py-2 font-semibold">标题</th>
                            <th className="px-3 py-2 font-semibold">分享码</th>
                            <th className="px-3 py-2 font-semibold">作者</th>
                            <th className="px-3 py-2 font-semibold">过期</th>
                            <th className="px-3 py-2 font-semibold">查看/克隆</th>
                            <th className="px-3 py-2 font-semibold">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((row) => (
                            <tr key={row.id} className="border-b border-(--card-border) last:border-0 hover:bg-(--card-hover)">
                                <td className="max-w-52 px-3 py-2">
                                    {editingId === row.id ? (
                                        <input
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            className="w-full rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-sm outline-none focus:border-(--accent)/60"
                                        />
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            <span className="block truncate font-medium text-(--fg)" title={row.title}>
                                                {row.title}
                                            </span>
                                            {row.protected && (
                                                <span title="保护工程：批量/单条删除与过期清理均豁免">
                                                    <Icon
                                                        icon="mdi:shield-lock-outline"
                                                        className="size-3.5 shrink-0 text-(--accent-text)"
                                                    />
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-(--muted)">{row.code}</td>
                                <td className="px-3 py-2">
                                    {editingId === row.id ? (
                                        <input
                                            value={editAuthor}
                                            onChange={(e) => setEditAuthor(e.target.value)}
                                            className="w-28 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-sm outline-none focus:border-(--accent)/60"
                                        />
                                    ) : (
                                        <span className="text-(--fg)">{row.author_name}</span>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    {(() => {
                                        const expired = isExpiredProject(row.expires_at, row.author_name)
                                        const grace = isGracePeriod(row.expires_at, row.author_name)
                                        if (expired)
                                            return (
                                                <span className="rounded bg-(--danger)/15 px-1.5 py-0.5 text-[10px] text-(--danger)">
                                                    已过期
                                                </span>
                                            )
                                        if (grace)
                                            return (
                                                <span className="rounded bg-(--warning)/15 px-1.5 py-0.5 text-[10px] text-(--warning)">
                                                    宽限中
                                                </span>
                                            )
                                        return (
                                            <span className="text-xs text-(--muted)">
                                                {row.expires_at ? new Date(row.expires_at).toLocaleDateString('zh-CN') : '永久'}
                                            </span>
                                        )
                                    })()}
                                </td>
                                <td className="px-3 py-2 text-xs text-(--muted)">
                                    {row.view_count} / {row.clone_count}
                                </td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-1">
                                        {editingId === row.id ? (
                                            <>
                                                <button
                                                    onClick={() =>
                                                        run(
                                                            () =>
                                                                adminUpdateProject(row.id, {
                                                                    title: editTitle,
                                                                    authorName: editAuthor
                                                                }),
                                                            '已更新工程信息'
                                                        )
                                                    }
                                                    disabled={pending}
                                                    className="rounded border border-(--accent)/40 px-2 py-1 text-[10px] text-(--accent-text) hover:bg-(--accent)/15 disabled:opacity-40"
                                                >
                                                    保存
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="rounded px-2 py-1 text-[10px] text-(--muted) hover:bg-(--card-hover)"
                                                >
                                                    取消
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => openEdit(row)}
                                                    className="rounded p-1 text-(--muted) hover:text-(--accent-text)"
                                                    title="改名"
                                                >
                                                    <Icon icon="mdi:pencil-outline" className="size-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const days = window.prompt('设置过期（填天数，留空=永久）：', '30')
                                                        if (days === null) return
                                                        const expiresAt = days.trim()
                                                            ? new Date(Date.now() + Number(days.trim()) * 86400000).toISOString()
                                                            : null
                                                        if (Number.isNaN(Date.parse(expiresAt ?? ''))) {
                                                            toast('天数无效', 'error')
                                                            return
                                                        }
                                                        run(() => adminSetProjectExpiry(row.id, expiresAt), '已更新过期时间')
                                                    }}
                                                    className="rounded p-1 text-(--muted) hover:text-(--info)"
                                                    title="改过期时间"
                                                >
                                                    <Icon icon="mdi:clock-outline" className="size-4" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        run(
                                                            () => setProjectProtected(row.id, !row.protected),
                                                            row.protected ? '已解除保护' : '已开启保护'
                                                        )
                                                    }
                                                    disabled={pending}
                                                    className="rounded p-1 text-(--muted) hover:text-(--accent-text)"
                                                    title={row.protected ? '解除保护' : '开启保护（豁免批量/单条删除与过期清理）'}
                                                >
                                                    <Icon
                                                        icon={row.protected ? 'mdi:shield-lock-outline' : 'mdi:shield-outline'}
                                                        className="size-4"
                                                    />
                                                </button>
                                                {confirmDeleteId === row.id ? (
                                                    <button
                                                        onClick={() => run(() => adminDeleteProject(row.id), '已删除工程')}
                                                        disabled={pending}
                                                        className="rounded bg-(--danger) px-2 py-1 text-[10px] text-white hover:brightness-110 disabled:opacity-50"
                                                    >
                                                        确认删除
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDeleteId(row.id)}
                                                        onBlur={() => setTimeout(() => setConfirmDeleteId(null), 2000)}
                                                        className="rounded p-1 text-(--muted) hover:text-(--danger)"
                                                        title="删除"
                                                    >
                                                        <Icon icon="mdi:trash-can-outline" className="size-4" />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!loading && items.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-3 py-10 text-center text-sm text-(--muted)">
                                    暂无工程
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 分页 */}
            <div className="flex items-center justify-between text-xs text-(--muted)">
                <span>第 {page} / {totalPages} 页</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1 || pending}
                        className="rounded border border-(--card-border) px-2 py-1 disabled:opacity-40"
                    >
                        上一页
                    </button>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages || pending}
                        className="rounded border border-(--card-border) px-2 py-1 disabled:opacity-40"
                    >
                        下一页
                    </button>
                </div>
            </div>
        </div>
    )
}
