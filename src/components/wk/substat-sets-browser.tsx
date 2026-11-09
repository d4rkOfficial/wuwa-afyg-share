'use client'

// 标准词条集浏览（新系统）
// 原来的「左侧角色栏 + 右侧明细」工作台被去掉：列表页用不着常驻侧栏，
// 角色切换改成可展开的条目（原生 <details>，无 JS 也能用）。
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { WkBadge, WkInput, WkToolbar } from '@/design'
import { countPlanSubstats } from '@/lib/utils/echo-plan'
import { ECHO_MAX_TOTAL_COST, SUBSTAT_TOTAL_COUNT } from '@/lib/consts/echo-stats'
import type { EchoStatValue, StandardSubstatSetRow } from '@/lib/types/db'

function statText(stat: EchoStatValue | null | undefined): string {
    if (!stat) return '—'
    return `${stat.type}${stat.value}${stat.unit ?? ''}`
}

export default function SubstatSetsBrowser({
    rows,
    icons = {}
}: {
    rows: StandardSubstatSetRow[]
    icons?: Record<string, string>
}) {
    const [search, setSearch] = useState('')

    const visible = useMemo(() => {
        const key = search.trim()
        const list = key ? rows.filter((row) => row.character_name.includes(key)) : rows
        return [...list].sort((a, b) => a.character_name.localeCompare(b.character_name, 'zh'))
    }, [rows, search])

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <WkToolbar>
                <WkInput
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索角色名"
                    aria-label="搜索角色"
                    style={{ flex: 1, minWidth: 180, maxWidth: 260 }}
                />
                {search && (
                    <WkToolbar>
                        <button type="button" className="wk-clear" onClick={() => setSearch('')}>
                            清空
                        </button>
                    </WkToolbar>
                )}
                <span className="wk-meta">
                    {search ? `匹配 ${visible.length} / ${rows.length}` : `共 ${rows.length} 个角色`}
                </span>
            </WkToolbar>

            {visible.length === 0 ? (
                <p className="wk-meta" style={{ padding: '24px 0' }}>
                    没有匹配「{search.trim()}」的角色
                </p>
            ) : (
                <div>
                    {visible.map((row) => {
                        const total = countPlanSubstats(row.plan)
                        const cost = row.plan.slots.reduce((sum, slot) => sum + slot.cost, 0)
                        const avatar = icons[row.character_name]

                        return (
                            <details key={row.id} className="wk-acc">
                                <summary>
                                    <span className="wk-pcard-avatar" style={{ width: 28, height: 28 }}>
                                        {avatar ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={avatar} alt="" loading="lazy" />
                                        ) : null}
                                    </span>
                                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.character_name}</span>
                                    <WkBadge>cost {cost}/{ECHO_MAX_TOTAL_COST}</WkBadge>
                                    <WkBadge tone={total === SUBSTAT_TOTAL_COUNT ? 'ok' : 'warn'}>
                                        {total} 条
                                    </WkBadge>
                                    {row.note && (
                                        <span className="wk-meta" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {row.note}
                                        </span>
                                    )}
                                </summary>

                                <div className="wk-acc-body">
                                    <div className="wk-rows" style={{ '--wk-cols': '96px minmax(0, 1fr)' } as CSSProperties}>
                                        {row.plan.slots.map((slot, slotIndex) => (
                                            <div className="wk-tr wk-tr--body" key={slotIndex}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <WkBadge tone="accent">{slot.cost}C</WkBadge>
                                                    <span className="wk-meta">{slotIndex + 1}</span>
                                                </span>
                                                <span
                                                    style={{
                                                        display: 'flex',
                                                        flexWrap: 'wrap',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        minWidth: 0
                                                    }}
                                                >
                                                    <span style={{ fontSize: 'var(--wk-t-meta)', color: 'var(--wk-fg)' }}>
                                                        {statText(slot.mainStat)}
                                                        {slot.secondMainStat && (
                                                            <span className="wk-meta"> +{slot.secondMainStat.value}</span>
                                                        )}
                                                    </span>
                                                    {(slot.substats ?? []).map((stat, statIndex) => (
                                                        <span
                                                            key={`${stat.type}-${statIndex}`}
                                                            className="wk-badge"
                                                            style={{ height: 18, padding: '0 5px' }}
                                                        >
                                                            {statText(stat)}
                                                        </span>
                                                    ))}
                                                    {(slot.substats?.length ?? 0) === 0 && (
                                                        <span className="wk-meta">无副词条</span>
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
