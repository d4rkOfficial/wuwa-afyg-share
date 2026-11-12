'use client'

// Buff 集浏览（新系统）
// 结构：左侧实体栏（类型分页 + 搜索 + 实体列表），右侧一片「凹槽」——
// 凹槽里按文件夹铺卡片，每张文件夹卡片里再放该文件夹下的 Buff 小卡。
//
// 小卡的阅读顺序固定：门槛徽标（≥6链 / ≥5阶）→ 适用范围（全队 / 队友 / 自己 / 效应）
// → Buff 名 → 换行后的「数值 / 转模 / 类型 / 属性」四行细节。
import { useMemo, useState } from 'react'
import { WkBadge, WkInput, WkSegmented } from '@/design'
import {
    BUFF_DAMAGE_TYPE_SHORT,
    BUFF_ENTITY_LABELS,
    BUFF_SCOPE_LABELS,
    BUFF_ZONE_MAP,
    describeZoneRef
} from '@/lib/consts/buff-zones'
import { buffFolderName, buffLeafName } from '@/lib/buff-names'
import type { BuffCondition, BuffEntityType, BuffScope, BuffSetRow } from '@/lib/types/db'
import type { EntityIconMaps } from '@/lib/data/avatar-icons'

const TYPE_FILTERS = [
    { value: 'character', label: '角色' },
    { value: 'weapon', label: '武器' },
    { value: 'echo', label: '声骸' },
    { value: 'set', label: '套装' }
]

/** @desc 适用范围：武器 / 首位声骸 / 套装没有「自己」，说「装备者」 */
function scopeLabel(scope: BuffScope, isCharacter: boolean): string {
    if (scope === 'self') return isCharacter ? '自己' : '装备者'
    if (scope === 'team') return '全队'
    if (scope === 'self_except') return '队友'
    if (scope === 'effect_only') return '效应'
    return BUFF_SCOPE_LABELS[scope] ?? scope
}

/**
 * @desc 门槛徽标：链条件取最大 min → 「≥6链」；阶条件 → 「≥5阶」。
 * 0 链（角色本体）不算门槛，返回 null。
 */
function gateLabel(condition: BuffCondition | null | undefined): string | null {
    if (!condition) return null
    const chainMin = Math.max(
        ...(condition.chains ?? []).map((clause) => clause.min),
        typeof condition.chain === 'number' ? condition.chain : 0
    )
    const refineMin = Math.max(
        ...(condition.refinements ?? []).map((clause) => clause.min),
        typeof condition.refinement === 'number' ? condition.refinement : 0
    )
    if (chainMin > 0) return `≥${chainMin}链`
    if (refineMin > 0) return `≥${refineMin}阶`
    return null
}

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

interface FolderGroup {
    /** @desc 文件夹名；根 Buff 为空串，展示为「未分组」 */
    name: string
    buffs: BuffSetRow[]
}

/** @desc 按文件夹分组：沿用查询顺序（sort_order 已把文件夹排在前） */
function groupByFolder(buffs: BuffSetRow[]): FolderGroup[] {
    const map = new Map<string, FolderGroup>()
    for (const buff of buffs) {
        const name = buffFolderName(buff.buff_name)
        const group = map.get(name)
        if (group) group.buffs.push(buff)
        else map.set(name, { name, buffs: [buff] })
    }
    return [...map.values()]
}

/** @desc 右侧的一段：普通实体一段；套装按件数各成一段（各自一个标题栏 + 各自的文件夹） */
interface BuffSection {
    type: BuffEntityType
    label: string
    buffs: BuffSetRow[]
    folders: FolderGroup[]
    /** @desc 这套「自己的」文件夹名（套装名 + N件）。同名时不再重复画文件夹标题卡 */
    bareName: string | null
}

function pieceCount(type: BuffEntityType): number {
    return isSetType(type) ? Number(type[0]) : 0
}

function sectionsFor(entity: EntityGroup, buffs: BuffSetRow[]): BuffSection[] {
    if (!isSetType(entity.type)) {
        return [
            {
                type: entity.type,
                label: BUFF_ENTITY_LABELS[entity.type],
                buffs,
                folders: groupByFolder(buffs),
                bareName: null
            }
        ]
    }

    // 套装：2 件套 / 5 件套… 各管各的，不混在一个标题栏下
    const byPiece = new Map<BuffEntityType, BuffSetRow[]>()
    for (const buff of buffs) {
        const list = byPiece.get(buff.entity_type) ?? []
        list.push(buff)
        byPiece.set(buff.entity_type, list)
    }
    return [...byPiece.entries()]
        .sort((a, b) => pieceCount(a[0]) - pieceCount(b[0]))
        .map(([type, list]) => ({
            type,
            label: BUFF_ENTITY_LABELS[type],
            buffs: list,
            folders: groupByFolder(list),
            bareName: `${entity.name}${pieceCount(type)}件`
        }))
}

