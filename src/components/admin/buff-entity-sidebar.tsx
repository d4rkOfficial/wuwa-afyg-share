'use client'

// Buff 集编辑器的左侧实体 sidebar：类型页签 + 搜索 + 条目锁开关 + 实体列表。
// 目录来自工具箱公开 API（浏览器直连，已开放 CORS），并叠加「已收录条目数」。
import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { BUFF_ENTITY_LABELS } from '@/lib/consts/buff-zones'
import { fetchToolList, type ToolListEntry } from '@/lib/ai/info'
import LoadingIndicator from '@/components/ui/loading-indicator'
import type { EntityIconMaps } from '@/lib/data/avatar-icons'
import type { BuffEntityType } from '@/lib/types/db'

interface Props {
    existingCountMap: Record<string, number>
    selectedKey: string | null
    onSelect: (entity: { entityType: BuffEntityType; entityName: string }) => void
    isAdmin: boolean
    locks: Record<string, boolean>
    lockPending: boolean
    onToggleLock: (entityType: BuffEntityType, entityName: string, locked: boolean) => void
    /** @desc 四类实体的图标表（角色 / 武器 / 首位声骸 / 套装都显示图标） */
    entityIcons?: EntityIconMaps
}

const MAIN_TABS: Array<{ type: BuffEntityType; label: string; group: keyof EntityIconMaps }> = [
    { type: 'character', label: '角色', group: 'character' },
    { type: 'weapon', label: '武器', group: 'weapon' },
    { type: 'echo', label: '首位声骸', group: 'echo' },
    { type: '1set', label: '套装', group: 'set' }
]

const SET_PIECES: BuffEntityType[] = ['1set', '2set', '3set', '4set', '5set']

