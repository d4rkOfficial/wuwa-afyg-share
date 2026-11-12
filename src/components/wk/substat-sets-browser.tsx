'use client'

// 标准词条集浏览（新系统）
// 结构：搜索 + 一条凹槽（六个属性 tab）+ 该属性下的角色条目（原生 <details>）。
// 条目摘要直接铺五个部位的「cost + 主词条缩写」，展开后是每个部位的
// 主词条 / 副主词条 / 副词条（副词条用缩写，固定值带「生命 / 攻击 / 防御」字样）。
import { useMemo, useState } from 'react'
import { WkInput } from '@/design'
import { mainStatShort, substatShort } from '@/lib/consts/echo-stats'
import type { EchoStatValue, StandardSubstatSetRow } from '@/lib/types/db'

/** @desc 六个元素属性（游戏内没有「物理伤害加成」主词条；查不到属性的角色不进 tab，只在下方提示） */
const ELEMENT_ORDER = ['冷凝', '热熔', '导电', '气动', '衍射', '湮灭'] as const

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
    /** @desc 角色名 → 属性（服务端传入的实时表） */
    elements?: Record<string, string>
}) {
    const [search, setSearch] = useState('')
    const [picked, setPicked] = useState<string | null>(null)

    const keyword = search.trim()

    /** @desc 按六属性分组；属性查不到的角色单独收起来，只在底部提示，不占 tab */
    const { groups, unclassified } = useMemo(() => {
        const map = new Map<string, StandardSubstatSetRow[]>()
        const missing: StandardSubstatSetRow[] = []
        for (const row of rows) {
            const element = elements[row.character_name]
            if (!element || !(ELEMENT_ORDER as readonly string[]).includes(element)) {
                missing.push(row)
                continue
            }
            const list = map.get(element) ?? []
            list.push(row)
            map.set(element, list)
        }
        for (const list of map.values()) list.sort((a, b) => a.character_name.localeCompare(b.character_name, 'zh'))
        return { groups: map, unclassified: missing }
    }, [rows, elements])

    const tabs = useMemo(() => ELEMENT_ORDER.filter((element) => groups.has(element)), [groups])

    /** @desc 上游拿不到属性表时没有可分组的属性：退化成一份按角色名排的全部列表，不假装有分组 */
    const ungrouped = tabs.length === 0 && rows.length > 0

    /** 默认选中第一个有角色的属性；搜索后当前属性空了也回退到第一个有结果的属性 */
    const activeTab = picked && groups.has(picked) ? picked : (tabs[0] ?? '')

    const visible = useMemo(() => {
        if (ungrouped) {
            const list = [...rows].sort((a, b) => a.character_name.localeCompare(b.character_name, 'zh'))
            return keyword ? list.filter((row) => row.character_name.includes(keyword)) : list
        }
        const list = groups.get(activeTab) ?? []
        return keyword ? list.filter((row) => row.character_name.includes(keyword)) : list
    }, [ungrouped, rows, groups, activeTab, keyword])

    /** @desc 搜索命中在别的属性下时，给一条可点的提示 */
    const matchesElsewhere = useMemo(() => {
        if (!keyword || ungrouped) return []
        return tabs
            .filter((element) => element !== activeTab)
            .map((element) => ({
                element,
                count: (groups.get(element) ?? []).filter((row) => row.character_name.includes(keyword)).length
            }))
            .filter((item) => item.count > 0)
    }, [keyword, ungrouped, tabs, groups, activeTab])

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

            {ungrouped ? (
                <p className="wk-meta">属性数据暂不可用（上游未响应），下面按角色名列出全部方案。</p>
            ) : (
                <div className="wk-stat-groove">
                    <div className="wk-stat-tabs" role="tablist" aria-label="属性">
                        {ELEMENT_ORDER.map((element) => {
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
                                    data-element={element}
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
            )}

            {visible.length === 0 ? (
                <p className="wk-meta" style={{ padding: '16px 0' }}>
                    {ungrouped
                        ? keyword
                            ? `没有匹配「${keyword}」的角色`
                            : '还没有收录任何角色'
                        : keyword
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

            {!ungrouped && unclassified.length > 0 && (
                <p className="wk-meta">
                    有 {unclassified.length} 个角色查不到属性，暂不显示：
                    {unclassified.map((row) => row.character_name).join('、')}
                </p>
            )}
        </div>
    )
}
