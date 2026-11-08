'use client'

// Buff 集浏览（新系统）
// 去掉「左侧实体栏 + 右侧明细」的工作台：实体用可展开条目（原生 <details>），
// 顶部只留搜索 + 类型筛选。每个 Buff 显示短名、覆盖对象、条件与影响的乘区标签。
import { useMemo, useState } from 'react'
import { WkBadge, WkInput, WkSegmented, WkToolbar } from '@/design'
import { BUFF_ENTITY_LABELS, BUFF_SCOPE_LABELS, BUFF_ZONE_MAP, describeZoneConditionBadge } from '@/lib/consts/buff-zones'
import { buffFolderName, buffLeafName } from '@/lib/buff-names'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'
import type { EntityIconMaps } from '@/lib/data/avatar-icons'

// 类型筛选：不再给「全部」——列表默认就是角色，其余类型一次点击切换。
// 「全部」既浪费一格宽度，又让计数行和列表对不上（全部=259 个实体，段落里却只显示一部分）。
const TYPE_FILTERS = [
    { value: 'character', label: '角色' },
    { value: 'weapon', label: '武器' },
    { value: 'echo', label: '声骸' },
    { value: 'set', label: '套装' }
]

function isSetType(type: BuffEntityType): boolean {
    return /^[1-5]set$/.test(type)
}

function typeGroup(type: BuffEntityType): string {
    return isSetType(type) ? 'set' : type
}

function iconFor(type: BuffEntityType, name: string, icons?: EntityIconMaps): string | undefined {
    if (!icons) return undefined
    if (isSetType(type)) return icons.set?.[name]
    if (type === 'character') return icons.character?.[name]
    if (type === 'weapon') return icons.weapon?.[name]
    if (type === 'echo') return icons.echo?.[name]
    return undefined
}

interface EntityGroup {
    key: string
    type: BuffEntityType
    name: string
    buffs: BuffSetRow[]
}

export default function BuffSetsBrowser({
    rows,
    entityIcons
}: {
    rows: BuffSetRow[]
    entityIcons?: EntityIconMaps
}) {
    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState('character')

    const entities = useMemo<EntityGroup[]>(() => {
        const map = new Map<string, EntityGroup>()
        for (const row of rows) {
            const key = isSetType(row.entity_type) ? `set:${row.entity_name}` : `${row.entity_type}:${row.entity_name}`
            let entity = map.get(key)
            if (!entity) {
                entity = { key, type: row.entity_type, name: row.entity_name, buffs: [] }
                map.set(key, entity)
            }
            entity.buffs.push(row)
        }
        return [...map.values()].sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type)
            return a.name.localeCompare(b.name, 'zh-Hans-CN')
        })
    }, [rows])

    const visible = useMemo(() => {
        const key = search.trim().toLowerCase()
        return entities.filter((entity) => {
            if (typeGroup(entity.type) !== typeFilter) return false
            if (!key) return true
            return (
                entity.name.toLowerCase().includes(key) ||
                entity.buffs.some((buff) => buff.buff_name.toLowerCase().includes(key))
            )
        })
    }, [entities, search, typeFilter])

    const visibleBuffs = visible.reduce((sum, entity) => sum + entity.buffs.length, 0)

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
            <WkToolbar>
                <WkInput
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索实体或 Buff 名称"
                    aria-label="搜索 Buff"
                    style={{ flex: 1, minWidth: 180, maxWidth: 280 }}
                />
                <WkSegmented value={typeFilter} onChange={setTypeFilter} ariaLabel="实体类型" options={TYPE_FILTERS} />
                <span className="wk-meta">
                    {visible.length} 个实体 · {visibleBuffs} 条 Buff
                    {search.trim() ? ` · 关键词「${search.trim()}」` : ''}
                </span>
            </WkToolbar>

            {visible.length === 0 ? (
                <p className="wk-meta" style={{ padding: '24px 0' }}>
                    {search.trim() ? `没有匹配「${search.trim()}」的实体或 Buff` : '这个类型下还没有收录任何 Buff'}
                </p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }}>
                    {visible.map((entity) => {
                        const icon = iconFor(entity.type, entity.name, entityIcons)
                        return (
                            // 进页面时全部收起：默认展开第一条会让列表看起来"只有一个实体"，
                            // 而且用户一进来其实是在找实体，先给全貌再按需展开
                            <details key={entity.key} className="wk-acc">
                                <summary>
                                    <span className="wk-pcard-avatar" style={{ width: 28, height: 28 }}>
                                        {icon ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={icon} alt="" loading="lazy" />
                                        ) : null}
                                    </span>
                                    <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {entity.name}
                                    </span>
                                    <WkBadge>{BUFF_ENTITY_LABELS[entity.type]}</WkBadge>
                                    <WkBadge>{entity.buffs.length} 条</WkBadge>
                                    {/* 这里不再渲染分组名：它是「游戏原文案」级别的一长串，
                                        放进摘要会把 69 个字符塞到「展开」前面，信息密度全被它吃掉 */}
                                </summary>

                                <div className="wk-acc-body">
                                    <div className="wk-rows">
                                        {entity.buffs.map((buff) => {
                                            const condition = describeZoneConditionBadge(buff.condition ?? null)
                                            const folder = buffFolderName(buff.buff_name)
                                            // 乘区条目：数值带单位（引用型没有绝对值，显示「引用」）
                                            const zones = (buff.buff_set ?? []).map((zone) => {
                                                const def = BUFF_ZONE_MAP.get(zone.zoneId)
                                                return {
                                                    label: def?.label ?? zone.zoneId,
                                                    value: zone.ref ? '引用' : `${zone.value}${def?.unit === '%' ? '%' : ''}`
                                                }
                                            })
                                            return (
                                                <div className="wk-tr wk-tr--two" key={buff.id}>
                                                    <div className="wk-line" data-has-folder={folder ? 'true' : undefined}>
                                                        <span className="wk-line-name" title={buff.buff_name}>
                                                            {buffLeafName(buff.buff_name)}
                                                        </span>
                                                        {folder && (
                                                            <span className="wk-line-folder" title={folder}>
                                                                {folder}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="wk-facts">
                                                        <WkBadge>{BUFF_SCOPE_LABELS[buff.scope] ?? buff.scope}</WkBadge>
                                                        {buff.exclusive && <WkBadge tone="accent">独占</WkBadge>}
                                                        {zones.length > 0 && (
                                                            <span className="wk-fact-value">
                                                                {zones.map((zone) => zone.value).join(' / ')}
                                                            </span>
                                                        )}
                                                        {condition && <WkBadge tone="warn">{condition}</WkBadge>}
                                                        {zones.map((zone, zoneIdx) => (
                                                            <WkBadge key={`${zone.label}-${zoneIdx}`}>{zone.label}</WkBadge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
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