export default function BuffEntitySidebar({
    existingCountMap,
    selectedKey,
    onSelect,
    isAdmin,
    locks,
    lockPending,
    onToggleLock,
    entityIcons
}: Props) {
    const [mainTab, setMainTab] = useState<BuffEntityType>('character')
    const [setPiece, setSetPiece] = useState<BuffEntityType>('1set')
    const [search, setSearch] = useState('')
    const [onlyExisting, setOnlyExisting] = useState(true)
    /**
     * @desc 目录按「已加载的类型」存：`type !== activeType` 就是加载中（不用在 effect 里
     *  setState 做重置，React 19 会把「effect 同步 setState」判定为级联渲染）。
     */
    const [catalogState, setCatalogState] = useState<{
        type: BuffEntityType | null
        list: ToolListEntry[]
        error: string | null
    }>({ type: null, list: [], error: null })

    const activeType: BuffEntityType = mainTab === '1set' ? setPiece : mainTab

    useEffect(() => {
        let alive = true
        fetchToolList(activeType)
            .then((list) => {
                if (!alive) return
                const seen = new Set<string>()
                setCatalogState({
                    type: activeType,
                    list: list.filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true))),
                    error: null
                })
            })
            .catch((e) => {
                if (!alive) return
                setCatalogState({
                    type: activeType,
                    list: [],
                    error: e instanceof Error ? e.message : '拉取实体目录失败'
                })
            })
        return () => {
            alive = false
        }
    }, [activeType])

    const activeGroup = (MAIN_TABS.find((tab) => tab.type === mainTab)?.group ?? 'character') as keyof EntityIconMaps
    const loading = catalogState.type !== activeType
    const catalog: ToolListEntry[] | null = loading ? null : catalogState.list
    const error = loading ? null : catalogState.error

    const q = search.trim()
    const rows = (catalog ?? [])
        .filter((e) => !(activeType === 'weapon' && e.name.startsWith('投影·')))
        .filter((e) => !(mainTab === '1set' && e.pieces && !e.pieces.includes(parseInt(setPiece, 10))))
        .map((e) => ({ name: e.name, count: existingCountMap[`${activeType}/${e.name}`] ?? 0 }))
        .filter((e) => (onlyExisting ? e.count > 0 : true))
        .filter((e) => (q ? e.name.includes(q) : true))

    return (
        <aside className="workbench-sidebar" aria-label="实体列表">
            {/* 类型页签 */}
            <div className="flex rounded-sm border border-(--card-border) bg-(--card-hover) p-0.5">
                {MAIN_TABS.map((tab) => (
                    <button
                        key={tab.type}
                        onClick={() => {
                            setMainTab(tab.type)
                            setSearch('')
                        }}
                        className={`flex-1 rounded-sm px-1.5 py-1 text-[11px] font-medium transition-colors ${
                            mainTab === tab.type
                                ? 'bg-(--accent) text-(--accent-fg)'
                                : 'text-(--muted) hover:text-(--fg)'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {mainTab === '1set' && (
                <div className="flex flex-wrap gap-1">
                    {SET_PIECES.map((piece) => (
                        <button
                            key={piece}
                            onClick={() => setSetPiece(piece)}
                            className={`rounded-sm px-1.5 py-0.5 text-[10px] transition-colors ${
                                setPiece === piece
                                    ? 'bg-(--accent) text-(--accent-fg)'
                                    : 'text-(--muted) hover:bg-(--card-hover)'
                            }`}
                        >
                            {BUFF_ENTITY_LABELS[piece]}
                        </button>
                    ))}
                </div>
            )}

            {/* 搜索 + 过滤 */}
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
                        className="shrink-0 text-(--muted) hover:text-(--fg)"
                        aria-label="清空搜索"
                    >
                        <Icon icon="mdi:close" className="size-3.5" />
                    </button>
                )}
            </div>

            <div className="flex items-center gap-1">
                {[
                    { value: true, label: '已有条目' },
                    { value: false, label: '全部实体' }
                ].map((opt) => (
                    <button
                        key={String(opt.value)}
                        onClick={() => setOnlyExisting(opt.value)}
                        className={`flex-1 rounded-sm px-2 py-1 text-[11px] transition-colors ${
                            onlyExisting === opt.value
                                ? 'bg-(--accent) text-(--accent-fg)'
                                : 'text-(--muted) hover:bg-(--card-hover)'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            <div className="workbench-list">
                {error && <p className="px-2 py-3 text-[11px] text-(--danger)">{error}</p>}
                {!error && catalog === null && <LoadingIndicator label="拉取目录…" className="py-8" size="size-6" />}
                {!error && catalog !== null && rows.length === 0 && (
                    <p className="px-2 py-8 text-center text-xs text-(--muted)">
                        {onlyExisting ? '这类实体还没有条目，切「全部实体」新建' : '无匹配实体'}
                    </p>
                )}
                {rows.map((e) => {
                    const key = `${activeType}/${e.name}`
                    const locked = !!locks[key]
                    return (
                        <div key={e.name} className="flex items-center gap-1 rounded-sm">
                            <button
                                onClick={() => onSelect({ entityType: activeType, entityName: e.name })}
                                className="workbench-item min-w-0 flex-1"
                                data-active={selectedKey === key}
                            >
                                <span className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-(--card-hover)">
                                    {entityIcons?.[activeGroup]?.[e.name] ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={entityIcons[activeGroup][e.name]}
                                            alt=""
                                            className="size-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <Icon icon="mdi:shape-outline" className="size-3.5 text-(--muted)" />
                                    )}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                                <span className="workbench-item-meta">{e.count}</span>
                                {locked && <Icon icon="mdi:lock" className="size-3 shrink-0 text-(--warning)" />}
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => onToggleLock(activeType, e.name, !locked)}
                                    disabled={lockPending}
                                    className={`shrink-0 rounded-sm p-1 transition-colors disabled:opacity-50 ${
                                        locked
                                            ? 'text-(--warning) hover:text-(--fg)'
                                            : 'text-(--muted) opacity-45 hover:opacity-100 hover:text-(--fg)'
                                    }`}
                                    title={locked ? '解锁：允许登录用户编辑' : '锁定：仅管理员可编辑'}
                                >
                                    <Icon
                                        icon={locked ? 'mdi:lock' : 'mdi:lock-open-variant'}
                                        className="size-3.5"
                                    />
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </aside>
    )
}
