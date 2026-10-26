'use client'

// 标准词条集浏览（工作台式布局）：左侧角色 sidebar + 右侧 5 部位明细主内容区。
import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'

import { countPlanSubstats } from '@/lib/utils/echo-plan'
import { ECHO_MAX_TOTAL_COST, SUBSTAT_TOTAL_COUNT } from '@/lib/consts/echo-stats'
import type { EchoStatValue, StandardSubstatSetRow } from '@/lib/types/db'

interface Props {
    rows: StandardSubstatSetRow[]
    /** @desc 角色名 → 角色头像地址（直接按名字取图，不做哈希） */
    icons?: Record<string, string>
}

/** @desc 角色小头像（无图时退回人形图标） */
function CharacterIcon({ url, className = 'size-5' }: { url?: string; className?: string }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-(--card-hover) ${className}`}
        >
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
                <Icon icon="mdi:account-outline" className="size-3.5 text-(--muted)" />
            )}
        </span>
    )
}

function statText(stat: EchoStatValue | null | undefined): string {
    if (!stat) return '—'
    return `${stat.type}${stat.value}${stat.unit ?? ''}`
}

export default function SubstatSetsBrowser({ rows, icons = {} }: Props) {
    const [search, setSearch] = useState('')
    const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null)

    const visible = useMemo(() => {
        const q = search.trim()
        const list = q ? rows.filter((r) => r.character_name.includes(q)) : rows
        return [...list].sort((a, b) => a.character_name.localeCompare(b.character_name, 'zh'))
    }, [rows, search])

    const selected = rows.find((r) => r.id === selectedId) ?? visible[0] ?? null

    return (
        <div className="workbench">
            {/* ── sidebar：角色列表 ── */}
            <aside className="workbench-sidebar" aria-label="角色列表">
                <div className="flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1.5">
                    <Icon icon="mdi:magnify" className="size-4 shrink-0 text-(--muted)" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="搜索角色名"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--muted)"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="shrink-0 text-(--muted) transition-colors hover:text-(--fg)"
                            aria-label="清空搜索"
                        >
                            <Icon icon="mdi:close" className="size-3.5" />
                        </button>
                    )}
                </div>

                <div className="workbench-list">
                    <div className="workbench-group">
                        <Icon icon="mdi:account-outline" className="size-3" />
                        角色
                        <span className="workbench-item-meta ml-auto">{visible.length}</span>
                    </div>
                    {visible.length === 0 && (
                        <p className="px-2 py-8 text-center text-xs text-(--muted)">没有匹配的角色</p>
                    )}
                    {visible.map((row) => {
                        const total = countPlanSubstats(row.plan)
                        return (
                            <button
                                key={row.id}
                                onClick={() => setSelectedId(row.id)}
                                data-active={(selected?.id ?? '') === row.id}
                                className="workbench-item"
                            >
                                <CharacterIcon url={icons[row.character_name]} />
                                <span className="min-w-0 flex-1 truncate">{row.character_name}</span>
                                <span
                                    className={`workbench-item-meta ${
                                        total === SUBSTAT_TOTAL_COUNT ? '' : 'text-(--warning)'
                                    }`}
                                >
                                    {total} 条
                                </span>
                            </button>
                        )
                    })}
                </div>
            </aside>

            {/* ── 主内容区 ── */}
            <section className="workbench-main">
                {!selected ? (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-(--card-border) p-8 text-center">
                        <Icon icon="mdi:clipboard-text-outline" className="size-9 text-(--muted)" />
                        <p className="text-sm text-(--muted)">从左侧选择一个角色，查看它的标准 14 词条方案</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <header className="mg-card p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <CharacterIcon url={icons[selected.character_name]} className="size-11 border border-(--card-border)" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="mg-title truncate text-lg">{selected.character_name}</h2>
                                        <span className="rounded-sm bg-(--accent) px-1.5 py-0.5 text-[10px] text-(--accent-fg)">
                                            标准 14 词条
                                        </span>
                                    </div>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--muted)">
                                        <span>
                                            cost{' '}
                                            <span className="mg-num text-(--fg)">
                                                {selected.plan.slots.reduce((sum, s) => sum + s.cost, 0)}
                                            </span>{' '}
                                            / {ECHO_MAX_TOTAL_COST}
                                        </span>
                                        <span>
                                            副词条{' '}
                                            <span className="mg-num text-(--fg)">
                                                {countPlanSubstats(selected.plan)}
                                            </span>{' '}
                                            / {SUBSTAT_TOTAL_COUNT}
                                        </span>
                                        {selected.note && <span className="truncate">{selected.note}</span>}
                                    </p>
                                </div>
                            </div>
                        </header>

                        <div className="space-y-3">
                            {selected.plan.slots.map((slot, i) => (
                                <article key={i} className="mg-card p-3.5">
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-(--accent) text-[11px] font-black text-(--accent-fg)">
                                            {slot.cost}C
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-sm text-(--fg)">
                                            {statText(slot.mainStat)}
                                            {slot.secondMainStat && (
                                                <span className="text-(--muted)"> +{slot.secondMainStat.value}</span>
                                            )}
                                        </span>
                                        <span className="shrink-0 text-[10px] text-(--muted)">
                                            {slot.substats?.length ?? 0} 条副词条
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(slot.substats ?? []).map((stat, j) => (
                                            <span
                                                key={`${stat.type}-${j}`}
                                                className="rounded-sm border border-(--card-border) bg-(--card-hover) px-1.5 py-0.5 text-[11px] text-(--muted)"
                                            >
                                                {statText(stat)}
                                            </span>
                                        ))}
                                        {(slot.substats?.length ?? 0) === 0 && (
                                            <span className="text-[11px] text-(--muted)">无副词条</span>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                )}
            </section>
        </div>
    )
}
