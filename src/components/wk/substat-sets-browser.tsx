'use client'

// 标准词条集浏览（新系统）
// 结构：搜索 + 一条凹槽（六个属性 tab）+ 该属性下的角色条目（原生 <details>）。
// 条目摘要直接铺五个部位的「cost + 主词条缩写」，展开后是每个部位的
// 主词条 / 副主词条 / 副词条（副词条用缩写，固定值带「生命 / 攻击 / 防御」字样）。
import { useMemo, useState } from 'react'
import { WkInput } from '@/design'
import { mainStatShort, substatShort } from '@/lib/consts/echo-stats'
import type { EchoStatValue, StandardSubstatSetRow } from '@/lib/types/db'

/** @desc 六个元素属性（游戏内没有「物理伤害加成」主词条，物伤角色 / 上游查不到的角色归到「未分类」） */
const ELEMENT_ORDER = ['冷凝', '热熔', '导电', '气动', '衍射', '湮灭'] as const
const OTHER = '未分类'

function statText(stat: EchoStatValue | null | undefined): string {
    if (!stat) return '—'
    return `${stat.type} ${stat.value}${stat.unit ?? ''}`
}

function substatText(stat: EchoStatValue): string {
    return `${substatShort(stat.type)} ${stat.value}${stat.unit ?? ''}`
}

export default function SubstatSetsBrowser({
    rows,
    icons = {},
    elements = {}
}: {
    rows: StandardSubstatSetRow[]
    icons?: Record<string, string>
    /** @desc 角色名 → 属性（服务端传入的静态表） */
    elements?: Record<string, string>
}) {
    const [search, setSearch] = useState('')
    const [picked, setPicked] = useState<string | null>(null)

    const keyword = search.trim()

    /** @desc 先按属性分组（顺序固定为六元素，其它排最后），再按角色名排序 */
    const groups = useMemo(() => {
        const map = new Map<string, StandardSubstatSetRow[]>()
        for (const row of rows) {
            const element = elements[row.character_name]
            const key = element && (ELEMENT_ORDER as readonly string[]).includes(element) ? element : OTHER
            const list = map.get(key) ?? []
            list.push(row)
            map.set(key, list)
        }
        for (const list of map.values()) list.sort((a, b) => a.character_name.localeCompare(b.character_name, 'zh'))
        return map
    }, [rows, elements])

    const tabs = useMemo(() => [...ELEMENT_ORDER, OTHER].filter((element) => groups.has(element)), [groups])

    /** 默认选中第一个有角色的属性；搜索后当前属性空了也回退到第一个有结果的属性 */
    const activeTab = picked && groups.has(picked) ? picked : (tabs[0] ?? OTHER)

    const visible = useMemo(() => {
        const list = groups.get(activeTab) ?? []
        return keyword ? list.filter((row) => row.character_name.includes(keyword)) : list
    }, [groups, activeTab, keyword])

    /** @desc 搜索命中在别的属性下时，给一条可点的提示 */
    const matchesElsewhere = useMemo(() => {
        if (!keyword) return []
        return tabs
            .filter((element) => element !== activeTab)
            .map((element) => ({
                element,
                count: (groups.get(element) ?? []).filter((row) => row.character_name.includes(keyword)).length
            }))
            .filter((item) => item.count > 0)
    }, [keyword, tabs, groups, activeTab])

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div className="wk-toolbar">
                <WkInput
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="搜索角色名"
                    aria-label="搜索角色"
                    style={{ flex: 1, minWidth: 180 }}
                />
                {search && (
                    <button type="button" className="wk-clear" onClick={() => setSearch('')}>
                        清空
                    </button>
                )}
            </div>

            <div className="wk-stat-groove">
                <div className="wk-stat-tabs" role="tablist" aria-label="属性">
                    {[...ELEMENT_ORDER, OTHER].map((element) => {
                        const list = groups.get(element) ?? []
                        const empty = list.length === 0
                        return (
                            <button
                                key={element}
                                type="button"
                                role="tab"
                                aria-selected={element === activeTab}
                                disabled={empty}
                                className="wk-stat-tab"
                                data-active={element === activeTab}
                                onClick={() => setPicked(element)}
                            >
                                {element}
                                {!empty && <span className="wk-stat-tab-count">{list.length}</span>}
                            </button>
                        )
                    })}
                </div>
            </div>

            {visible.length === 0 ? (
                <p className="wk-meta" style={{ padding: '16px 0' }}>
                    {keyword
                        ? `「${activeTab}」下没有匹配「${keyword}」的角色`
                        : `「${activeTab}」下还没有收录角色`}
                    {matchesElsewhere.length > 0 && (
                        <>
                            ，另有：
                            {matchesElsewhere.map((item) => (
                                <button
                                    key={item.element}
                                    type="button"
                                    className="wk-stat-tab"
                                    style={{ minWidth: 0, height: 24, padding: '0 8px', marginLeft: 6 }}
                                    onClick={() => setPicked(item.element)}
                                >
                                    {item.element} {item.count}
                                </button>
                            ))}
                        </>
                    )}
                </p>
            ) : (
                <div>
                    {visible.map((row) => (
                        <details key={row.id} className="wk-acc">
                            <summary>
                                <span className="wk-pcard-avatar" style={{ width: 28, height: 28 }}>
                                    {icons[row.character_name] ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={icons[row.character_name]} alt="" loading="lazy" />
                                    ) : null}
                                </span>
                                <span className="wk-stat-name">{row.character_name}</span>
                                <span className="wk-stat-mains">
                                    {row.plan.slots.map((slot, slotIndex) => (
                                        <span className="wk-stat-badge" data-cost={slot.cost} key={slotIndex}>
                                            <span className="wk-stat-badge-cost">{slot.cost}C</span>
                                            <span>{mainStatShort(slot.mainStat?.type) || '—'}</span>
                                        </span>
                                    ))}
                                </span>
                                {row.note && <span className="wk-meta wk-stat-note">{row.note}</span>}
                            </summary>

                            <div className="wk-acc-body">
                                <div className="wk-stat-slots">
                                    {row.plan.slots.map((slot, slotIndex) => (
                                        <div className="wk-stat-slot" key={slotIndex}>
                                            <div className="wk-stat-slot-head">
                                                <span className="wk-stat-cost" data-cost={slot.cost}>
                                                    {slot.cost}C
                                                </span>
                                                <span className="wk-stat-slot-main">{statText(slot.mainStat)}</span>
                                                {slot.secondMainStat && (
                                                    <span className="wk-stat-slot-second">
                                                        {statText(slot.secondMainStat)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="wk-stat-slot-subs">
                                                {(slot.substats ?? []).map((stat, statIndex) => (
                                                    <span
                                                        className="wk-stat-chip"
                                                        data-unit={stat.unit ?? ''}
                                                        key={`${stat.type}-${statIndex}`}
                                                    >
                                                        {substatText(stat)}
                                                    </span>
                                                ))}
                                                {(slot.substats?.length ?? 0) === 0 && (
                                                    <span className="wk-meta">无副词条</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </details>
                    ))}
                </div>
            )}
        </div>
    )
}
