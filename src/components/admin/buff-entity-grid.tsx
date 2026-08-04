'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { BUFF_ENTITY_LABELS } from '@/lib/consts/buff-zones'
import type { ToolListEntry } from '@/lib/ai/info'
import type { BuffEntityType } from '@/lib/types/db'

interface Props {
    toolBase: string
    existingCountMap: Record<string, number>
    onSelect: (entity: { entityType: BuffEntityType; entityName: string }) => void
}

interface StreamEvent {
    type: 'log' | 'result' | 'error'
    data?: unknown
    message?: string
}

// 服务端代理（/api/admin/buff-sets/list）返回 NDJSON 流：{type:'result',data:ToolListEntry[]}
async function readNdjsonStream(res: Response, onEvent: (evt: StreamEvent) => void): Promise<void> {
    if (!res.body) {
        onEvent({ type: 'error', message: '响应无 body' })
        return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
            if (!line.trim()) continue
            try {
                onEvent(JSON.parse(line) as StreamEvent)
            } catch {
                /* 忽略坏行 */
            }
        }
    }
}

function entityKey(entityType: BuffEntityType, entityName: string) {
    return `${entityType}/${entityName}`
}

// 主类型 tab（套装合并为一项，内部再选件数）
const MAIN_TABS: Array<{ type: BuffEntityType; label: string }> = [
    { type: 'character', label: '角色' },
    { type: 'weapon', label: '武器' },
    { type: 'echo', label: '首位声骸' },
    { type: '1set', label: '套装' }
]

const SET_PIECES: BuffEntityType[] = ['1set', '2set', '3set', '4set', '5set']

const FILTERS: Array<{ key: 'with' | 'without'; label: string }> = [
    { key: 'with', label: '有条目' },
    { key: 'without', label: '无条目' }
]

const SKELETON_COUNT = 12