/** @desc 一个 Buff 小卡的全部展示事实 */
function buffFacts(buff: BuffSetRow) {
    const zones = buff.buff_set ?? []
    const values = zones.map((zone) => {
        const def = BUFF_ZONE_MAP.get(zone.zoneId)
        const unit = def?.unit === '%' ? '%' : ''
        const plain = `${zone.value}${unit}`
        return {
            label: def?.label ?? zone.zoneId,
            // 引用型乘区常把绝对值写 0（换算在工具箱里做）：别显示假的 0%，直接写「转模」
            value: zone.ref ? (zone.value !== 0 ? plain : '转模') : plain,
            ref: zone.ref ? describeZoneRef(zone.ref) : ''
        }
    })
    const refs = [...new Set(values.map((item) => item.ref).filter(Boolean))]
    const types = [
        ...new Set(
            zones
                .flatMap((zone) => zone.condition?.damageTypes ?? [])
                .map((type) => BUFF_DAMAGE_TYPE_SHORT[type] ?? type)
        )
    ]
    const elements = [...new Set(zones.flatMap((zone) => zone.condition?.elements ?? []))]
    return { values, refs, types, elements }
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
    const [activeKey, setActiveKey] = useState<string | null>(null)

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
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    }, [rows])

    const keyword = search.trim().toLowerCase()

    /** 左栏列表：类型过滤 + 关键词（命中实体名或它下面任一 Buff） */
    const pool = useMemo(
        () =>
            entities.filter((entity) => {
                if (typeGroup(entity.type) !== typeFilter) return false
                if (!keyword) return true
                return (
                    entity.name.toLowerCase().includes(keyword) ||
                    entity.buffs.some((buff) => buff.buff_name.toLowerCase().includes(keyword))
                )
            }),
        [entities, typeFilter, keyword]
    )

    const active = pool.find((entity) => entity.key === activeKey) ?? pool[0] ?? null

    /** 右栏：命中实体名时给全部 Buff；只命中 Buff 名时只留命中的那几条 */
    const activeBuffs = useMemo(() => {
        if (!active) return []
        if (!keyword || active.name.toLowerCase().includes(keyword)) return active.buffs
        return active.buffs.filter((buff) => buff.buff_name.toLowerCase().includes(keyword))
    }, [active, keyword])

    const sections = useMemo<BuffSection[]>(() => (active ? sectionsFor(active, activeBuffs) : []), [active, activeBuffs])
    const activeIsCharacter = active ? active.type === 'character' : true

    return (
        <div className="wk-buffs">
            <aside className="wk-buffs-side" aria-label="实体">
                <div className="wk-buffs-side-controls">
                    <WkSegmented
                        value={typeFilter}
                        onChange={(next) => {
                            setTypeFilter(next)
                            setActiveKey(null)
                        }}
                        ariaLabel="实体类型"
                        options={TYPE_FILTERS}
                    />
                    <WkInput
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="搜索实体或 Buff"
                        aria-label="搜索实体或 Buff"
                    />
                </div>

                <div className="wk-buffs-entities">
                    {pool.length === 0 ? (
                        <p className="wk-meta" style={{ padding: '8px 6px' }}>
                            没有匹配的实体
                        </p>
                    ) : (
                        pool.map((entity) => {
                            const icon = iconFor(entity.type, entity.name, entityIcons)
                            const selected = active?.key === entity.key
                            return (
                                <button
                                    key={entity.key}
                                    type="button"
                                    className="wk-buffs-entity"
                                    data-active={selected}
                                    aria-current={selected ? 'true' : undefined}
                                    onClick={() => setActiveKey(entity.key)}
                                >
                                    <span className="wk-pcard-avatar" style={{ width: 26, height: 26, flexShrink: 0 }}>
                                        {icon ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={icon} alt="" loading="lazy" />
                                        ) : null}
                                    </span>
                                    <span className="wk-buffs-entity-name" title={entity.name}>
                                        {entity.name}
                                    </span>
                                    <span className="wk-buffs-entity-count">{entity.buffs.length}</span>
                                </button>
                            )
                        })
                    )}
                </div>
            </aside>

            <section className="wk-buffs-main">
                {sections.length === 0 ? (
                    <p className="wk-meta" style={{ padding: '24px 0' }}>
                        {keyword ? `没有匹配「${search.trim()}」的实体或 Buff` : '这个类型下还没有收录任何 Buff'}
                    </p>
                ) : (
                    sections.map((section) => (
                        <div className="wk-buffs-piece" key={section.type}>
                            <div className="wk-buffs-main-head">
                                <span className="wk-pcard-avatar" style={{ width: 36, height: 36, flexShrink: 0 }}>
                                    {iconFor(active?.type ?? section.type, active?.name ?? '', entityIcons) ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={iconFor(active?.type ?? section.type, active?.name ?? '', entityIcons)}
                                            alt=""
                                            loading="lazy"
                                        />
                                    ) : null}
                                </span>
                                <span className="wk-buffs-main-title">{active?.name}</span>
                                <WkBadge>{section.label}</WkBadge>
                                <span className="wk-meta">
                                    {section.buffs.length} 条 Buff · {section.folders.length} 个文件夹
                                </span>
                            </div>

                            <div className="wk-buffs-groove">
                                {section.folders.length === 0 ? (
                                    <p className="wk-meta">这个件套还没有收录 Buff</p>
                                ) : section.folders.length === 1 && section.folders[0].name === section.bareName ? (
                                    // 文件夹名就是「套装名 + N件」时不再重复画一张标题卡，直接把 Buff 铺在凹槽里
                                    <div className="wk-buff-grid">
                                        {section.folders[0].buffs.map((buff) => (
                                            <BuffCard
                                                key={buff.id ?? buff.buff_name}
                                                buff={buff}
                                                isCharacter={activeIsCharacter}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    section.folders.map((folder) => (
                                        <article key={folder.name || '__root'} className="wk-folder-card">
                                            <header className="wk-folder-head">
                                                <span className="wk-folder-name" title={folder.name || undefined}>
                                                    {folder.name || '未分组'}
                                                </span>
                                                <span className="wk-folder-count">{folder.buffs.length} 条</span>
                                            </header>
                                            <div className="wk-buff-grid">
                                                {folder.buffs.map((buff) => (
                                                    <BuffCard
                                                        key={buff.id ?? buff.buff_name}
                                                        buff={buff}
                                                        isCharacter={activeIsCharacter}
                                                    />
                                                ))}
                                            </div>
                                        </article>
                                    ))
                                )}
                            </div>
                        </div>
                    ))
                )}
            </section>
        </div>
    )
}

