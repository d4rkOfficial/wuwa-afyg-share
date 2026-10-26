'use client'

// 我的工程列表：搜索 + 分页（本地过滤，切页不重新请求）。
import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import ManageProjectRow from '@/components/manage-project-row'
import type { ProjectListItem } from '@/lib/types/db'

const PER_PAGE = 8

interface Props {
    projects: ProjectListItem[]
    /** @desc 角色名 → 头像地址（工程卡里的队伍 Badge） */
    icons?: Record<string, string>
}

export default function MeProjects({ projects, icons }: Props) {
    const [q, setQ] = useState('')
    const [page, setPage] = useState(1)

    const filtered = useMemo(() => {
        const key = q.trim().toLowerCase()
        if (!key) return projects
        return projects.filter((p) => {
            const haystack = [p.title, p.description ?? '', p.code, ...(p.tags ?? []), p.author_name]
                .join('\n')
                .toLowerCase()
            return haystack.includes(key)
        })
    }, [projects, q])

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
    const current = Math.min(page, totalPages)
    const items = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE)


    const pages = useMemo(() => {
        // 页码按钮：总数 <= 7 全显示；否则首尾 + 当前附近 + 省略号
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
        const set = new Set<number>([1, totalPages, current, current - 1, current + 1])
        const list = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b)
        const out: Array<number | '…'> = []
        list.forEach((n, i) => {
            if (i > 0 && n - (list[i - 1] as number) > 1) out.push('…')
            out.push(n)
        })
        return out
    }, [totalPages, current])

    return (
        <div className="space-y-3">
            {/* 搜索 + 计数 */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--input-bg) px-2.5 py-1.5">
                    <Icon icon="mdi:magnify" className="size-4 shrink-0 text-(--muted)" />
                    <input
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value)
                            // 搜索条件一变就回到第一页（否则可能停在已被过滤掉的页码上）
                            setPage(1)
                        }}
                        placeholder="搜索标题 / 简介 / 标签 / 分享码"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--muted)"
                    />
                    {q && (
                        <button
                            onClick={() => setQ('')}
                            className="shrink-0 text-(--muted) transition-colors hover:text-(--fg)"
                            aria-label="清空搜索"
                        >
                            <Icon icon="mdi:close" className="size-3.5" />
                        </button>
                    )}
                </div>
                <span className="shrink-0 text-[11px] text-(--muted)">
                    {q ? (
                        <>
                            匹配 <span className="mg-num text-(--fg)">{filtered.length}</span> / {projects.length}
                        </>
                    ) : (
                        <>
                            共 <span className="mg-num text-(--fg)">{projects.length}</span> 个
                        </>
                    )}
                </span>
            </div>

            {items.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-(--card-border) p-8 text-center">
                    <Icon icon="mdi:account-search-outline" className="size-8 text-(--muted)" />
                    <p className="text-sm text-(--muted)">
                        {q ? `没有匹配「${q.trim()}」的工程` : '还没有上传过工程，去分享第一个吧'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map((p) => (
                        <ManageProjectRow key={p.id} project={p} icons={icons} />
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
                    <button
                        onClick={() => setPage(Math.max(1, current - 1))}
                        disabled={current <= 1}
                        className="rounded-sm border border-(--card-border) bg-(--card) px-2 py-1 text-[11px] text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-40"
                    >
                        上一页
                    </button>
                    {pages.map((p, i) =>
                        p === '…' ? (
                            <span key={`gap-${i}`} className="px-1 text-[11px] text-(--muted)">
                                …
                            </span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => setPage(p)}
                                aria-current={p === current}
                                className={`min-w-7 rounded-sm border px-2 py-1 text-[11px] transition-colors ${
                                    p === current
                                        ? 'border-(--accent) bg-(--accent) text-(--accent-fg)'
                                        : 'border-(--card-border) bg-(--card) text-(--muted) hover:text-(--fg)'
                                }`}
                            >
                                {p}
                            </button>
                        )
                    )}
                    <button
                        onClick={() => setPage(Math.min(totalPages, current + 1))}
                        disabled={current >= totalPages}
                        className="rounded-sm border border-(--card-border) bg-(--card) px-2 py-1 text-[11px] text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-40"
                    >
                        下一页
                    </button>
                </div>
            )}
        </div>
    )
}
