'use client'

// Buff 集浏览（工作台式布局）：左侧实体 sidebar 列表 + 右侧条目明细主内容区。
import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import {
    BUFF_ENTITY_LABELS,
    BUFF_SCOPE_LABELS,
    BUFF_ZONE_MAP,
    describeCondition,
    describeZoneConditionBadge,
    describeZoneRef,
    slotNameFor
} from '@/lib/consts/buff-zones'
import type { EntityIconMaps } from '@/lib/data/avatar-icons'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

interface Props {
    rows: BuffSetRow[]
    /** @desc 四类实体的名字 → 图标地址（角色 / 武器 / 首位声骸 / 套装都要有图标） */
    entityIcons?: EntityIconMaps
}

const GROUPS: Array<{ key: 'character' | 'weapon' | 'echo' | 'set'; label: string; icon: string }> = [
    { key: 'character', label: '角色', icon: 'mdi:account-outline' },
    { key: 'weapon', label: '武器', icon: 'mdi:sword' },
    { key: 'echo', label: '首位声骸', icon: 'mdi:hexagon-outline' },
    { key: 'set', label: '套装', icon: 'mdi:layers-triple-outline' }
]

const isSetType = (t: BuffEntityType) => t === '1set' || t === '2set' || t === '3set' || t === '4set' || t === '5set'

const groupOf = (t: BuffEntityType) => (isSetType(t) ? 'set' : t)

interface Entity {
    key: string
    entityName: string
    entityType: BuffEntityType
    group: 'character' | 'weapon' | 'echo' | 'set'
    pieces: number[]
    buffs: BuffSetRow[]
}

function zoneLabel(id: string) {
    return BUFF_ZONE_MAP.get(id)?.label ?? id
}

type GroupKey = "character" | "weapon" | "echo" | "set"

/** @desc 实体自己的图标：四类实体各查各自的表（不是把名字哈希成随机角色的头像） */
function iconFor(
    group: GroupKey,
    entityName: string,
    maps: EntityIconMaps | undefined
): string | undefined {
    return maps?.[group]?.[entityName]
}

