'use client'

// 打开实体（弹窗版）
// 为什么不用下拉：实体有 259 个，下拉面板一屏看不了几行、也没法搜索；
// 这里改成弹窗：搜索框 + 类型筛选 + 按类型分组，滚动区独立，能一直开着不挡视线。
import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { WkDialog, WkInput } from '@/design'
import { entityIconFor, isSetEntityType } from '@/lib/data/entity-icons'
import type { EntityIconMaps } from '@/lib/data/avatar-icons'
import type { BuffEntityType } from '@/lib/types/db'

export interface PickableEntity {
    key: string
    entityType: BuffEntityType
    entityName: string
}

type GroupKey = 'character' | 'weapon' | 'echo' | 'set'

const GROUPS: Array<{ key: GroupKey; label: string }> = [
    { key: 'character', label: '角色' },
    { key: 'weapon', label: '武器' },
    { key: 'echo', label: '声骸' },
    { key: 'set', label: '套装' }
]

const groupOf = (type: BuffEntityType): GroupKey => (isSetEntityType(type) ? 'set' : (type as GroupKey))

export default function BuffEntityPicker({
    open,
    entities,
    counts,
    locks,
    icons,
    onPick,
    onClose
}: {
    open: boolean
    entities: PickableEntity[]
    counts: Record<string, number>
    locks: Record<string, boolean>
    /** 实体头像表（角色 / 武器 / 声骸 / 套装）；缺失时行首降级成通用图标 */
    icons?: EntityIconMaps
    onPick: (key: string) => void
    onClose: () => void
}) {
    const [query, setQuery] = useState('')
    // 打开时默认落在「角色」：日常 90% 是改角色 buff，先给最常用的那一类
    const [group, setGroup] = useState<GroupKey | null>('character')

    const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase()
        return entities.filter((entity) => {
            if (group && groupOf(entity.entityType) !== group) return false
            if (!keyword) return true
            return entity.entityName.toLowerCase().includes(keyword)
        })
    }, [entities, group, query])

    /**
     * @desc 分组标题：角色 / 武器 / 声骸各一节；**套装按件数再分一层**。
     * 同一个套装名在 1set…5set 里是几条互不相同的实体（<details> 里存的是不同件数的效果），
     * 混在一个「套装」小节里会看到一串同名条目，根本分不清该点哪条。
     */
    const sections = useMemo(() => {
        const out: Array<{ key: string; label: string; items: PickableEntity[] }> = []
        for (const entry of GROUPS) {
            const items = filtered.filter((entity) => groupOf(entity.entityType) === entry.key)
            if (items.length === 0) continue
            if (entry.key !== 'set') {
                out.push({ key: entry.key, label: entry.label, items })
                continue
            }
            for (let pieces = 1; pieces <= 5; pieces++) {
                const part = items.filter((entity) => String(entity.entityType) === `${pieces}set`)
                if (part.length > 0) out.push({ key: `set-${pieces}`, label: `${pieces} 件套`, items: part })
            }
        }
        return out
    }, [filtered])

    return (
        <WkDialog open={open} onClose={onClose} title="打开实体" width={720}>
            <div style={{ display: 'grid', gap: 10 }}>
                <WkInput
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索实体名称"
                    aria-label="搜索实体"
                    autoFocus
                />

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <div className="wk-seg" role="group" aria-label="实体类型">
                        {GROUPS.map((entry) => {
                            const count = entities.filter((entity) => groupOf(entity.entityType) === entry.key).length
                            const active = group === entry.key
                            return (
                                <button
                                    key={entry.key}
                                    type="button"
                                    className="wk-seg-item"
                                    data-active={active}
                                    aria-pressed={active}
                                    onClick={() => setGroup(active ? null : entry.key)}
                                    title={active ? '再点一次显示全部类型' : `只看${entry.label}`}
                                >
                                    {entry.label}
                                    <span className="wk-meta" style={{ marginLeft: 4 }}>
                                        {count}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    <span className="wk-meta">
                        {group ? `${GROUPS.find((entry) => entry.key === group)?.label} · ` : '全部 · '}
                        {filtered.length} 个实体
                    </span>
                </div>

                <div style={{ maxHeight: '52vh', overflowY: 'auto', display: 'grid', gap: 14 }}>
                    {sections.length === 0 ? (
                        <p className="wk-meta" style={{ padding: '24px 0' }}>
                            没有匹配「{query.trim()}」的实体
                        </p>
                    ) : (
                        sections.map((section) => (
                            <section key={section.key}>
                                <div className="wk-label">
                                    {section.label} · {section.items.length}
                                </div>
                                <div style={{ display: 'grid', gap: 2, marginTop: 6 }}>
                                    {section.items.map((entity) => {
                                        const icon = entityIconFor(entity.entityType, entity.entityName, icons)
                                        return (
                                        <button
                                            key={entity.key}
                                            type="button"
                                            className="wk-menu-item wk-entity-item"
                                            onClick={() => {
                                                onPick(entity.key)
                                                onClose()
                                            }}
                                            title={`${section.label} · ${entity.entityName}`}
                                        >
                                            <span className="wk-entity-icon" aria-hidden="true">
                                                {icon ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={icon} alt="" loading="lazy" />
                                                ) : (
                                                    <Icon icon="mdi:cube-outline" />
                                                )}
                                            </span>
                                            <span
                                                style={{
                                                    minWidth: 0,
                                                    flex: 1,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {entity.entityName}
                                            </span>
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    flexShrink: 0
                                                }}
                                            >
                                                {locks[entity.key] && (
                                                    <Icon
                                                        icon="mdi:lock-outline"
                                                        className="wk-nav-icon"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <span className="wk-meta">{counts[entity.key] ?? 0} 条</span>
                                            </span>
                                        </button>
                                        )
                                    })}
                                </div>
                            </section>
                        ))
                    )}
                </div>

                <p className="wk-meta">
                    带锁图标的实体只允许管理员编辑；已打开但未保存的改动，在切换实体后仍然保留。
                </p>
            </div>
        </WkDialog>
    )
}
