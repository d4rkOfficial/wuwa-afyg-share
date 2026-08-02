'use client'

import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { BUFF_ZONE_MAP, BUFF_SCOPE_LABELS } from '@/lib/consts/buff-zones'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

interface Props {
    rows: BuffSetRow[]
}

// 主类型 tab：角色 / 武器 / 首位声骸 / 套装（套装合并件数）
const MAIN_TABS: Array<{ type: BuffEntityType; label: string }> = [
    { type: 'character', label: '角色' },
    { type: 'weapon', label: '武器' },
    { type: 'echo', label: '首位声骸' },
    { type: '1set', label: '套装' }
]

function isSet(type: BuffEntityType) {
    return type === '1set' || type === '2set' || type === '3set' || type === '4set' || type === '5set'
}

function zoneLabel(id: string) {
    return BUFF_ZONE_MAP.get(id)?.label ?? id
}

export default function BuffSetsBrowser({ rows }: Props) {
    const [tab, setTab] = useState<BuffEntityType>('character')
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<{ entityType: BuffEntityType; entityName: string } | null>(null)

    // 按实体分组（套装：同名不同件数合并，件数列表作子信息）
    const entities = useMemo(() => {
        const map = new Map<string, { entityType: BuffEntityType; entityName: string; pieces: number[]; buffs: BuffSetRow[] }>()
        for (const r of rows) {
            const key = `${r.entity_type}/${r.entity_name}`
            const exist = map.get(key)
            if (exist) {
                exist.buffs.push(r)
                if (isSet(r.entity_type)) {
                    const n = Number(r.entity_type[0])
                    if (!exist.pieces.includes(n)) exist.pieces.push(n)
                }
            } else {
                map.set(key, {
                    entityType: r.entity_type,
                    entityName: r.entity_name,
                    pieces: isSet(r.entity_type) ? [Number(r.entity_type[0])] : [],
                    buffs: [r]
                })
            }
        }
        return [...map.values()].sort((a, b) => a.entityName.localeCompare(b.entityName, 'zh'))
    }, [rows])

    const visible = useMemo(() => {
        const q = search.trim()
        return entities.filter((e) => {
            const inTab = tab === '1set' ? isSet(e.entityType) : e.entityType === tab
            if (!inTab) return false
            if (!q) return true
            return e.entityName.includes(q)
        })
    }, [entities, tab, search])

    const selectedBuffs = selected
        ? rows.filter((r) => r.entity_type === selected.entityType && r.entity_name === selected.entityName)
        : []

    return (
        <div className="flex flex-col gap-4 md:flex-row">
            {/* 左侧：实体列表 */}
            <div className="w-full shrink-0 md:w-64">
                {/* 类型 tabs */}
                <div className="mb-2 flex flex-wrap gap-1">
                    {MAIN_TABS.map((t) => (
                        <button
                            key={t.type}
                            onClick={() => {
                                setTab(t.type)
                                setSelected(null)
                            }}
                            className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                                tab === t.type
                                    ? 'bg-(--accent)/15 text-(--accent-text)'
                                    : 'text-(--muted) hover:bg-(--card-hover)'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <input
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        setSelected(null)
                    }}
                    placeholder="搜索实体名"
                    className="mb-2 w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                />

                <div className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-0.5 md:max-h-[70vh]">
                    {visible.length === 0 && (
                        <div className="px-2 py-6 text-center text-sm text-(--muted)">暂无实体</div>
                    )}
                    {visible.map((e) => {
                        const active =
                            selected?.entityType === e.entityType && selected.entityName === e.entityName
                        return (
                            <button
                                key={`${e.entityType}/${e.entityName}`}
                                onClick={() => setSelected({ entityType: e.entityType, entityName: e.entityName })}
                                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                                    active ? 'bg-(--accent)/15 text-(--accent-text)' : 'text-(--fg) hover:bg-(--card-hover)'
                                }`}
                            >
                                <span className="min-w-0 flex-1 truncate">{e.entityName}</span>
                                {e.pieces.length > 0 && (
                                    <span className="shrink-0 text-[10px] text-(--muted)">
                                        {e.pieces.join('/')}件
                                    </span>
                                )}
                                <span className="shrink-0 rounded-full bg-(--accent)/15 px-1.5 py-0.5 text-[10px] text-(--accent-text)">
                                    {e.buffs.length}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* 右侧：选中实体的 buff 明细 */}
            <div className="min-w-0 flex-1">
                {selectedBuffs.length === 0 ? (
                    <div className="rounded-xl border border-(--card-border) bg-(--card) p-10 text-center text-sm text-(--muted)">
                        <Icon icon="mdi:arrow-left" className="mx-auto mb-2 size-6" />
                        从左侧选择一个实体查看其 Buff
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-(--fg)">{selected!.entityName}</h2>
                            {selectedBuffs[0].exclusive && (
                                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                                    效应专属
                                </span>
                            )}
                            <span className="text-xs text-(--muted)">{selectedBuffs.length} 条</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {selectedBuffs.map((item) => (
                                <div
                                    key={`${item.entity_type}/${item.entity_name}/${item.buff_name}`}
                                    className="rounded-xl border border-(--card-border) bg-(--card) p-4"
                                >
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className="truncate text-sm font-medium text-(--fg)">{item.buff_name}</span>
                                        <span className="shrink-0 rounded bg-(--accent)/10 px-1.5 py-0.5 text-[10px] text-(--accent-text)">
                                            {BUFF_SCOPE_LABELS[item.scope] ?? item.scope}
                                        </span>
                                        {isSet(item.entity_type) && (
                                            <span className="shrink-0 text-[10px] text-(--muted)">
                                                {item.entity_type[0]}件
                                            </span>
                                        )}
                                    </div>
                                    <ul className="space-y-1">
                                        {item.buff_set.map((zone, i) => (
                                            <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                                <span className="truncate text-(--muted)">
                                                    {zoneLabel(zone.zoneId)}
                                                    {zone.ref && (
                                                        <span className="ml-1 text-[10px] text-(--info)">
                                                            引用{zoneLabel(zone.ref.targetZoneId)}×{zone.ref.pct}%
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="shrink-0 text-(--fg)">
                                                    {zone.override ? '覆盖+ ' : '+ '}
                                                    {zone.ref ? '引用' : zone.value}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