export default function BuffEntityGrid({ toolBase, existingCountMap, onSelect }: Props) {
    const [mainTab, setMainTab] = useState<BuffEntityType>('character')
    const [setPiece, setSetPiece] = useState<BuffEntityType>('1set')
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<'with' | 'without'>('with')
    const [catalog, setCatalog] = useState<ToolListEntry[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loadedFor, setLoadedFor] = useState<BuffEntityType | null>(null)
    const [starFilter, setStarFilter] = useState<number | null>(null)
    const [costFilter, setCostFilter] = useState<number | null>(null)

    // 当前实际生效的实体类型
    const activeType: BuffEntityType = mainTab === '1set' ? setPiece : mainTab

    async function load(type: BuffEntityType) {
        setError(null)
        try {
            const res = await fetch('/api/admin/buff-sets/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toolBase, entityType: type })
            })
            let list: ToolListEntry[] = []
            let failMsg: string | null = null
            await readNdjsonStream(res, (evt) => {
                if (evt.type === 'result' && Array.isArray(evt.data)) {
                    list = evt.data as ToolListEntry[]
                } else if (evt.type === 'error') {
                    failMsg = evt.message ?? '拉取实体目录失败'
                }
            })
            if (failMsg) {
                setError(failMsg)
                setCatalog(null)
            } else {
                const seen = new Set<string>()
                setCatalog(list.filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true))))
            }
        } catch {
            setError('拉取实体目录失败')
            setCatalog(null)
        } finally {
            setLoadedFor(type)
        }
    }

    function switchMainTab(type: BuffEntityType) {
        setMainTab(type)
        setSearch('')
        setStarFilter(null)
        setCostFilter(null)
        const target = type === '1set' ? setPiece : type
        if (loadedFor !== target) {
            setCatalog(null)
            load(target)
        }
    }

    function switchSetPiece(piece: BuffEntityType) {
        setSetPiece(piece)
        setSearch('')
        setStarFilter(null)
        setCostFilter(null)
        if (loadedFor !== piece) {
            setCatalog(null)
            load(piece)
        }
    }

    const starOptions = [...new Set((catalog ?? []).map((e) => e.star).filter((s): s is number => typeof s === 'number'))].sort(
        (a, b) => a - b
    )
    const costOptions = [...new Set((catalog ?? []).map((e) => e.cost).filter((c): c is number => typeof c === 'number'))].sort(
        (a, b) => a - b
    )

    const list = (catalog ?? [])
        .filter((e) => {
            // 武器筛除投影
            if (activeType === 'weapon' && e.name.startsWith('投影·')) return false
            // 套装：仅保留确有该件套效果的套装
            if (mainTab === '1set' && e.pieces && !e.pieces.includes(parseInt(setPiece, 10))) return false
            if (starFilter !== null && e.star !== starFilter) return false
            if (costFilter !== null && e.cost !== costFilter) return false
            return true
        })
        .map((e) => {
            const key = entityKey(activeType, e.name)
            return { name: e.name, count: existingCountMap[key] ?? 0 }
        })
    const q = search.trim()
    const filtered = list
        .filter((e) => (q ? e.name.includes(q) : true))
        .filter((e) => (filter === 'with' ? e.count > 0 : e.count === 0))

    return (
        <div className="flex h-full flex-col rounded-xl border border-(--card-border) bg-(--card) p-4">
            {/* 顶部：主类型 tab + 过滤 */}
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div className="flex rounded-lg border border-(--card-border) bg-(--card-hover) p-0.5">
                    {MAIN_TABS.map((t) => (
                        <button
                            key={t.type}
                            onClick={() => switchMainTab(t.type)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                mainTab === t.type ? 'bg-(--accent)/15 text-(--accent-text)' : 'text-(--muted) hover:text-(--fg)'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--card-hover) p-0.5">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                filter === f.key ? 'bg-(--accent)/15 text-(--accent-text)' : 'text-(--muted) hover:text-(--fg)'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 套装件数二级 */}
            {mainTab === '1set' && (
                <div className="mb-2 flex shrink-0 flex-wrap gap-1">
                    {SET_PIECES.map((p) => (
                        <button
                            key={p}
                            onClick={() => switchSetPiece(p)}
                            className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                                setPiece === p ? 'bg-(--accent)/15 text-(--accent-text)' : 'text-(--muted) hover:bg-(--card-hover)'
                            }`}
                        >
                            {BUFF_ENTITY_LABELS[p]}
                        </button>
                    ))}
                </div>
            )}

            {/* 星级 / cost 筛选（仅角色/武器/声骸） */}
            {(mainTab === 'character' || mainTab === 'weapon' || mainTab === 'echo') && (
                <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-(--muted)">
                        {mainTab === 'echo' ? 'Cost' : '星级'}
                    </span>
                    <div className="flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--card-hover) p-0.5">
                        <button
                            onClick={() => (mainTab === 'echo' ? setCostFilter(null) : setStarFilter(null))}
                            className={`rounded px-2 py-1 text-[11px] transition-colors ${
                                (mainTab === 'echo' ? costFilter === null : starFilter === null)
                                    ? 'bg-(--accent)/15 text-(--accent-text)'
                                    : 'text-(--muted) hover:text-(--fg)'
                            }`}
                        >
                            全部
                        </button>
                        {(mainTab === 'echo' ? costOptions : starOptions).map((v) => (
                            <button
                                key={v}
                                onClick={() => (mainTab === 'echo' ? setCostFilter(v) : setStarFilter(v))}
                                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                                    (mainTab === 'echo' ? costFilter === v : starFilter === v)
                                        ? 'bg-(--accent)/15 text-(--accent-text)'
                                        : 'text-(--muted) hover:text-(--fg)'
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 搜索 */}
            <div className="mb-3 flex shrink-0 items-center gap-2 rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-1.5">
                <Icon icon="mdi:magnify" className="size-4 shrink-0 text-(--muted)" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`搜索${mainTab === '1set' ? '套装' : BUFF_ENTITY_LABELS[activeType]}…`}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--muted)/60"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="rounded p-0.5 text-(--muted) hover:text-(--fg)">
                        <Icon icon="mdi:close" className="size-4" />
                    </button>
                )}
            </div>

            {/* 网格列表 / 骨架屏 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {error && <div className="rounded-lg bg-(--danger)/15 px-3 py-2 text-xs text-(--danger)">{error}</div>}
                {!error && catalog === null && (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                            <div key={i} className="h-16 animate-pulse rounded-lg bg-(--card-hover)" />
                        ))}
                    </div>
                )}
                {!error && catalog !== null && filtered.length === 0 && (
                    <div className="py-10 text-center text-sm text-(--muted)">
                        {filter === 'with' ? '暂无已收录条目，切换「无条目」查看全部实体' : '无匹配实体'}
                    </div>
                )}
                {!error && filtered.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                        {filtered.map((e) => (
                            <button
                                key={e.name}
                                onClick={() => onSelect({ entityType: activeType, entityName: e.name })}
                                className="group flex flex-col gap-1 rounded-lg border border-(--card-border) bg-(--card-hover) px-3 py-2.5 text-left transition-colors hover:border-(--accent)/50"
                            >
                                <span className="truncate text-sm font-medium text-(--fg) group-hover:text-(--accent-text)">
                                    {e.name}
                                </span>
                                <span
                                    className={`w-fit rounded-full px-2 py-0.5 text-[10px] ${
                                        e.count > 0
                                            ? 'bg-(--accent)/15 text-(--accent-text)'
                                            : 'bg-(--card-bg) text-(--muted)'
                                    }`}
                                >
                                    {e.count} 条
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
