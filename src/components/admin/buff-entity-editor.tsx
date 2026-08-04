'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { upsertBuffEntity, deleteBuffEntity } from '@/lib/actions/buff-sets'
import { toast } from '@/components/ui/toast'
import { BUFF_ENTITY_LABELS, BUFF_ZONE_MAP, BUFF_REF_ZONES, BUFF_SCOPE_LABELS } from '@/lib/consts/buff-zones'
import type { BuffEntityType, BuffScope, BuffSetRow } from '@/lib/types/db'
import type { GeneratedBuff } from '@/lib/ai/types'
import BuffEntryModal, { type BuffEditDraft } from '@/components/admin/buff-entry-modal'

interface LogEntry {
    level: 'info' | 'success' | 'error' | 'debug'
    text: string
}

interface StreamEvent {
    type: 'log' | 'result' | 'error' | 'ai' | 'reasoning' | 'prompt' | 'tool'
    level?: 'info' | 'success' | 'error' | 'debug'
    text?: string
    data?: unknown
    message?: string
    debug?: string
    rawContent?: string
    parseError?: string | null
    kind?: 'system' | 'user' | 'history'
    name?: string
    args?: Record<string, unknown>
    resultLen?: number
    running?: boolean
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
    }
    toolBase: string
    apiKey: string
    systemPrompt: string
    initialTaskPrompt: string
    toolPrompts: Record<string, string>
    slangDict: string
    isAdmin: boolean
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
    initialTaskPrompt,
    toolPrompts,
    slangDict,
    isAdmin,
    onEntityDeleted
}: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [confirmDeleteEntity, setConfirmDeleteEntity] = useState(false)

    const entityType = initial.entityType
    const entityName = initial.entityName
    const [buffs, setBuffs] = useState<BuffRow[]>(
        initial.buffs.map((r) => ({
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

    // 弹窗编辑中的 buff 下标（null 表示关闭）
    const [editingIdx, setEditingIdx] = useState<number | null>(null)

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
    const [aiTools, setAiTools] = useState<{ name: string; args: Record<string, unknown>; resultLen?: number; running?: boolean }[]>([])
    const [showTools, setShowTools] = useState(false)
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [showLogs, setShowLogs] = useState(false)
    const logBoxRef = useRef<HTMLDivElement>(null)
    // 主体滚动容器 + 用户是否打断了自动滚动（向上滚动查看历史）
    const bodyRef = useRef<HTMLDivElement>(null)
    const autoScrollPaused = useRef(false)

    useEffect(() => {
        if (showLogs && logBoxRef.current) {
            logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight
        }
    }, [logs, showLogs, aiOutput, aiReasoning])

    // AI 内容更新时自动滚到底部；用户向上滚动过则暂停自动滚
    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        if (!autoScrollPaused.current) {
            el.scrollTop = el.scrollHeight
        }
    }, [aiOutput, aiReasoning, aiTools, logs])

    function onBodyScroll() {
        const el = bodyRef.current
        if (!el) return
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        // 偏离底部超过 40px 视为用户主动上滚 → 暂停自动滚
        if (distFromBottom > 40) autoScrollPaused.current = true
        else if (distFromBottom <= 4) autoScrollPaused.current = false
    }

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
        setAiTools([])
        setShowTools(true)
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
                    initialTaskPrompt,
                    toolPrompts,
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
                } else if (evt.type === 'tool') {
                    setAiTools((prev) => [
                        ...prev,
                        { name: evt.name ?? 'unknown', args: evt.args ?? {}, resultLen: evt.resultLen, running: evt.running }
                    ])
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
        setAiTools([])
        setShowTools(false)
        setAiError(null)
        setLogs([])
        setShowLogs(false)
    }

    function run(fn: () => Promise<unknown>): Promise<boolean> {
        return new Promise((resolve) => {
            startTransition(async () => {
                const res = await fn()
                const r = res as { error?: string; data?: { saved?: number } } | undefined
                if (r?.error) {
                    toast(r.error, 'error')
                    resolve(false)
                } else {
                    router.refresh()
                    resolve(true)
                }
            })
        })
    }

    // ── buff 列表操作 ──
    function addBuff() {
        const next = [...buffs, { buffName: '', scope: 'team' as BuffScope, exclusive: false, zones: [] }]
        setBuffs(next)
        setEditingIdx(next.length - 1)
    }

    function editBuff(idx: number) {
        setEditingIdx(idx)
    }

    function closeBuffModal() {
        setEditingIdx(null)
    }

    function saveBuffDraft(draft: BuffEditDraft) {
        if (editingIdx === null) return
        setBuffs((prev) => prev.map((b, i) => (i === editingIdx ? { ...b, ...draft } : b)))
        setEditingIdx(null)
    }

    function removeBuffFromModal() {
        if (editingIdx === null) return
        setBuffs((prev) => prev.filter((_, i) => i !== editingIdx))
        setEditingIdx(null)
    }

    function onSave() {
        const name = entityName.trim()
        if (!name) {
            toast('请先选择实体名', 'error')
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
        const savedCount = payload.filter((b) => b.zones.length > 0).length
        run(() =>
            upsertBuffEntity({
                entityType,
                entityName: name,
                buffs: payload as Parameters<typeof upsertBuffEntity>[0]['buffs']
            })
        ).then((ok) => {
            if (ok) {
                toast(`已保存 ${savedCount} 条 Buff`, 'success')
            }
        })
    }

    function onDeleteEntity() {
        if (!entityName) return
        run(() => deleteBuffEntity(entityType, entityName)).then((ok) => {
            if (ok) {
                toast('已删除该实体', 'success')
                onEntityDeleted?.()
                router.refresh()
            }
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
                              ...(z.ref.threshold !== undefined ? { threshold: String(z.ref.threshold) } : {}),
                              ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                          }
                        : null
                }))
            }))
        )
        setAiResult(null)
    }

    return (
        <div className="flex h-full flex-col rounded-xl border border-(--card-border) bg-(--card)">
            {/* 实体信息头（只读，由右侧列表选择） */}
            <div className="flex items-center justify-between border-b border-(--card-border) px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="rounded bg-(--accent)/10 px-2 py-0.5 text-xs font-medium text-(--accent-text)">
                        {BUFF_ENTITY_LABELS[entityType]}
                    </span>
                    <h2 className="truncate text-lg font-bold text-(--fg)">{entityName}</h2>
                </div>
                <span className="shrink-0 text-xs text-(--muted)">{buffs.length} 条 Buff</span>
            </div>

            {/* 可滚动主体 */}
            <div ref={bodyRef} onScroll={onBodyScroll} className="min-h-0 flex-1 overflow-y-auto p-4">

            {/* Buff 列表 */}
            <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-(--muted)">
                    该实体的 Buff 列表（{buffs.length} 条）
                </span>
                <button
                    onClick={addBuff}
                    className="toolbar-btn toolbar-btn-ghost"
                >
                    <Icon icon="mdi:plus" className="size-3.5" />
                    新增 Buff
                </button>
            </div>

            <div className="grid grid-cols-1 gap-1.5 xl:grid-cols-2">
                {buffs.length === 0 ? (
                    <div className="rounded-lg border border-(--card-border) bg-(--card-hover) px-3 py-6 text-center text-xs text-(--muted)">
                        暂无 Buff，点击右上角「新增 Buff」或使用下方 AI 生成
                    </div>
                ) : (
                    buffs.map((buff, idx) => (
                        <div
                            key={idx}
                            className="group flex items-center gap-2 rounded-lg border border-(--card-border) bg-(--card-hover) px-3 py-2"
                        >
                            <button
                                onClick={() => editBuff(idx)}
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                title="点击编辑"
                            >
                                <span className="truncate text-sm font-medium text-(--fg)">{buff.buffName || '（未命名）'}</span>
                                <span className="shrink-0 rounded bg-(--accent)/10 px-1.5 py-0.5 text-[9px] text-(--accent-text)">
                                    {BUFF_SCOPE_LABELS[buff.scope]}
                                </span>
                                {buff.exclusive && (
                                    <span className="shrink-0 rounded bg-(--warning)/15 px-1.5 py-0.5 text-[9px] text-(--warning)">
                                        效应专属
                                    </span>
                                )}
                            </button>
                            <span className="shrink-0 text-[10px] text-(--muted)">
                                {buff.zones.length} 乘区
                            </span>
                            <button
                                onClick={() => editBuff(idx)}
                                className="shrink-0 rounded p-1 text-(--muted) opacity-0 transition-opacity group-hover:opacity-100 hover:text-(--accent-text)"
                                title="编辑"
                            >
                                <Icon icon="mdi:pencil-outline" className="size-4" />
                            </button>
                            <button
                                onClick={() => {
                                    setBuffs((prev) => prev.filter((_, i) => i !== idx))
                                }}
                                className="shrink-0 rounded p-1 text-(--muted) opacity-0 transition-opacity group-hover:opacity-100 hover:text-(--danger)"
                                title="移除该 Buff"
                            >
                                <Icon icon="mdi:close" className="size-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* 单条 Buff 编辑弹窗 */}
            <BuffEntryModal
                key={editingIdx ?? 'closed'}
                open={editingIdx !== null}
                initial={editingIdx !== null ? (buffs[editingIdx] as BuffEditDraft) : null}
                onClose={closeBuffModal}
                onSave={saveBuffDraft}
                onDelete={removeBuffFromModal}
            />

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
                        className="toolbar-btn toolbar-btn-primary"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon={aiBusy ? 'mdi:loading' : 'mdi:auto-fix'} className={aiBusy ? 'size-3.5 animate-spin' : 'size-3.5'} />
                        {aiBusy ? '生成中…' : '整实体一键生成'}
                    </button>
                    {(aiHistory.length > 0 || aiOutput || aiResult) && (
                        <button
                            onClick={resetConversation}
                            disabled={aiBusy}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-(--muted) hover:text-(--danger) disabled:opacity-40"
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
                    <div className="mt-2 rounded-lg bg-(--danger)/15 px-3 py-2 text-xs text-(--danger)">
                        <div>{aiError}</div>
                        {aiDebug && (
                            <div className="mt-1.5">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setAiShowDebug((v) => !v)}
                                        className="inline-flex items-center gap-1 rounded border border-(--danger)/40 px-1.5 py-0.5 text-[10px] text-(--danger) hover:bg-(--danger)/20"
                                    >
                                        <Icon icon={aiShowDebug ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="size-3" />
                                        {aiShowDebug ? '收起调试日志' : '展开调试日志'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(aiDebug ?? '')
                                        }}
                                        className="inline-flex items-center gap-1 rounded border border-(--danger)/40 px-1.5 py-0.5 text-[10px] text-(--danger) hover:bg-(--danger)/20"
                                    >
                                        <Icon icon="mdi:content-copy" className="size-3" />
                                        复制
                                    </button>
                                </div>
                                {aiShowDebug && (
                                    <pre className="mt-1.5 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-(--code-bg-strong) p-2 font-mono text-[10px] leading-relaxed text-(--danger)">
                                        {aiDebug}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 本次提示词（处理后发送给 AI 的内容） */}
                {showPrompts && prompts.length > 0 && (
                    <div className="mt-2 rounded-lg border border-(--card-border) bg-(--code-bg) p-2">
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
                                        className={`max-h-48 overflow-auto whitespace-pre-wrap rounded bg-(--code-bg-strong) p-2 font-mono text-[10px] leading-relaxed ${
                                            p.kind === 'system'
                                                ? 'text-(--info)'
                                                : p.kind === 'history'
                                                  ? 'text-(--warning)'
                                                  : 'text-(--success)'
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
                    <div className="mt-2 rounded-lg border border-(--card-border) bg-(--code-bg) p-2">
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
                            className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-(--code-bg-strong) p-2 font-mono text-[10px] leading-relaxed"
                        >
                            {logs.map((l, i) => (
                                <div
                                    key={i}
                                    className={
                                        l.level === 'error'
                                            ? 'text-(--danger)'
                                            : l.level === 'success'
                                              ? 'text-(--success)'
                                              : l.level === 'debug'
                                                ? 'text-(--info)'
                                                : 'text-(--fg)/80'
                                    }
                                >
                                    {l.text}
                                </div>
                            ))}
                            {aiOutput && (
                                <div className="mt-1 whitespace-pre-wrap border-t border-(--card-border) pt-1 text-(--success)">
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
                            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-(--code-bg-strong) p-2 font-mono text-[10px] leading-relaxed text-(--info)">
                                {aiReasoning}
                            </pre>
                        )}
                    </div>
                )}

                {/* 工具调用（可折叠） */}
                {showTools && aiTools.length > 0 && (
                    <div className="mt-2">
                        <button
                            onClick={() => setShowTools((v) => !v)}
                            className="inline-flex items-center gap-1 rounded border border-(--card-border) px-1.5 py-0.5 text-[10px] text-(--muted) hover:text-(--fg)"
                        >
                            <Icon icon={showTools ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="size-3" />
                            {showTools ? '收起工具调用' : '展开工具调用'}（{aiTools.length} 次）
                        </button>
                        {showTools && (
                            <div className="mt-1.5 space-y-1">
                                {aiTools.map((t, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-2 rounded-lg bg-(--code-bg) px-2 py-1.5 font-mono text-[10px]"
                                    >
                                        <Icon
                                            icon={t.running ? 'mdi:loading' : 'mdi:toolbox-outline'}
                                            className={`mt-0.5 size-3.5 shrink-0 ${
                                                t.running ? 'animate-spin text-(--info)' : 'text-(--warning)'
                                            }`}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-(--fg)">{t.name}</div>
                                            <div className="truncate text-(--muted)">
                                                {JSON.stringify(t.args)}
                                                {t.resultLen !== undefined && ` → ${t.resultLen} 字符`}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* AI 结果：可应用 buffs 或纯文本回复 */}
                {!aiBusy && aiRawContent && (
                    <div className="mt-2 space-y-1.5">
                        {aiParseError && (
                            <div className="rounded-lg bg-(--warning)/15 px-3 py-2 text-xs text-(--warning)">
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
                                                    <span className="rounded bg-(--warning)/15 px-1 py-0.5 text-[9px] text-(--warning)">
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
                            </>
                        )}
                    </div>
                )}
            </div>
            </div>

            {/* 底部固定操作条 */}
            <div className="shrink-0 border-t border-(--card-border) px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    {aiResult && aiResult.length > 0 && (
                        <button
                            onClick={applyAiResult}
                            className="toolbar-btn toolbar-btn-primary"
                            style={{ background: 'var(--btn-bg)' }}
                        >
                            <Icon icon="mdi:content-save-outline" className="size-3.5" />
                            应用（{aiResult.length} 条）
                        </button>
                    )}
                    {aiRawContent && (
                        <div className="flex min-w-0 flex-1 items-center gap-2">
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
                                className="shrink-0 toolbar-btn toolbar-btn-primary"
                                style={{ background: 'var(--btn-bg)' }}
                            >
                                <Icon icon={aiBusy ? 'mdi:loading' : 'mdi:send'} className={aiBusy ? 'size-3.5 animate-spin' : 'size-3.5'} />
                                追问
                            </button>
                        </div>
                    )}
                    {isAdmin ? (
                        confirmDeleteEntity ? (
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
                                className="toolbar-btn toolbar-btn-ghost text-(--danger) hover:text-(--danger)"
                            >
                                <Icon icon="mdi:trash-can-outline" className="size-3.5" />
                                删除实体
                            </button>
                        )
                    ) : (
                        <span className="toolbar-btn toolbar-btn-ghost text-(--muted) select-none">
                            <Icon icon="mdi:lock-outline" className="size-3.5" />
                            仅管理员可保存
                        </span>
                    )}
                    <button
                        onClick={onSave}
                        disabled={pending || !canSave || !isAdmin}
                        title={!isAdmin ? '仅管理员可保存' : undefined}
                        className="toolbar-btn toolbar-btn-primary"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon
                            icon={pending ? 'mdi:loading' : 'mdi:check'}
                            className={pending ? 'size-4 animate-spin' : 'mr-1 inline size-4'}
                        />
                        {pending ? '保存中…' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    )
}
