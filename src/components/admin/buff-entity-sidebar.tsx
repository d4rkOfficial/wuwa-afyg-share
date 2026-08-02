'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { BUFF_ENTITY_TYPES, BUFF_ENTITY_LABELS } from '@/lib/consts/buff-zones'
import type { BuffEntityType } from '@/lib/types/db'

interface Props {
    toolBase: string
    existingCountMap: Record<string, number>
    selected: { entityType: BuffEntityType; entityName: string } | null
    onSelect: (entity: { entityType: BuffEntityType; entityName: string }) => void
    onNew: () => void
}

interface ToolEntry {
    name: string
}

interface StreamEvent {
    type: 'log' | 'result' | 'error'
    data?: unknown
    message?: string
}

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

export default function BuffEntitySidebar({
    toolBase,
    existingCountMap,
    selected,
    onSelect,
    onNew
}: Props) {
    const [loading, setLoading] = useState(false)
    const [tab, setTab] = useState<BuffEntityType>('character')
    const [search, setSearch] = useState('')
    const [catalog, setCatalog] = useState<string[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loadedFor, setLoadedFor] = useState<BuffEntityType | null>(null)

    async function load(type: BuffEntityType) {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/admin/buff-sets/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toolBase, entityType: type })
            })
            let list: ToolEntry[] = []
            let failMsg: string | null = null
            await readNdjsonStream(res, (evt) => {
                if (evt.type === 'result' && Array.isArray(evt.data)) {
                    list = evt.data as ToolEntry[]
                } else if (evt.type === 'error') {
                    failMsg = evt.message ?? '拉取实体目录失败'
                }
            })
            if (failMsg) {
                setError(failMsg)
                setCatalog(null)
            } else {
                const seen = new Set<string>()
                setCatalog(
                    list.filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true))).map((e) => e.name)
                )
            }
        } catch {
            setError('拉取实体目录失败')
        } finally {
            setLoading(false)
            setLoadedFor(type)
        }
    }

    function switchTab(type: BuffEntityType) {
        setTab(type)
        setSearch('')
        if (loadedFor !== type) load(type)
    }

    const filtered = (catalog ?? []).filter((name) => name.includes(search.trim()))

    return (
        <aside className="flex h-full max-h-[60vh] flex-col rounded-xl border border-(--card-border) bg-(--card) p-3 lg:max-h-none">
            {/* 新增按钮 */}
            <button
                onClick={onNew}
                className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-(--btn-text) transition-all hover:brightness-110"
                style={{ background: 'var(--btn-bg)' }}
            >
                <Icon icon="mdi:plus" className="size-3.5" />
                新增实体
            </button>

            {/* 搜索 */}
            <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索实体名"
                className="mb-2 w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
            />

            {/* 类型 tabs */}
            <div className="mb-2 flex flex-wrap gap-1">
                {BUFF_ENTITY_TYPES.map((t) => (
                    <button
                        key={t}
                        onClick={() => switchTab(t)}
                        className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                            tab === t ? 'bg-(--accent)/15 text-(--accent-text)' : 'text-(--muted) hover:bg-(--card-hover)'
                        }`}
                    >
                        {BUFF_ENTITY_LABELS[t]}
                    </button>
                ))}
            </div>

            {/* 列表 */}
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
                {error && <div className="rounded-lg bg-red-500/10 px-2 py-2 text-xs text-red-400">{error}</div>}
                {!error && catalog === null && loading && (
                    <div className="px-2 py-3 text-center text-xs text-(--muted)">加载中…</div>
                )}
                {!error && catalog !== null && filtered.length === 0 && (
                    <div className="px-2 py-3 text-center text-xs text-(--muted)">无匹配实体</div>
                )}
                {filtered.map((name) => {
                    const key = entityKey(tab, name)
                    const count = existingCountMap[key] ?? 0
                    const active = selected?.entityType === tab && selected.entityName === name
                    return (
                        <button
                            key={name}
                            onClick={() => onSelect({ entityType: tab, entityName: name })}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                                active ? 'bg-(--accent)/15 text-(--accent-text)' : 'text-(--fg) hover:bg-(--card-hover)'
                            }`}
                        >
                            <span className="min-w-0 flex-1 truncate">{name}</span>
                            {count > 0 ? (
                                <span className="shrink-0 rounded-full bg-(--accent)/15 px-2 py-0.5 text-[10px] text-(--accent-text)">
                                    {count}
                                </span>
                            ) : (
                                <span className="shrink-0 text-[10px] text-(--muted)">未建</span>
                            )}
                        </button>
                    )
                })}
            </div>
        </aside>
    )
}