/** @desc 小方图标（无图时退回组图标，保证「所有实体都有图标」） */
function EntityIcon({
    url,
    fallback,
    className = "size-5"
}: {
    url?: string
    fallback: string
    className?: string
}) {
    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-(--card-hover) ${className}`}
        >
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
                <Icon icon={fallback} className="size-3.5 text-(--muted)" />
            )}
        </span>
    )
}

export default function BuffSetsBrowser({ rows, entityIcons }: Props) {
    const [search, setSearch] = useState('')
    const [selectedKey, setSelectedKey] = useState<string | null>(null)

    // 按实体聚合：套装同名的不同件数合并成一条（件数作为子信息）
    const entities = useMemo<Entity[]>(() => {
        const map = new Map<string, Entity>()
        for (const row of rows) {
            const set = isSetType(row.entity_type)
            const key = set ? `set:${row.entity_name}` : `${row.entity_type}:${row.entity_name}`
            let entity = map.get(key)
            if (!entity) {
                entity = {
                    key,
                    entityName: row.entity_name,
                    entityType: row.entity_type,
                    group: groupOf(row.entity_type),
                    pieces: [],
                    buffs: []
                }
                map.set(key, entity)
            }
            entity.buffs.push(row)
            if (set) {
                const n = Number(row.entity_type[0])
                if (Number.isFinite(n) && !entity.pieces.includes(n)) entity.pieces.push(n)
            }
        }
        for (const entity of map.values()) {
            entity.pieces.sort((a, b) => a - b)
            entity.buffs.sort((a, b) => a.buff_name.localeCompare(b.buff_name, 'zh'))
        }
        return [...map.values()].sort((a, b) => a.entityName.localeCompare(b.entityName, 'zh'))
    }, [rows])

    const q = search.trim()
    const grouped = useMemo(() => {
        const visible = q ? entities.filter((e) => e.entityName.includes(q)) : entities
        return GROUPS.map((g) => ({ ...g, items: visible.filter((e) => e.group === g.key) }))
    }, [entities, q])

    const selected = entities.find((e) => e.key === selectedKey) ?? null
    const selectedIcon = selected ? iconFor(selected.group, selected.entityName, entityIcons) : undefined
    const selectedGroup = selected ? GROUPS.find((g) => g.key === selected.group) : undefined

    const scopeCounts = useMemo(() => {
        if (!selected) return []
        const map = new Map<string, number>()
        for (const b of selected.buffs) {
            const label = BUFF_SCOPE_LABELS[b.scope] ?? b.scope
            map.set(label, (map.get(label) ?? 0) + 1)
        }
        return [...map.entries()]
    }, [selected])

    const zoneKinds = useMemo(() => {
        if (!selected) return 0
        const set = new Set<string>()
        for (const b of selected.buffs) for (const z of b.buff_set) set.add(z.zoneId)
        return set.size
    }, [selected])

    return (
        <div className="workbench">
            {/* ── sidebar：实体列表 ── */}
            <aside className="workbench-sidebar" aria-label="实体列表">
                <div className="flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1.5">
                    <Icon icon="mdi:magnify" className="size-4 shrink-0 text-(--muted)" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="搜索实体名"
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
                    {/* 固定四类：角色 / 武器 / 首位声骸 / 套装（空分类也保留标题，分组结构始终可见） */}
                    {grouped.map((group) => (
                        <div key={group.key}>
                            <div className="workbench-group">
                                <Icon icon={group.icon} className="size-3" />
                                {group.label}
                                <span className="workbench-item-meta ml-auto">{group.items.length}</span>
                            </div>
                            {group.items.length === 0 && (
                                <p className="px-2 pb-1 text-[10px] text-(--muted)">
                                    {q ? '无匹配' : '暂无条目'}
                                </p>
                            )}
                                {group.items.map((entity) => (
                                    <button
                                        key={entity.key}
                                        onClick={() => setSelectedKey(entity.key)}
                                        data-active={selectedKey === entity.key}
                                        className="workbench-item"
                                    >
                                        <EntityIcon
                                            url={iconFor(entity.group, entity.entityName, entityIcons)}
                                            fallback={group.icon}
                                        />
                                        <span className="min-w-0 flex-1 truncate">{entity.entityName}</span>
                                        {entity.pieces.length > 0 && (
                                            <span className="workbench-item-meta">{entity.pieces.join('/')}件</span>
                                        )}
                                        <span className="workbench-item-meta">{entity.buffs.length}</span>
                                    </button>
                                ))}
                        </div>
                    ))}
                    {q && grouped.every((g) => g.items.length === 0) && (
                        <p className="px-2 py-8 text-center text-xs text-(--muted)">没有匹配的实体</p>
                    )}
                </div>
            </aside>

            {/* ── 主内容区 ── */}
            <section className="workbench-main">
                {!selected ? (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-(--card-border) p-8 text-center">
                        <Icon icon="mdi:cursor-default-click-outline" className="size-9 text-(--muted)" />
                        <p className="text-sm text-(--muted)">从左侧选择一个实体，查看它的 Buff 明细</p>
                        <p className="text-xs text-(--muted)">
                            共 <span className="mg-num text-(--fg)">{entities.length}</span> 个实体 ·{' '}
                            <span className="mg-num text-(--fg)">{rows.length}</span> 条 Buff
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* 实体头 */}
                        <header className="mg-card p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <EntityIcon
                                    url={selectedIcon}
                                    fallback={selectedGroup?.icon ?? 'mdi:shape-outline'}
                                    className="size-11 border border-(--card-border)"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="mg-title truncate text-lg">{selected.entityName}</h2>
                                        <span className="rounded-sm bg-(--accent) px-1.5 py-0.5 text-[10px] text-(--accent-fg)">
                                            {selected.group === 'set'
                                                ? '套装'
                                                : BUFF_ENTITY_LABELS[selected.entityType]}
                                        </span>
                                        {selected.pieces.length > 0 && (
                                            <span className="rounded-sm border border-(--card-border) px-1.5 py-0.5 text-[10px] text-(--muted)">
                                                {selected.pieces.join(' / ')} 件
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--muted)">
                                        <span>
                                            <span className="mg-num text-(--fg)">{selected.buffs.length}</span> 条 Buff
                                        </span>
                                        <span>
                                            <span className="mg-num text-(--fg)">{zoneKinds}</span> 类乘区
                                        </span>
                                        {scopeCounts.map(([label, count]) => (
                                            <span key={label}>
                                                {label} <span className="mg-num text-(--fg)">{count}</span>
                                            </span>
                                        ))}
                                    </p>
                                </div>
                            </div>
                        </header>

                        {/* Buff 卡片 */}
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                            {selected.buffs.map((buff, index) => {
                                const piece = isSetType(buff.entity_type) ? Number(buff.entity_type[0]) : null
                                const conditionText = buff.condition ? describeCondition(buff.condition, slotNameFor(buff.entity_type)) : ''
                                return (
                                    <article
                                        key={`${buff.entity_type}/${buff.entity_name}/${buff.buff_name}/${index}`}
                                        className="mg-card p-3.5 transition-colors hover:border-(--accent)"
                                    >
                                        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                                            <h3 className="mg-title min-w-0 flex-1 truncate text-sm">
                                                {buff.buff_name}
                                            </h3>
                                            <span className="rounded-sm bg-(--accent) px-1.5 py-0.5 text-[10px] text-(--accent-fg)">
                                                {BUFF_SCOPE_LABELS[buff.scope] ?? buff.scope}
                                            </span>
                                            {piece && (
                                                <span className="rounded-sm border border-(--card-border) px-1.5 py-0.5 text-[10px] text-(--muted)">
                                                    {piece} 件
                                                </span>
                                            )}
                                            {conditionText && (
                                                <span
                                                    className="max-w-40 truncate rounded-sm border border-(--card-border) px-1.5 py-0.5 text-[10px] text-(--accent-text)"
                                                    title={`链/阶门槛：${conditionText}`}
                                                >
                                                    {conditionText}
                                                </span>
                                            )}
                                        </div>

                                        <ul className="space-y-1">
                                            {buff.buff_set.map((zone, i) => {
                                                const badge = describeZoneConditionBadge(zone.condition)
                                                return (
                                                    <li
                                                        key={`${zone.zoneId}-${i}`}
                                                        className="flex items-center gap-2 rounded-sm bg-(--card-hover) px-2 py-1 text-xs"
                                                    >
                                                        <span className="min-w-0 flex-1 truncate text-(--muted)">
                                                            {zoneLabel(zone.zoneId)}
                                                        </span>
                                                        {badge && (
                                                            <span
                                                                className="shrink-0 rounded-sm px-1 py-0.5 text-[10px] text-(--accent-text)"
                                                                style={{
                                                                    background:
                                                                        'color-mix(in srgb, var(--accent) 16%, transparent)'
                                                                }}
                                                                title={`该乘区条件：${describeCondition(zone.condition)}`}
                                                            >
                                                                {badge}
                                                            </span>
                                                        )}
                                                        {zone.ref && (
                                                            <span
                                                                className="min-w-0 shrink truncate text-[10px] text-(--info)"
                                                                title={`引用 / 转模：${describeZoneRef(zone.ref)}`}
                                                            >
                                                                {describeZoneRef(zone.ref)}
                                                            </span>
                                                        )}
                                                        <span className="mg-num shrink-0 text-(--fg)">
                                                            {zone.ref
                                                                ? '—'
                                                                : `${zone.override ? '覆盖+' : '+'}${zone.value}`}
                                                        </span>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    </article>
                                )
                            })}
                        </div>
                    </div>
                )}
            </section>
        </div>
    )
}
