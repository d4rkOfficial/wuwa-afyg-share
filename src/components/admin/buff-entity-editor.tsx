'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { upsertBuffEntity, deleteBuffEntity } from '@/lib/actions/buff-sets'
import {
    BUFF_ENTITY_TYPES,
    BUFF_ENTITY_LABELS,
    BUFF_ZONES,
    BUFF_ZONE_MAP,
    BUFF_REF_ZONES,
    BUFF_SCOPES,
    BUFF_SCOPE_LABELS
} from '@/lib/consts/buff-zones'
import type { BuffEntityType, BuffScope, BuffSetRow } from '@/lib/types/db'
import type { GeneratedBuff } from '@/lib/ai/types'

interface LogEntry {
    level: 'info' | 'success' | 'error' | 'debug'
    text: string
}

interface StreamEvent {
    type: 'log' | 'result' | 'error' | 'ai' | 'reasoning' | 'prompt'
    level?: 'info' | 'success' | 'error' | 'debug'
    text?: string
    data?: unknown
    message?: string
    debug?: string
    rawContent?: string
    parseError?: string | null
    kind?: 'system' | 'user' | 'history'
}

async function readNdjsonStream(
    res: Response,
    onEvent: (evt: StreamEvent) => void
): Promise<void> {
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

interface Props {
    initial: {
        entityType: BuffEntityType
        entityName: string
        buffs: BuffSetRow[]
    } | null
    toolBase: string
    apiKey: string
    systemPrompt: string
    userPromptTemplate: string
    slangDict: string
    onEntityDeleted?: () => void
}

interface ZoneRefRow {
    targetZoneId: string
    pct: string
    threshold?: string
}

interface ZoneRow {
    zoneId: string
    value: string
    override: boolean
    ref?: ZoneRefRow | null
}

interface BuffRow {
    buffName: string
    scope: BuffScope
    exclusive: boolean
    zones: ZoneRow[]
}

export default function BuffEntityEditor({
    initial,
    toolBase,
    apiKey,
    systemPrompt,
    userPromptTemplate,
    slangDict,
    onEntityDeleted
}: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [flash, setFlash] = useState<string | null>(null)
    const [confirmDeleteEntity, setConfirmDeleteEntity] = useState(false)

    const isEdit = initial !== null
    const [entityType, setEntityType] = useState<BuffEntityType>(initial?.entityType ?? 'character')
    const [entityName, setEntityName] = useState(initial?.entityName ?? '')
    const [buffs, setBuffs] = useState<BuffRow[]>(
        (initial?.buffs ?? []).map((r) => ({
            buffName: r.buff_name,
            scope: r.scope ?? 'team',
            exclusive: !!r.exclusive,
            zones: (r.buff_set ?? []).map((z) => ({
                zoneId: z.zoneId,
                value: String(z.value),
                override: !!z.override,
                ref: z.ref
                    ? {
                          targetZoneId: z.ref.targetZoneId,
                          pct: String(z.ref.pct),
                          ...(z.ref.threshold !== undefined ? { threshold: String(z.ref.threshold) } : {})
                      }
                    : null
            }))
        }))
    )

    // 实体名搜索下拉
    const [showNamePicker, setShowNamePicker] = useState(false)
    const [nameSearch, setNameSearch] = useState('')
    const [catalog, setCatalog] = useState<{ name: string }[] | null>(null)
    const [catalogError, setCatalogError] = useState<string | null>(null)
    const [catalogLoading, setCatalogLoading] = useState(false)

    // AI 辅助（迷你对话）
    const [aiBusy, setAiBusy] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)
    const [aiDebug, setAiDebug] = useState<string | null>(null)
    const [aiShowDebug, setAiShowDebug] = useState(false)
    const [aiResult, setAiResult] = useState<GeneratedBuff[] | null>(null)
    const [aiRawContent, setAiRawContent] = useState<string>('')
    const [aiParseError, setAiParseError] = useState<string | null>(null)
    const [aiOutput, setAiOutput] = useState('')
    const [aiReasoning, setAiReasoning] = useState('')
    const [showReasoning, setShowReasoning] = useState(false)
    const [aiHistory, setAiHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
    const [followUp, setFollowUp] = useState('')
    const [prompts, setPrompts] = useState<{ kind: 'system' | 'user' | 'history'; text: string }[]>([])
    const [showPrompts, setShowPrompts] = useState(false)
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [showLogs, setShowLogs] = useState(false)
    const logBoxRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (showLogs && logBoxRef.current) {
            logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
        }
    }, [logs, showLogs, aiOutput, aiReasoning])

    const canSave = entityName.trim().length > 0

    // 统一 AI 请求（首轮或追问）
    async function runAiRequest(newUserMessage: string, history: { role: 'user' | 'assistant'; content: string }[]) {
        setAiBusy(true)
        setAiError(null)
        setAiDebug(null)
        setAiShowDebug(false)
        setAiResult(null)
        setAiRawContent('')
        setAiParseError(null)
        setAiOutput('')
        setAiReasoning('')
        setPrompts([])
        setShowPrompts(true)
        setLogs([])
        setShowLogs(true)
        try {
            const res = await fetch('/api/admin/buff-sets/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: apiKey.trim(),
                    toolBase,
                    entityType,
                    entityName: entityName.trim(),
                    systemPrompt,
                    userPromptTemplate,
                    slangDict,
                    history,
                    newUserMessage
                })
            })
            await readNdjsonStream(res, (evt) => {
                if (evt.type === 'log') {
                    setLogs((prev) => [...prev, { level: evt.level ?? 'info', text: evt.text ?? '' }])
                } else if (evt.type === 'prompt') {
                    setPrompts((prev) => [...prev, { kind: evt.kind ?? 'user', text: evt.text ?? '' }])
                } else if (evt.type === 'ai') {
                    setAiOutput((prev) => prev + (evt.text ?? ''))
                } else if (evt.type === 'reasoning') {
                    setAiReasoning((prev) => prev + (evt.text ?? ''))
                    setShowReasoning(true)
                } else if (evt.type === 'result') {
                    if (Array.isArray(evt.data)) setAiResult(evt.data as GeneratedBuff[])
                    setAiRawContent(evt.rawContent ?? '')
                    setAiParseError(evt.parseError ?? null)
                } else if (evt.type === 'error') {
                    setAiError(evt.message ?? 'AI 生成请求失败')
                    if (evt.debug) setAiDebug(evt.debug)
                }
            })
        } catch {
            setAiError('AI 生成请求失败')
        } finally {
            setAiBusy(false)
        }
    }

    function onAiGenerate() {
        const name = entityName.trim()
        if (!name) {
            setAiError('请先选择实体名')
            return
        }
        if (!apiKey.trim()) {
            setAiError('请先在上方侧栏填入 DeepSeek API Key')
            return
        }
        setAiHistory([])
        runAiRequest('', [])
    }

    function onFollowUp() {
        const msg = followUp.trim()
        if (!msg || aiBusy) return
        const nextHistory = [...aiHistory, { role: 'user' as const, content: msg }]
        setAiHistory(nextHistory)
        setFollowUp('')
        runAiRequest(msg, nextHistory)
    }

    function resetConversation() {
        setAiHistory([])
        setAiResult(null)
        setAiRawContent('')
        setAiParseError(null)
        setAiOutput('')
        setAiReasoning('')
        setPrompts([])
        setShowPrompts(false)
        setAiError(null)
        setLogs([])
        setShowLogs(false)
    }

    function run(fn: () => Promise<unknown>): Promise<boolean> {
        return new Promise((resolve) => {
            startTransition(async () => {
                const res = await fn()
                const r = res as { error?: string } | undefined
                if (r?.error) {
                    setFlash(r.error)
                    resolve(false)
                } else {
                    setFlash(null)
                    router.refresh()
                    resolve(true)
                }
            })
        })
    }

    async function loadCatalog() {
        setCatalogLoading(true)
        setCatalogError(null)
        try {
            const res = await fetch('/api/admin/buff-sets/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toolBase, entityType })
            })
            let list: { name: string }[] = []
            let failMsg: string | null = null
            await readNdjsonStream(res, (evt) => {
                if (evt.type === 'result' && Array.isArray(evt.data)) {
                    list = (evt.data as { name: string }[]).map((e) => ({ name: e.name }))
                } else if (evt.type === 'error') {
                    failMsg = evt.message ?? '拉取实体目录失败'
                }
            })
            if (failMsg) {
                setCatalogError(failMsg)
                setCatalog(null)
            } else {
                const seen = new Set<string>()
                setCatalog(list.filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true))))
            }
        } catch {
            setCatalogError('拉取实体目录失败')
        } finally {
            setCatalogLoading(false)
        }
    }

    function openNamePicker() {
        setShowNamePicker(true)
        setNameSearch('')
        if (catalog === null) loadCatalog()
    }

    function pickName(name: string) {
        setEntityName(name)
        setShowNamePicker(false)
    }

    // ── buff 列表操作 ──
    function addBuff() {
        setBuffs((prev) => [...prev, { buffName: '', scope: 'team', exclusive: false, zones: [] }])
    }

    function removeBuff(idx: number) {
        setBuffs((prev) => prev.filter((_, i) => i !== idx))
    }

    function setBuffName(idx: number, value: string) {
        setBuffs((prev) => prev.map((b, i) => (i === idx ? { ...b, buffName: value } : b)))
    }

    function setBuffScope(idx: number, scope: BuffScope) {
        setBuffs((prev) => prev.map((b, i) => (i === idx ? { ...b, scope, exclusive: scope === 'effect_only' ? true : b.exclusive } : b)))
    }

    function setBuffExclusive(idx: number, exclusive: boolean) {
        setBuffs((prev) => prev.map((b, i) => (i === idx ? { ...b, exclusive } : b)))
    }

    function toggleAddZone(idx: number, zoneId: string) {
        setBuffs((prev) =>
            prev.map((b, i) => {
                if (i !== idx) return b
                if (b.zones.some((z) => z.zoneId === zoneId)) {
                    return { ...b, zones: b.zones.filter((z) => z.zoneId !== zoneId) }
                }
                return { ...b, zones: [...b.zones, { zoneId, value: '', override: false, ref: null }] }
            })
        )
    }

    function setZone(idx: number, zoneId: string, patch: Partial<ZoneRow>) {
        setBuffs((prev) =>
            prev.map((b, i) =>
                i === idx ? { ...b, zones: b.zones.map((z) => (z.zoneId === zoneId ? { ...z, ...patch } : z)) } : b
            )
        )
    }

    function toggleZoneRef(idx: number, zoneId: string) {
        setBuffs((prev) =>
            prev.map((b, i) => {
                if (i !== idx) return b
                return {
                    ...b,
                    zones: b.zones.map((z) =>
                        z.zoneId === zoneId
                            ? {
                                  ...z,
                                  ref: z.ref
                                      ? null
                                      : { targetZoneId: 'baseAtk', pct: '', threshold: undefined }
                              }
                            : z
                    )
                }
            })
        )
    }

    function onSave() {
        const name = entityName.trim()
        if (!name) {
            setFlash('请先选择实体名')
            return
        }
        const payload = buffs.map((b) => {
            const zones = b.zones
                .map((z): { zoneId: string; value: number; override?: boolean; ref?: unknown } | null => {
                    const n = Number(z.value)
                    if (!z.zoneId || Number.isNaN(n)) return null
                    return {
                        zoneId: z.zoneId,
                        value: n,
                        ...(z.ref
                            ? {
                                  ref: {
                                      targetZoneId: z.ref.targetZoneId,
                                      pct: Number(z.ref.pct) || 0,
                                      ...(z.ref.threshold !== undefined && z.ref.threshold !== ''
                                          ? { threshold: Number(z.ref.threshold) || 0 }
                                          : {})
                                  }
                              }
                            : {}),
                        ...(z.override ? { override: true } : {})
                    }
                })
                .filter((z): z is { zoneId: string; value: number; override?: boolean; ref?: unknown } => z !== null)
            return { buffName: b.buffName, scope: b.scope, exclusive: b.exclusive, zones }
        })
        run(() =>
            upsertBuffEntity({
                entityType,
                entityName: name,
                buffs: payload as Parameters<typeof upsertBuffEntity>[0]['buffs']
            })
        )
    }

    function onDeleteEntity() {
        if (!isEdit) return
        run(() => deleteBuffEntity(entityType, entityName)).then(() => {
            onEntityDeleted?.()
            router.refresh()
        })
    }

    // ── AI ──
    function applyAiResult() {
        if (!aiResult) return
        // 把本次 AI 输出存入历史（assistant 轮），供后续追问
        setAiHistory((prev) => [...prev, { role: 'assistant', content: aiRawContent || JSON.stringify(aiResult) }])
        setBuffs(
            aiResult.map((b) => ({
                buffName: b.buffName,
                scope: b.scope ?? 'team',
                exclusive: !!b.exclusive,
                zones: b.zones.map((z) => ({
                    zoneId: z.zoneId,
                    value: String(z.value),
                    override: !!z.override,
                    ref: z.ref
                        ? {
                              targetZoneId: z.ref.targetZoneId,
                              pct: String(z.ref.pct),
                              ...(z.ref.threshold !== undefined ? { threshold: String(z.ref.threshold) } : {})
                          }
                        : null
                }))
            }))
        )
        setAiResult(null)
    }

    const filteredCatalog = (catalog ?? []).filter((e) => e.name.includes(nameSearch.trim()))

    return (
        <div className="rounded-xl border border-(--card-border) bg-(--card) p-4">
            {flash && <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{flash}</div>}

            {/* 实体信息头 */}
            <div className="mb-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-(--muted)">
                    实体类型
                    <select
                        value={entityType}
                        onChange={(e) => {
                            setEntityType(e.target.value as BuffEntityType)
                            setCatalog(null)
                            setEntityName('')
                        }}
                        disabled={isEdit}
                        className="rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60 disabled:opacity-50"
                    >
                        {BUFF_ENTITY_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {BUFF_ENTITY_LABELS[t]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-(--muted)">
                    实体名（从工具箱目录选择）
                    <div className="relative">
                        <button
                            onClick={openNamePicker}
                            disabled={isEdit}
                            className={`flex w-full items-center justify-between rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60 disabled:opacity-60 ${
                                entityName ? 'text-(--fg)' : 'text-(--muted)'
                            }`}
                        >
                            <span className="truncate">{entityName || (isEdit ? entityName : '点击选择实体')}</span>
                            <Icon icon="mdi:chevron-down" className="size-4 shrink-0" />
                        </button>

                        {showNamePicker && (
                            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-(--card-border) bg-(--card) shadow-xl">
                                <input
                                    autoFocus
                                    value={nameSearch}
                                    onChange={(e) => setNameSearch(e.target.value)}
                                    placeholder="搜索实体名"
                                    className="w-full border-b border-(--card-border) bg-(--input-bg) px-2 py-2 text-sm outline-none"
                                />
                                <div className="max-h-72 overflow-y-auto p-1">
                                    {catalogLoading && (
                                        <div className="px-2 py-3 text-center text-xs text-(--muted)">加载中…</div>
                                    )}
                                    {catalogError && (
                                        <div className="px-2 py-3 text-center text-xs text-red-400">{catalogError}</div>
                                    )}
                                    {!catalogLoading && !catalogError && filteredCatalog.length === 0 && (
                                        <div className="px-2 py-3 text-center text-xs text-(--muted)">无匹配实体</div>
                                    )}
                                    {!catalogLoading &&
                                        !catalogError &&
                                        filteredCatalog.map((e) => (
                                            <button
                                                key={e.name}
                                                onClick={() => pickName(e.name)}
                                                className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-(--fg) transition-colors hover:bg-(--card-hover)"
                                            >
                                                {e.name}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                </label>
            </div>

            {/* Buff 列表 */}
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-(--muted)">
                    该实体的 Buff 列表（{buffs.length} 条）
                </span>
                <button
                    onClick={addBuff}
                    className="inline-flex items-center gap-1 rounded-lg border border-(--accent)/40 px-2.5 py-1 text-[11px] text-(--accent-text) transition-colors hover:bg-(--accent)/15"
                >
                    <Icon icon="mdi:plus" className="size-3.5" />
                    新增 Buff
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {buffs.length === 0 ? (
                    <div className="rounded-lg border border-(--card-border) bg-(--card-hover) px-3 py-6 text-center text-xs text-(--muted)">
                        暂无 Buff，点击右上角「新增 Buff」或使用下方 AI 生成
                    </div>
                ) : (
                    buffs.map((buff, idx) => (
                        <div key={idx} className="rounded-lg border border-(--card-border) bg-(--card-hover) p-3">
                            <div className="mb-2 flex items-center gap-2">
                                <input
                                    value={buff.buffName}
                                    onChange={(e) => setBuffName(idx, e.target.value)}
                                    placeholder="Buff 名"
                                    maxLength={80}
                                    className="min-w-0 flex-1 rounded border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                                />
                                <div className="flex shrink-0 overflow-hidden rounded-lg border border-(--card-border)">
                                    {BUFF_SCOPES.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setBuffScope(idx, s)}
                                            className={`px-2 py-1 text-[10px] transition-colors ${
                                                buff.scope === s
                                                    ? 'bg-(--accent)/15 text-(--accent-text)'
                                                    : 'bg-(--input-bg) text-(--muted) hover:text-(--fg)'
                                            }`}
                                            title={BUFF_SCOPE_LABELS[s]}
                                        >
                                            {BUFF_SCOPE_LABELS[s]}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setBuffExclusive(idx, !buff.exclusive)}
                                    className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition-colors ${
                                        buff.exclusive
                                            ? 'border-(--accent) text-(--accent-text)'
                                            : 'border-transparent text-(--muted) hover:text-(--fg)'
                                    }`}
                                    title="是否专属于某效应"
                                >
                                    <Icon icon={buff.exclusive ? 'mdi:check' : 'mdi:circle-outline'} className="size-3" />
                                    {buff.exclusive ? '专属' : '普通'}
                                </button>
                                <button
                                    onClick={() => removeBuff(idx)}
                                    className="shrink-0 rounded p-1 text-(--muted) transition-colors hover:text-red-400"
                                    title="移除该 Buff"
                                >
                                    <Icon icon="mdi:close" className="size-4" />
                                </button>
                            </div>

                            <div className="flex flex-col gap-3 md:flex-row">
                                <div className="md:w-40 shrink-0">
                                    <div className="mb-1 text-[10px] text-(--muted)">乘区（点击添加/移除）</div>
                                    <div className="grid grid-cols-2 gap-1 md:grid-cols-1">
                                        {BUFF_ZONES.map((def) => {
                                            const exists = buff.zones.some((z) => z.zoneId === def.id)
                                            return (
                                                <button
                                                    key={def.id}
                                                    onClick={() => toggleAddZone(idx, def.id)}
                                                    className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors ${
                                                        exists
                                                            ? 'bg-(--accent)/15 text-(--accent-text)'
                                                            : 'text-(--muted) hover:bg-(--card-bg)'
                                                    }`}
                                                >
                                                    <Icon
                                                        icon={exists ? 'mdi:check' : 'mdi:circle-outline'}
                                                        className="size-3.5 shrink-0"
                                                    />
                                                    {def.label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1 space-y-1.5">
                                    {buff.zones.length === 0 ? (
                                        <div className="py-4 text-center text-[11px] text-(--muted)">
                                            暂无乘区，点击左侧乘区添加
                                        </div>
                                    ) : (
                                        buff.zones.map((z) => {
                                            const def = BUFF_ZONE_MAP.get(z.zoneId)
                                            return (
                                                <div
                                                    key={z.zoneId}
                                                    className="rounded-lg bg-(--card-bg) px-3 py-1.5"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="min-w-0 flex-1 truncate text-[11px]">
                                                            {def?.label ?? z.zoneId}
                                                        </span>
                                                        <div className="flex shrink-0 items-center gap-1">
                                                            <input
                                                                type="number"
                                                                value={z.value}
                                                                onChange={(e) => setZone(idx, z.zoneId, { value: e.target.value })}
                                                                className="w-16 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-xs text-right outline-none focus:border-(--accent)/60 tabular-nums"
                                                            />
                                                            <span className="w-3 text-[10px] text-(--muted)">
                                                                {def?.unit === '%' ? '%' : ''}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => toggleZoneRef(idx, z.zoneId)}
                                                            className={`shrink-0 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                                                                z.ref
                                                                    ? 'border-(--accent) text-(--accent-text)'
                                                                    : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                            }`}
                                                            title="引用某属性（如 攻击白值×N%）"
                                                        >
                                                            {z.ref ? '引用' : '引用'}
                                                        </button>
                                                        <button
                                                            onClick={() => setZone(idx, z.zoneId, { override: !z.override })}
                                                            className={`shrink-0 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                                                                z.override
                                                                    ? 'border-(--accent) text-(--accent-text)'
                                                                    : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                            }`}
                                                            title="覆盖/追加"
                                                        >
                                                            {z.override ? '覆盖' : '追加'}
                                                        </button>
                                                        <button
                                                            onClick={() => toggleAddZone(idx, z.zoneId)}
                                                            className="shrink-0 rounded p-1 text-(--muted) transition-colors hover:text-red-400"
                                                            title="移除乘区"
                                                        >
                                                            <Icon icon="mdi:close" className="size-3.5" />
                                                        </button>
                                                    </div>
                                                    {z.ref && (
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-(--input-bg) px-2 py-1.5">
                                                            <span className="text-[10px] text-(--muted)">引用目标</span>
                                                            <select
                                                                value={z.ref.targetZoneId}
                                                                onChange={(e) =>
                                                                    setZone(idx, z.zoneId, {
                                                                        ref: { ...z.ref!, targetZoneId: e.target.value }
                                                                    })
                                                                }
                                                                className="rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-[11px] outline-none focus:border-(--accent)/60"
                                                            >
                                                                {BUFF_REF_ZONES.map((rz) => (
                                                                    <option key={rz.id} value={rz.id}>
                                                                        {rz.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <span className="text-[10px] text-(--muted)">百分比</span>
                                                            <input
                                                                type="number"
                                                                value={z.ref.pct}
                                                                onChange={(e) =>
                                                                    setZone(idx, z.zoneId, {
                                                                        ref: { ...z.ref!, pct: e.target.value }
                                                                    })
                                                                }
                                                                placeholder="如 50"
                                                                className="w-16 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-[11px] outline-none focus:border-(--accent)/60"
                                                            />
                                                            <span className="text-[10px] text-(--muted)">阈值</span>
                                                            <input
                                                                type="number"
                                                                value={z.ref.threshold ?? ''}
                                                                onChange={(e) =>
                                                                    setZone(idx, z.zoneId, {
                                                                        ref: { ...z.ref!, threshold: e.target.value }
                                                                    })
                                                                }
                                                                placeholder="可选"
                                                                className="w-16 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-[11px] outline-none focus:border-(--accent)/60"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* AI 辅助（迷你对话） */}
            <div className="mt-4 rounded-lg border border-(--card-border) bg-(--card-hover) p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-(--accent-text)">
                        <Icon icon="mdi:robot-outline" className="size-4" />
                        AI 辅助（DeepSeek）
                    </span>
                    <button
                        onClick={onAiGenerate}
                        disabled={aiBusy || !entityName.trim()}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-(--btn-text) transition-all hover:brightness-110 disabled:opacity-40"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon={aiBusy ? 'mdi:loading' : 'mdi:auto-fix'} className={aiBusy ? 'size-3.5 animate-spin' : 'size-3.5'} />
                        {aiBusy ? '生成中…' : '整实体一键生成'}
                    </button>
                    {(aiHistory.length > 0 || aiOutput || aiResult) && (
                        <button
                            onClick={resetConversation}
                            disabled={aiBusy}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-(--muted) hover:text-red-400 disabled:opacity-40"
                        >
                            <Icon icon="mdi:restart" className="size-3" />
                            清空对话
                        </button>
                    )}
                    <span className="text-[10px] text-(--muted)">
                        支持自定义提示词与追问
                    </span>
                </div>

                {aiError && (
                    <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                        <div>{aiError}</div>
                        {aiDebug && (
                            <div className="mt-1.5">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setAiShowDebug((v) => !v)}
                                        className="inline-flex items-center gap-1 rounded border border-red-500/40 px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20"
                                    >
                                        <Icon icon={aiShowDebug ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="size-3" />
                                        {aiShowDebug ? '收起调试日志' : '展开调试日志'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(aiDebug ?? '')
                                        }}
                                        className="inline-flex items-center gap-1 rounded border border-red-500/40 px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20"
                                    >
                                        <Icon icon="mdi:content-copy" className="size-3" />
                                        复制
                                    </button>
                                </div>
                                {aiShowDebug && (
                                    <pre className="mt-1.5 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2 font-mono text-[10px] leading-relaxed text-red-300">
                                        {aiDebug}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 本次提示词（处理后发送给 AI 的内容） */}
                {showPrompts && prompts.length > 0 && (
                    <div className="mt-2 rounded-lg border border-(--card-border) bg-black/10 p-2">
                        <div className="mb-1 flex items-center justify-between">
                            <span className="text-[10px] text-(--muted)">
                                发送给 AI 的提示词（{prompts.length} 段）
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setShowPrompts((v) => !v)}
                                    className="inline-flex items-center gap-1 rounded border border-(--card-border) px-1.5 py-0.5 text-[10px] text-(--muted) hover:text-(--fg)"
                                >
                                    <Icon icon={showPrompts ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="size-3" />
                                    {showPrompts ? '收起' : '展开'}
                                </button>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            prompts.map((p) => `===== ${p.kind} =====\n${p.text}`).join('\n\n')
                                        )
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-(--card-border) px-1.5 py-0.5 text-[10px] text-(--muted) hover:text-(--fg)"
                                >
                                    <Icon icon="mdi:content-copy" className="size-3" />
                                    复制全部
                                </button>
                            </div>
                        </div>
                        {showPrompts && (
                            <div className="space-y-1.5">
                                {prompts.map((p, i) => (
                                    <pre
                                        key={i}
                                        className={`max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2 font-mono text-[10px] leading-relaxed ${
                                            p.kind === 'system'
                                                ? 'text-violet-300'
                                                : p.kind === 'history'
                                                  ? 'text-amber-300'
                                                  : 'text-emerald-300'
                                        }`}
                                    >
                                        {p.text}
                                    </pre>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 管线日志 + AI 流式输出 */}
                {(showLogs && logs.length > 0) || aiOutput ? (
                    <div className="mt-2 rounded-lg border border-(--card-border) bg-black/10 p-2">
                        <div className="mb-1 flex items-center justify-between">
                            <span className="text-[10px] text-(--muted)">
                                实时日志（{logs.length} 行）{aiBusy ? ' · 生成中…' : ''}
                            </span>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(
                                        [...logs.map((l) => `[${l.level}] ${l.text}`), `[ai] ${aiOutput}`].join('\n')
                                    )
                                }}
                                className="inline-flex items-center gap-1 rounded border border-(--card-border) px-1.5 py-0.5 text-[10px] text-(--muted) hover:text-(--fg)"
                            >
                                <Icon icon="mdi:content-copy" className="size-3" />
                                复制
                            </button>
                        </div>
                        <div
                            ref={logBoxRef}
                            className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2 font-mono text-[10px] leading-relaxed"
                        >
                            {logs.map((l, i) => (
                                <div
                                    key={i}
                                    className={
                                        l.level === 'error'
                                            ? 'text-red-400'
                                            : l.level === 'success'
                                              ? 'text-emerald-400'
                                              : l.level === 'debug'
                                                ? 'text-sky-400'
                                                : 'text-(--fg)/80'
                                    }
                                >
                                    {l.text}
                                </div>
                            ))}
                            {aiOutput && (
                                <div className="mt-1 whitespace-pre-wrap border-t border-(--card-border) pt-1 text-emerald-300">
                                    {aiOutput}
                                    {aiBusy && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* 思考过程（可折叠） */}
                {aiReasoning && (
                    <div className="mt-2">
                        <button
                            onClick={() => setShowReasoning((v) => !v)}
                            className="inline-flex items-center gap-1 rounded border border-(--card-border) px-1.5 py-0.5 text-[10px] text-(--muted) hover:text-(--fg)"
                        >
                            <Icon icon={showReasoning ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="size-3" />
                            {showReasoning ? '收起思考过程' : '展开思考过程'}{aiBusy ? '（生成中…）' : ''}
                        </button>
                        {showReasoning && (
                            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-2 font-mono text-[10px] leading-relaxed text-sky-400">
                                {aiReasoning}
                            </pre>
                        )}
                    </div>
                )}

                {/* AI 结果：可应用 buffs 或纯文本回复 */}
                {!aiBusy && aiRawContent && (
                    <div className="mt-2 space-y-1.5">
                        {aiParseError && (
                            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                                AI 回复不是可解析的 Buff JSON（{aiParseError}），已作为对话文本显示，可追问修正。
                            </div>
                        )}
                        {aiResult !== null && aiResult.length > 0 && (
                            <>
                                <div className="text-[10px] text-(--muted)">
                                    共 {aiResult.length} 条，点击「应用」将整体替换当前 Buff 列表
                                </div>
                                {aiResult.map((b) => (
                                    <div key={b.buffName} className="flex items-center gap-2 rounded-lg bg-(--card) px-3 py-2">
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-center gap-1.5">
                                                <span className="truncate text-xs font-medium text-(--fg)">
                                                    {b.buffName}
                                                </span>
                                                <span className="rounded bg-(--accent)/10 px-1 py-0.5 text-[9px] text-(--accent-text)">
                                                    {BUFF_SCOPE_LABELS[b.scope ?? 'team']}
                                                </span>
                                                {b.exclusive && (
                                                    <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] text-amber-400">
                                                        效应专属
                                                    </span>
                                                )}
                                            </span>
                                            <span className="block truncate text-[10px] text-(--muted)">
                                                {b.zones
                                                    .map(
                                                        (z) =>
                                                            `${BUFF_ZONE_MAP.get(z.zoneId)?.label ?? z.zoneId} ${
                                                                z.override ? '覆盖+' : '+'
                                                            }${z.ref ? `引用${BUFF_REF_ZONES.find((r) => r.id === z.ref!.targetZoneId)?.label ?? z.ref!.targetZoneId}×${z.ref.pct}%` : z.value}${
                                                                !z.ref && BUFF_ZONE_MAP.get(z.zoneId)?.unit === '%' ? '%' : ''
                                                            }`
                                                    )
                                                    .join(' · ')}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                                <div className="flex justify-end">
                                    <button
                                        onClick={applyAiResult}
                                        className="inline-flex items-center gap-1 rounded-lg border border-(--accent)/40 px-3 py-1.5 text-xs text-(--accent-text) transition-colors hover:bg-(--accent)/15"
                                    >
                                        <Icon icon="mdi:content-save-outline" className="size-3.5" />
                                        应用（整体替换）
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* 追问输入 */}
                {aiRawContent && (
                    <div className="mt-2 flex items-start gap-2 border-t border-(--card-border) pt-2">
                        <input
                            value={followUp}
                            onChange={(e) => setFollowUp(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    onFollowUp()
                                }
                            }}
                            disabled={aiBusy}
                            placeholder="追问，如：把暴击率改为 20%，并去掉攻击固定值…"
                            className="min-w-0 flex-1 rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-xs outline-none focus:border-(--accent)/60 disabled:opacity-40"
                        />
                        <button
                            onClick={onFollowUp}
                            disabled={aiBusy || !followUp.trim()}
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-(--btn-text) disabled:opacity-40"
                            style={{ background: 'var(--btn-bg)' }}
                        >
                            <Icon icon={aiBusy ? 'mdi:loading' : 'mdi:send'} className={aiBusy ? 'size-3.5 animate-spin' : 'size-3.5'} />
                            追问
                        </button>
                    </div>
                )}
            </div>

            {/* 操作 */}
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-(--card-border) pt-3">
                {isEdit && (
                    <>
                        {confirmDeleteEntity ? (
                            <button
                                onClick={onDeleteEntity}
                                disabled={pending}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50"
                            >
                                确认删除该实体全部 Buff
                            </button>
                        ) : (
                            <button
                                onClick={() => setConfirmDeleteEntity(true)}
                                onBlur={() => setTimeout(() => setConfirmDeleteEntity(false), 2000)}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20"
                            >
                                <Icon icon="mdi:trash-can-outline" className="size-3.5" />
                                删除整个实体
                            </button>
                        )}
                    </>
                )}
                <button
                    onClick={onSave}
                    disabled={pending || !canSave}
                    className="rounded-lg px-4 py-1.5 text-sm font-medium text-(--btn-text) disabled:opacity-50"
                    style={{ background: 'var(--btn-bg)' }}
                >
                    <Icon icon="mdi:check" className="mr-1 inline size-4" />
                    保存{isEdit ? '修改' : '新增'}
                </button>
            </div>
        </div>
    )
}