function BuffCard({ buff, isCharacter }: { buff: BuffSetRow; isCharacter: boolean }) {
    const gate = gateLabel(buff.condition)
    const facts = buffFacts(buff)

    return (
        <article className="wk-buff-card">
            <div className="wk-buff-head">
                {gate && <span className="wk-buff-gate">{gate}</span>}
                <WkBadge>{scopeLabel(buff.scope, isCharacter)}</WkBadge>
                {buff.exclusive && <WkBadge tone="warn">独占</WkBadge>}
                <span className="wk-buff-name" title={buffLeafName(buff.buff_name)}>
                    {buffLeafName(buff.buff_name)}
                </span>
            </div>

            <dl className="wk-buff-facts">
                <div className="wk-buff-fact">
                    <dt>数值</dt>
                    <dd>
                        {facts.values.length === 0 ? (
                            '—'
                        ) : (
                            <span className="wk-buff-values">
                                {facts.values.map((item, index) => (
                                    <span className="wk-buff-value-line" key={`${item.label}-${index}`}>
                                        <span className="wk-buff-zone">{item.label}</span>
                                        <span className="wk-buff-num">{item.value}</span>
                                    </span>
                                ))}
                            </span>
                        )}
                    </dd>
                </div>

                {facts.refs.length > 0 && (
                    <div className="wk-buff-fact">
                        <dt>转模</dt>
                        <dd>{facts.refs.join('；')}</dd>
                    </div>
                )}

                {facts.types.length > 0 && (
                    <div className="wk-buff-fact">
                        <dt>类型</dt>
                        <dd className="wk-buff-chip-row">
                            {facts.types.map((type) => (
                                <span className="wk-buff-chip" key={type}>
                                    {type}
                                </span>
                            ))}
                        </dd>
                    </div>
                )}

                {facts.elements.length > 0 && (
                    <div className="wk-buff-fact">
                        <dt>属性</dt>
                        <dd className="wk-buff-chip-row">
                            {facts.elements.map((element) => (
                                <span
                                    className="wk-buff-chip"
                                    key={element}
                                    style={{
                                        color: `var(--element-${element})`,
                                        borderColor: `color-mix(in srgb, var(--element-${element}) 55%, transparent)`
                                    }}
                                >
                                    {element}
                                </span>
                            ))}
                        </dd>
                    </div>
                )}
            </dl>
        </article>
    )
}
