'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { upsertBuffEntity, deleteBuffEntity } from '@/lib/actions/buff-sets'
import { toast } from '@/components/ui/toast'
import { BUFF_ENTITY_LABELS, BUFF_ZONES, BUFF_ZONE_MAP, BUFF_REF_ZONES, BUFF_REF_ZONE_MAP, BUFF_SCOPE_LABELS, BUFF_ELEMENTS, BUFF_DAMAGE_TYPES, BUFF_DAMAGE_TYPE_SHORT, CHAIN_MAX, REFINE_MAX, sanitizeCondition } from '@/lib/consts/buff-zones'
import type { BuffEntityType, BuffScope, BuffSetRow, BuffCondition } from '@/lib/types/db'
import type { GeneratedBuff } from '@/lib/ai/types'
import { generateBuffSet, type GenerateEvent } from '@/lib/ai/generate'
import { DeepSeekError, type ChatMessage } from '@/lib/ai/deepseek'
import { createClient } from '@/lib/supabase/client'
import BuffRefModal from '@/components/admin/buff-ref-modal'

interface LogEntry {
    level: 'info' | 'success' | 'error' | 'debug'
    text: string
}

function gcd(a: number, b: number): number {
    a = Math.abs(a)
    b = Math.abs(b)
    while (b) {
        const t = b
        b = a % b
        a = t
    }
    return a
}

// pct → 最简分数（divisor/multiplier），用于引用摘要展示（对齐工具箱）
function simplifyPct(pct: number): { divisor: number; multiplier: number } {
    if (pct === 0) return { divisor: 1, multiplier: 0 }
    const num = Math.round(pct)
    const g = gcd(num, 100)
    return { divisor: 100 / g, multiplier: num / g }
}

interface Props {
    initial: {
        entityType: BuffEntityType
        entityName: string
        buffs: BuffSetRow[]
    }
    toolBase: string
    apiKey: string
    aiBaseUrl: string
    aiModel: string
    systemPrompt: string
    initialTaskPrompt: string
    toolPrompts: Record<string, string>
    slangDict: string
    reasoningEffort?: 'low' | 'medium' | 'high'
    isAdmin: boolean
    // 跨实体共享会话（省 token / 缓存命中）
    sessionSeed?: ChatMessage[]
    onSessionUpdate?: (messages: ChatMessage[]) => void
    sessionShareEnabled?: boolean
    onEntityDeleted?: () => void
    onclose?: () => void
}

interface ZoneRefRow {
    targetZoneId: string
    pct: string
    threshold?: string
    lower?: string
    upper?: string
    discrete?: boolean
    divisor?: string
    multiplier?: string
    refOwner?: 'self' | 'owner'
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
    condition?: BuffCondition | null
    zones: ZoneRow[]
}

export default function BuffEntityEditor({
    initial,
    toolBase,
    apiKey,
    aiBaseUrl,
    aiModel,
    systemPrompt,
    initialTaskPrompt,
    toolPrompts,
    slangDict,
    reasoningEffort,
    isAdmin,
    sessionSeed,
    onSessionUpdate,
    sessionShareEnabled,
    onEntityDeleted,
    onclose
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
            condition: sanitizeCondition(r.condition) ?? null,
            zones: (r.buff_set ?? []).map((z) => ({
                zoneId: z.zoneId,
                value: String(z.value),
                override: !!z.override,
                ref: z.ref
                    ? {
                          targetZoneId: z.ref.targetZoneId,
                          pct: String(z.ref.pct),
                          ...(z.ref.threshold !== undefined ? { threshold: String(z.ref.threshold) } : {}),
                          ...(z.ref.lower !== undefined ? { lower: String(z.ref.lower) } : {}),
                          ...(z.ref.upper !== undefined ? { upper: String(z.ref.upper) } : {}),
                          ...(z.ref.discrete ? { discrete: true } : {}),
                          ...(z.ref.divisor !== undefined ? { divisor: String(z.ref.divisor) } : {}),
                          ...(z.ref.multiplier !== undefined ? { multiplier: String(z.ref.multiplier) } : {}),
                          ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                      }
                    : null
            }))
        }))
    )

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
    // 主体滚动容器 + 用户是否打断了自动滚动（向上滚动查看历史）
    const bodyRef = useRef<HTMLDivElement>(null)
    const autoScrollPaused = useRef(false)
    const scrollRaf = useRef<number | null>(null)

    // AI 内容更新时自动滚到底部（rAF 节流 + 平滑滚动）；用户向上滚动过则暂停自动滚
    useEffect(() => {
        const el = bodyRef.current
        if (!el) return
        if (!autoScrollPaused.current) {
            if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current)
            scrollRaf.current = requestAnimationFrame(() => {
                el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
                scrollRaf.current = null
            })
        }
        return () => {
            if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current)
        }
    }, [aiOutput, aiReasoning, aiTools, logs, aiHistory])

    function onBodyScroll() {
        const el = bodyRef.current
        if (!el) return
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        // 偏离底部超过 12px 视为用户主动上滚 → 暂停自动滚；回到底部 2px 内恢复
        if (distFromBottom > 12) autoScrollPaused.current = true
        else if (distFromBottom <= 2) autoScrollPaused.current = false
    }

    const canSave = entityName.trim().length > 0

    // 前端直连 DeepSeek 查询已收录 buff 集（供 get_buff_sets 等工具）
    async function getBuffSets(queryType?: string, queryName?: string, query?: string) {
        const supabase = createClient()
        let q = supabase
            .from('buff_sets')
            .select('entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set')
            .order('entity_type', { ascending: true })
            .order('entity_name', { ascending: true })
        if (queryType) q = q.eq('entity_type', queryType)
        if (queryName) q = q.eq('entity_name', queryName)
        if (query) q = q.or(`entity_name.ilike.%${query.replace(/[%_\\]/g, '\\$&')}%,buff_name.ilike.%${query.replace(/[%_\\]/g, '\\$&')}%`)
        const { data, error } = await q.limit(200)
        if (error) return { error: error.message }
        return { total: (data ?? []).length, buffSets: data ?? [] }
    }

    // 统一 AI 请求（首轮或追问），浏览器直连 DeepSeek
    async function runAiRequest(newUserMessage: string, history: { role: 'user' | 'assistant'; content: string }[]) {
        // 新一轮强制滚到底部（即使之前在看历史）
        autoScrollPaused.current = false
        requestAnimationFrame(() => {
            bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
        })
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
        setShowPrompts(false)
        setAiTools([])
        setShowTools(true)
        setLogs([])
        setShowLogs(false)
        try {
            await generateBuffSet({
                apiKey: apiKey.trim(),
                toolBase,
                entityType,
                entityName: entityName.trim(),
                baseUrl: aiBaseUrl.trim() || undefined,
                model: aiModel.trim() || undefined,
                systemPrompt,
                initialTaskPrompt,
                toolPrompts,
                slangDict,
                reasoningEffort,
                history: history as ChatMessage[],
                newUserMessage,
                getBuffSets,
                seedMessages: sessionShareEnabled ? sessionSeed : undefined,
                onMessages: sessionShareEnabled ? onSessionUpdate : undefined,
                onEvent: (evt: GenerateEvent) => {
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
                        if (Array.isArray(evt.data)) {
                            if (polishActive.current) {
                                // 一键润色：自动应用到列表，记录一次 assistant 轮
                                const list = evt.data as GeneratedBuff[]
                                setAiHistory((prev) => [
                                    ...prev,
                                    { role: 'assistant', content: evt.rawContent ?? JSON.stringify(list) }
                                ])
                                applyBuffList(list)
                                setAiResult(null)
                            } else {
                                setAiResult(evt.data as GeneratedBuff[])
                            }
                        }
                        setAiRawContent(evt.rawContent ?? '')
                        setAiParseError(evt.parseError ?? null)
                    } else if (evt.type === 'error') {
                        setAiError(evt.message ?? 'AI 生成请求失败')
                        if (evt.debug) setAiDebug(evt.debug)
                    }
                }
            })
        } catch (e) {
            if (e instanceof DeepSeekError) {
                setAiError(e.message)
                setAiDebug(e.debug)
            } else {
                setAiError(e instanceof Error ? e.message : 'AI 生成请求失败')
            }
        } finally {
            setAiBusy(false)
            polishActive.current = false
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
        // 新消息走 newUserMessage，history 只传旧轮，避免与 route 首轮任务指令重复
        runAiRequest(msg, aiHistory)
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

    // ── buff 列表与就地编辑 ──
    const [activeBuffIdx, setActiveBuffIdx] = useState<number | null>(null)
    const [condPanelOpen, setCondPanelOpen] = useState(false)

    const activeBuff = activeBuffIdx !== null ? buffs[activeBuffIdx] : null

    // 条件摘要（对齐工具箱：角色 ≥N链，武器 ≥N阶，伤害属性，伤害类型短名）
    const conditionSummary = (() => {
        const cond = activeBuff?.condition
        if (!cond) return ''
        const parts: string[] = []
        if (cond.chain !== undefined) parts.push(`角色 ≥${cond.chain}链`)
        if (cond.refinement !== undefined) parts.push(`武器 ≥${cond.refinement}阶`)
        if (cond.elements?.length) parts.push(`伤害属性 ${cond.elements.join('/')}`)
        if (cond.damageTypes?.length)
            parts.push(`伤害类型 ${cond.damageTypes.map((d) => BUFF_DAMAGE_TYPE_SHORT[d] ?? d).join('/')}`)
        return parts.join('，')
    })()

    const SCOPE_TABS: Array<{ value: BuffScope; label: string }> = [
        { value: 'self', label: '自己' },
        { value: 'self_except', label: '队友' },
        { value: 'team', label: '全队' },
        { value: 'effect_only', label: '效应' }
    ]

    function addBuff() {
        const next = [
            ...buffs,
            { buffName: '', scope: 'team' as BuffScope, exclusive: false, condition: null, zones: [] }
        ]
        setBuffs(next)
        setActiveBuffIdx(next.length - 1)
    }

    function removeBuffAt(idx: number) {
        setBuffs((prev) => prev.filter((_, i) => i !== idx))
        setActiveBuffIdx((prev) => {
            if (prev === null) return null
            if (prev === idx) return null
            return prev > idx ? prev - 1 : prev
        })
    }

    function updateActiveBuff(patch: Partial<BuffRow>) {
        if (activeBuffIdx === null) return
        setBuffs((prev) => prev.map((b, i) => (i === activeBuffIdx ? { ...b, ...patch } : b)))
    }

    function setBuffScope(scope: BuffScope) {
        updateActiveBuff({ scope, exclusive: scope === 'effect_only' })
    }

    // 多字段条件：开 = 空对象（可同时设置链/精炼/属性/类型），关 = null（经面板清除）
    function setBuffChain(min: number) {
        if (!activeBuff?.condition) return
        const cond = { ...activeBuff.condition }
        if (cond.chain === min) delete cond.chain
        else cond.chain = min
        updateActiveBuff({ condition: cond })
    }

    function setBuffRefinement(min: number) {
        if (!activeBuff?.condition) return
        const cond = { ...activeBuff.condition }
        if (cond.refinement === min) delete cond.refinement
        else cond.refinement = min
        updateActiveBuff({ condition: cond })
    }

    function toggleConditionElement(el: string) {
        if (!activeBuff?.condition) return
        const cond = { ...activeBuff.condition }
        const list = cond.elements ?? []
        const next = list.includes(el) ? list.filter((e) => e !== el) : [...list, el]
        updateActiveBuff({ condition: { ...cond, elements: next } })
    }

    function toggleConditionDamageType(dt: string) {
        if (!activeBuff?.condition) return
        const cond = { ...activeBuff.condition }
        const list = cond.damageTypes ?? []
        const next = list.includes(dt) ? list.filter((d) => d !== dt) : [...list, dt]
        updateActiveBuff({ condition: { ...cond, damageTypes: next } })
    }

    function toggleZone(zoneId: string) {
        if (activeBuffIdx === null) return
        setBuffs((prev) =>
            prev.map((b, i) => {
                if (i !== activeBuffIdx) return b
                if (b.zones.some((z) => z.zoneId === zoneId)) {
                    return { ...b, zones: b.zones.filter((z) => z.zoneId !== zoneId) }
                }
                return { ...b, zones: [...b.zones, { zoneId, value: '', override: false, ref: null }] }
            })
        )
    }

    function setZoneValue(zoneId: string, value: string) {
        if (activeBuffIdx === null) return
        setBuffs((prev) =>
            prev.map((b, i) =>
                i === activeBuffIdx
                    ? { ...b, zones: b.zones.map((z) => (z.zoneId === zoneId ? { ...z, value } : z)) }
                    : b
            )
        )
    }

    function setZoneOverride(zoneId: string, override: boolean) {
        if (activeBuffIdx === null) return
        setBuffs((prev) =>
            prev.map((b, i) =>
                i === activeBuffIdx
                    ? { ...b, zones: b.zones.map((z) => (z.zoneId === zoneId ? { ...z, override } : z)) }
                    : b
            )
        )
    }

    // ── 引用配置弹窗 ──
    const [refTarget, setRefTarget] = useState<{ buffIdx: number; zoneId: string } | null>(null)
    const refZone = refTarget ? buffs[refTarget.buffIdx]?.zones.find((z) => z.zoneId === refTarget.zoneId) ?? null : null

    function saveRef(ref: ZoneRefRow | null) {
        if (!refTarget) return
        const { buffIdx, zoneId } = refTarget
        setBuffs((prev) =>
            prev.map((b, i) =>
                i === buffIdx
                    ? { ...b, zones: b.zones.map((z) => (z.zoneId === zoneId ? { ...z, ref } : z)) }
                    : b
            )
        )
        setRefTarget(null)
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
                                          : {}),
                                      ...(z.ref.lower !== undefined && z.ref.lower !== ''
                                          ? { lower: Number(z.ref.lower) || 0 }
                                          : {}),
                                      ...(z.ref.upper !== undefined && z.ref.upper !== ''
                                          ? { upper: Number(z.ref.upper) || 0 }
                                          : {}),
                                      ...(z.ref.discrete ? { discrete: true } : {}),
                                      ...(z.ref.divisor !== undefined && z.ref.divisor !== ''
                                          ? { divisor: Number(z.ref.divisor) || 0 }
                                          : {}),
                                      ...(z.ref.multiplier !== undefined && z.ref.multiplier !== ''
                                          ? { multiplier: Number(z.ref.multiplier) || 0 }
                                          : {}),
                                      ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                                  }
                              }
                            : {}),
                        ...(z.override ? { override: true } : {})
                    }
                })
                .filter((z): z is { zoneId: string; value: number; override?: boolean; ref?: unknown } => z !== null)
            return {
                buffName: b.buffName,
                scope: b.scope,
                exclusive: b.exclusive,
                ...(b.condition ? { condition: b.condition } : {}),
                zones
            }
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
    // 把 AI 生成的 buffs 应用到列表（数字 → 字符串草稿）
    // AI buffs → 编辑草稿行
    function toBuffRow(b: GeneratedBuff): BuffRow {
        return {
            buffName: b.buffName,
            scope: b.scope ?? 'team',
            exclusive: !!b.exclusive,
            condition: sanitizeCondition(b.condition) ?? null,
            zones: b.zones.map((z) => ({
                zoneId: z.zoneId,
                value: String(z.value),
                override: !!z.override,
                ref: z.ref
                    ? {
                          targetZoneId: z.ref.targetZoneId,
                          pct: String(z.ref.pct),
                          ...(z.ref.threshold !== undefined ? { threshold: String(z.ref.threshold) } : {}),
                          ...(z.ref.lower !== undefined ? { lower: String(z.ref.lower) } : {}),
                          ...(z.ref.upper !== undefined ? { upper: String(z.ref.upper) } : {}),
                          ...(z.ref.discrete ? { discrete: true } : {}),
                          ...(z.ref.divisor !== undefined ? { divisor: String(z.ref.divisor) } : {}),
                          ...(z.ref.multiplier !== undefined ? { multiplier: String(z.ref.multiplier) } : {}),
                          ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                      }
                    : null
            }))
        }
    }

    // 整体替换：用 AI 结果替换整个列表
    function applyBuffList(list: GeneratedBuff[]) {
        setBuffs(list.map(toBuffRow))
        setActiveBuffIdx(0)
    }

    // 追加合并：同名覆盖（保持原位置），无同名则追加到末尾
    function mergeBuffList(list: GeneratedBuff[]) {
        setBuffs((prev) => {
            const idxMap = new Map<string, number>()
            prev.forEach((b, i) => idxMap.set(b.buffName.trim(), i))
            const next = [...prev]
            for (const b of list) {
                const name = b.buffName.trim()
                if (!name) continue
                if (idxMap.has(name)) {
                    next[idxMap.get(name)!] = toBuffRow(b)
                } else {
                    idxMap.set(name, next.length)
                    next.push(toBuffRow(b))
                }
            }
            return next
        })
    }

    function applyAiResult() {
        if (!aiResult) return
        // 把本次 AI 输出存入历史（assistant 轮），供后续追问
        setAiHistory((prev) => [...prev, { role: 'assistant', content: aiRawContent || JSON.stringify(aiResult) }])
        applyBuffList(aiResult)
        setAiResult(null)
    }

    function mergeAiResult() {
        if (!aiResult) return
        setAiHistory((prev) => [...prev, { role: 'assistant', content: aiRawContent || JSON.stringify(aiResult) }])
        mergeBuffList(aiResult)
        setAiResult(null)
    }

    // 一键润色：仅润色 buffName，保留 zones/scope/condition/exclusive
    const polishActive = useRef(false)

    function onAiPolish() {
        const name = entityName.trim()
        if (!name) {
            setAiError('请先选择实体名')
            return
        }
        if (!apiKey.trim()) {
            setAiError('请先在上方侧栏填入 DeepSeek API Key')
            return
        }
        if (buffs.length === 0) {
            setAiError('当前没有 Buff 可润色')
            return
        }
        const zonePayload = (z: ZoneRow) => ({
            zoneId: z.zoneId,
            value: Number(z.value) || 0,
            ...(z.ref
                ? {
                      ref: {
                          targetZoneId: z.ref.targetZoneId,
                          pct: Number(z.ref.pct) || 0,
                          ...(z.ref.threshold !== undefined && z.ref.threshold !== ''
                              ? { threshold: Number(z.ref.threshold) || 0 }
                              : {}),
                          ...(z.ref.lower !== undefined && z.ref.lower !== '' ? { lower: Number(z.ref.lower) || 0 } : {}),
                          ...(z.ref.upper !== undefined && z.ref.upper !== '' ? { upper: Number(z.ref.upper) || 0 } : {}),
                          ...(z.ref.discrete ? { discrete: true } : {}),
                          ...(z.ref.divisor !== undefined && z.ref.divisor !== ''
                              ? { divisor: Number(z.ref.divisor) || 0 }
                              : {}),
                          ...(z.ref.multiplier !== undefined && z.ref.multiplier !== ''
                              ? { multiplier: Number(z.ref.multiplier) || 0 }
                              : {}),
                          ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                      }
                  }
                : {}),
            ...(z.override ? { override: true } : {})
        })
        const currentJson = JSON.stringify(
            buffs.map((b) => ({
                buffName: b.buffName,
                scope: b.scope,
                exclusive: !!b.exclusive,
                ...(b.condition ? { condition: b.condition } : {}),
                zones: b.zones.map(zonePayload)
            }))
        )
        const msg = `请按命名规范润色以下 Buff 集内每个 buff 的 buffName（格式：[条件]<触发,附加条件>乘区1+乘区2+…+层数；条件标注归属者与所需链/阶，仅叠层>1 时带 N 层，单层不带）。\n要求：保留每个 buff 的 zones/scope/condition/exclusive 完全不变，只重写 buffName；不要增删乘区、不要改数值或条件；不确定规范时调用 get_naming_rules。\n输出完整 buffs JSON。\n\n当前 Buff 集：\n${currentJson}`
        polishActive.current = true
        setAiHistory([])
        runAiRequest(msg, [])
    }

    return (
        <div className="flex h-full flex-col rounded-xl border border-(--card-border) bg-(--card)">
            {/* 实体信息头 */}
            <div className="flex items-center justify-between border-b border-(--card-border) px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="rounded bg-(--accent)/10 px-2 py-0.5 text-xs font-medium text-(--accent-text)">
                        {BUFF_ENTITY_LABELS[entityType]}
                    </span>
                    <h2 className="truncate text-lg font-bold text-(--fg)">{entityName}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-(--muted)">{buffs.length} 条 Buff</span>
                    {onclose && (
                        <button
                            onClick={onclose}
                            className="rounded p-1 text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg)"
                            title="关闭"
                        >
                            <Icon icon="mdi:close" className="size-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* 四栏主体 */}
            <div className="flex min-h-0 flex-1 overflow-hidden">

                {/* ① 左：Buff 列表 */}
                <div className="flex w-56 shrink-0 flex-col border-r border-(--card-border)">
                    <div className="flex shrink-0 items-center justify-between border-b border-(--card-border) px-3 py-2">
                        <span className="text-xs font-medium text-(--muted)">Buff 条目（{buffs.length}）</span>
                        <button onClick={addBuff} className="toolbar-btn toolbar-btn-ghost px-1.5 py-0.5">
                            <Icon icon="mdi:plus" className="size-3.5" />
                            新增
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                        {buffs.length === 0 ? (
                            <div className="py-6 text-center text-[11px] text-(--muted)">暂无 Buff，点击上方新增</div>
                        ) : (
                            buffs.map((buff, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setActiveBuffIdx(idx)}
                                    className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                                        idx === activeBuffIdx
                                            ? 'bg-(--accent)/15 text-(--accent-text)'
                                            : 'text-(--fg) hover:bg-(--card-hover)'
                                    }`}
                                >
                                    <span className="block truncate text-xs font-medium">
                                        {buff.buffName.trim() || '（未命名）'}
                                    </span>
                                    <span className="block truncate text-[10px] text-(--muted)">
                                        {buff.zones
                                            .map(
                                                (z) =>
                                                    `${BUFF_ZONE_MAP.get(z.zoneId)?.label ?? z.zoneId}+${
                                                        z.ref ? '引用' : z.value
                                                    }`
                                            )
                                            .join(' · ') || '无乘区'}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* ② 中：就地编辑器 */}
                <div className="flex min-w-0 flex-1 flex-col">
                    {activeBuff ? (
                        <>
                            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--card-border) px-3 py-2">
                                <input
                                    value={activeBuff.buffName}
                                    onChange={(e) => updateActiveBuff({ buffName: e.target.value })}
                                    placeholder="Buff 名"
                                    className="min-w-0 flex-1 rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1 text-sm outline-none focus:border-(--accent)/60"
                                />
                                <div className="flex shrink-0 overflow-hidden rounded-lg border border-(--card-border)">
                                    {SCOPE_TABS.map((t) => (
                                        <button
                                            key={t.value}
                                            onClick={() => setBuffScope(t.value)}
                                            className={`px-2 py-1 text-[11px] transition-colors ${
                                                (activeBuff.scope ?? 'team') === t.value
                                                    ? 'bg-(--accent)/15 text-(--accent-text)'
                                                    : 'text-(--muted) hover:text-(--fg)'
                                            }`}
                                            title={BUFF_SCOPE_LABELS[t.value]}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => removeBuffAt(activeBuffIdx!)}
                                    className="shrink-0 rounded p-1 text-(--muted) transition-colors hover:text-(--danger)"
                                    title="删除该 Buff"
                                >
                                    <Icon icon="mdi:delete-outline" className="size-4" />
                                </button>
                            </div>

                            {/* 生效条件（折叠面板：整行摘要 + 展开四段） */}
                            <div className="shrink-0 border-b border-(--card-border)">
                                <button
                                    onClick={() => setCondPanelOpen((v) => !v)}
                                    className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] transition-colors hover:bg-(--card-hover) ${
                                        conditionSummary ? 'text-(--accent-text)' : 'text-(--muted)'
                                    }`}
                                    title="生效条件"
                                >
                                    <Icon
                                        icon={condPanelOpen ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                                        className="size-3.5 shrink-0 text-(--muted)"
                                    />
                                    <span className="shrink-0">生效条件</span>
                                    {conditionSummary && (
                                        <span className="min-w-0 truncate text-[11px]">：{conditionSummary}</span>
                                    )}
                                </button>
                                {condPanelOpen && (
                                    <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5">
                                        <div className="flex items-center gap-2 rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1">
                                            <span className="text-[11px] text-(--fg)">共鸣链</span>
                                            <div className="flex overflow-hidden rounded border border-(--card-border)">
                                                {Array.from({ length: CHAIN_MAX + 1 }, (_, k) => k).map((n) => (
                                                    <button
                                                        key={n}
                                                        onClick={() => setBuffChain(n)}
                                                        className={`flex h-6 min-w-6 items-center justify-center px-1 text-[11px] transition-colors ${
                                                            activeBuff.condition?.chain === n
                                                                ? 'bg-(--accent)/15 text-(--accent-text)'
                                                                : 'text-(--muted) hover:text-(--fg)'
                                                        }`}
                                                    >
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                            {activeBuff.condition?.chain !== undefined && (
                                                <span className="text-[11px] font-medium text-(--accent-text)">
                                                    ≥{activeBuff.condition.chain}链
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1">
                                            <span className="text-[11px] text-(--fg)">精炼</span>
                                            <div className="flex overflow-hidden rounded border border-(--card-border)">
                                                {Array.from({ length: REFINE_MAX }, (_, k) => k + 1).map((n) => (
                                                    <button
                                                        key={n}
                                                        onClick={() => setBuffRefinement(n)}
                                                        className={`flex h-6 min-w-6 items-center justify-center px-1 text-[11px] transition-colors ${
                                                            activeBuff.condition?.refinement === n
                                                                ? 'bg-(--accent)/15 text-(--accent-text)'
                                                                : 'text-(--muted) hover:text-(--fg)'
                                                        }`}
                                                    >
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                            {activeBuff.condition?.refinement && (
                                                <span className="text-[11px] font-medium text-(--accent-text)">
                                                    ≥{activeBuff.condition.refinement}阶
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1">
                                            <span className="text-[11px] text-(--fg)">伤害属性</span>
                                            {BUFF_ELEMENTS.map((el) => (
                                                <button
                                                    key={el}
                                                    onClick={() => toggleConditionElement(el)}
                                                    className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                                                        (activeBuff.condition?.elements ?? []).includes(el)
                                                            ? 'bg-(--accent)/15 text-(--accent-text)'
                                                            : 'text-(--muted) hover:text-(--fg)'
                                                    }`}
                                                >
                                                    {el}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1">
                                            <span className="text-[11px] text-(--fg)">伤害类型</span>
                                            {BUFF_DAMAGE_TYPES.map((dt) => (
                                                <button
                                                    key={dt}
                                                    onClick={() => toggleConditionDamageType(dt)}
                                                    title={dt}
                                                    className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                                                        (activeBuff.condition?.damageTypes ?? []).includes(dt)
                                                            ? 'bg-(--accent)/15 text-(--accent-text)'
                                                            : 'text-(--muted) hover:text-(--fg)'
                                                    }`}
                                                >
                                                    {BUFF_DAMAGE_TYPE_SHORT[dt] ?? dt}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => {
                                                updateActiveBuff({ condition: null })
                                                setCondPanelOpen(false)
                                            }}
                                            className="flex h-6 items-center gap-1 rounded-lg border border-(--card-border) px-2 text-[10px] text-(--muted) transition-colors hover:border-(--danger)/40 hover:text-(--danger)"
                                        >
                                            <Icon icon="mdi:close-circle-outline" className="size-3" />
                                            清除
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Zone 行列表 */}
                            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                                {activeBuff.zones.length === 0 ? (
                                    <div className="py-6 text-center text-[11px] text-(--muted)">
                                        暂无乘区，点击右侧乘区添加
                                    </div>
                                ) : (
                                    activeBuff.zones.map((z) => {
                                        const def = BUFF_ZONE_MAP.get(z.zoneId)
                                        return (
                                            <div
                                                key={z.zoneId}
                                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                                                style={{ background: 'var(--input-bg)' }}
                                            >
                                                <span className="min-w-0 flex-1 truncate text-[11px]">
                                                    {def?.label ?? z.zoneId}
                                                </span>
                                                {z.ref ? (
                                                    (() => {
                                                        const refDef = BUFF_REF_ZONE_MAP.get(z.ref!.targetZoneId)
                                                        const th = Number(z.ref!.threshold ?? 0)
                                                        const refOp = th < 0 ? '+' : '-'
                                                        const refTh = Math.abs(th)
                                                        const refS = simplifyPct(Number(z.ref!.pct))
                                                        const hasThreshold = th !== 0
                                                        const hasLower = z.ref!.lower !== undefined
                                                        const hasUpper = z.ref!.upper !== undefined
                                                        return (
                                                            <span
                                                                className="min-w-0 flex-1 truncate text-right text-[10px] text-(--muted)"
                                                                title={`引用: (${refDef?.label ?? '?'}${hasThreshold ? ` ${refOp} ${refTh}${refDef?.unit === '%' ? '%' : ''}` : ''}) ÷${refS.divisor}×${refS.multiplier}${hasLower || hasUpper ? ` clamp(${hasLower ? z.ref!.lower : ''} ~ ${hasUpper ? z.ref!.upper : ''})` : ''}`}
                                                            >
                                                                引用: ({refDef?.label ?? '?'}
                                                                {hasThreshold ? refOp + refTh + (refDef?.unit === '%' ? '%' : '') : ''}
                                                                ) ÷{refS.divisor}×{refS.multiplier}
                                                                {hasLower || hasUpper ? (
                                                                    <span className="text-(--muted)/60">
                                                                        ({hasLower ? z.ref!.lower : ''}~{hasUpper ? z.ref!.upper : ''})
                                                                    </span>
                                                                ) : null}
                                                            </span>
                                                        )
                                                    })()
                                                ) : (
                                                    <>
                                                        <input
                                                            type="number"
                                                            value={z.value}
                                                            onChange={(e) => setZoneValue(z.zoneId, e.target.value)}
                                                            className="w-16 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-xs text-right outline-none focus:border-(--accent)/60 tabular-nums"
                                                        />
                                                        <span className="w-3 text-[10px] text-(--muted)">
                                                            {def?.unit === '%' ? '%' : ''}
                                                        </span>
                                                    </>
                                                )}
                                                {z.zoneId !== 'extraRatio' && (
                                                    <button
                                                        onClick={() => setZoneOverride(z.zoneId, !z.override)}
                                                        className={`shrink-0 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                                                            z.override
                                                                ? 'border-(--accent) text-(--accent-text)'
                                                                : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                        }`}
                                                        title="覆盖/追加"
                                                    >
                                                        {z.override ? '覆盖' : '追加'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setRefTarget({ buffIdx: activeBuffIdx!, zoneId: z.zoneId })}
                                                    className={`shrink-0 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                                                        z.ref
                                                            ? 'border-(--accent) text-(--accent-text)'
                                                            : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                    }`}
                                                    title={
                                                        z.ref
                                                            ? `引${entityType === 'character' ? '自己' : '主人'} ${
                                                                  BUFF_REF_ZONE_MAP.get(z.ref.targetZoneId)?.label ?? z.ref.targetZoneId
                                                              } × ${z.ref.pct}%`
                                                            : '引用某属性（如 当前攻击×N%）'
                                                    }
                                                >
                                                    <Icon icon="mdi:link-variant" className="mr-0.5 size-3" />
                                                    {z.ref ? '已引用' : '引用'}
                                                </button>
                                                <button
                                                    onClick={() => toggleZone(z.zoneId)}
                                                    className="shrink-0 rounded p-1 text-(--muted) transition-colors hover:text-(--danger)"
                                                    title="移除乘区"
                                                >
                                                    <Icon icon="mdi:close" className="size-3.5" />
                                                </button>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center text-xs text-(--muted)">
                            点击左侧 Buff 条目进行编辑
                        </div>
                    )}
                </div>

                {/* ③ 乘区勾选面板 */}
                <div className="flex w-44 shrink-0 flex-col border-r border-(--card-border)">
                    <div className="shrink-0 border-b border-(--card-border) px-3 py-2 text-xs font-medium text-(--muted)">
                        乘区
                    </div>
                    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
                        {BUFF_ZONES.map((def) => {
                            const exists = activeBuff?.zones.some((z) => z.zoneId === def.id) ?? false
                            return (
                                <button
                                    key={def.id}
                                    onClick={() => toggleZone(def.id)}
                                    className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] font-medium transition-colors ${
                                        exists
                                            ? 'bg-(--accent)/15 text-(--accent-text)'
                                            : 'text-(--muted) hover:bg-(--card-hover) hover:text-(--fg)'
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

                {/* ④ AI 协作区（DeepSeek 聊天式） */}
                <div className="flex w-80 shrink-0 flex-col border-l border-(--card-border)">
                    {/* 头部 */}
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-(--card-border) px-3 py-2">
                        <span className="flex items-center gap-1 text-xs font-medium text-(--accent-text)">
                            <Icon icon="mdi:robot-outline" className="size-4" />
                            AI 辅助
                        </span>
                        <button
                            onClick={onAiGenerate}
                            disabled={aiBusy || !entityName.trim()}
                            className="toolbar-btn toolbar-btn-primary px-2 py-1 text-[11px]"
                            style={{ background: 'var(--btn-bg)' }}
                        >
                            <Icon icon={aiBusy ? 'mdi:loading' : 'mdi:auto-fix'} className={aiBusy ? 'size-3.5 animate-spin' : 'size-3.5'} />
                            {aiBusy ? '生成中…' : '一键生成'}
                        </button>
                        <button
                            onClick={onAiPolish}
                            disabled={aiBusy || !entityName.trim() || buffs.length === 0}
                            title="按命名规范润色当前 Buff 集的 buff 名（保留乘区/数值/条件不变）"
                            className="toolbar-btn toolbar-btn-ghost px-2 py-1 text-[11px]"
                        >
                            <Icon icon={aiBusy ? 'mdi:loading' : 'mdi:brush-variant'} className={aiBusy ? 'size-3.5 animate-spin' : 'size-3.5'} />
                            润色
                        </button>
                        {(aiHistory.length > 0 || aiOutput || aiResult) && (
                            <button
                                onClick={resetConversation}
                                disabled={aiBusy}
                                className="rounded p-1 text-(--muted) transition-colors hover:text-(--danger) disabled:opacity-40"
                                title="清空对话"
                            >
                                <Icon icon="mdi:restart" className="size-3.5" />
                            </button>
                        )}
                    </div>

                    {/* 消息列表（自动向下滚动） */}
                    <div ref={bodyRef} onScroll={onBodyScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                        {aiHistory.map((m, i) =>
                            m.role === 'user' ? (
                                <div key={i} className="flex justify-end">
                                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-(--accent) px-3 py-2 text-xs leading-relaxed text-(--accent-fg)">
                                        {m.content}
                                    </div>
                                </div>
                            ) : (
                                <div key={i} className="flex justify-start">
                                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-(--card-hover) px-3 py-2 text-xs leading-relaxed text-(--fg)">
                                        {m.content}
                                    </div>
                                </div>
                            )
                        )}

                        {/* 当前 AI 发言气泡（思考/工具/文本/结果/错误/日志/提示词 合并） */}
                        {(aiBusy && (aiOutput || aiReasoning || aiTools.length > 0)) ||
                        (!aiBusy && (aiRawContent || aiError)) ? (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-(--card-hover) px-3 py-2 text-xs leading-relaxed break-words text-(--fg)">
                                    {/* 思考过程（默认展开，可收起） */}
                                    {aiReasoning && (
                                        <div className="mb-1.5">
                                            <div className="flex items-center gap-1">
                                                <Icon icon="mdi:head-lightbulb-outline" className="size-3 text-(--muted)" />
                                                <button
                                                    onClick={() => setShowReasoning((v) => !v)}
                                                    className="text-[10px] text-(--muted) hover:text-(--fg)"
                                                >
                                                    {showReasoning ? '收起思考' : '展开思考'}
                                                </button>
                                            </div>
                                            {showReasoning && (
                                                <div className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10px] italic leading-relaxed text-(--muted)">
                                                    {aiReasoning}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 工具调用（默认显示，底部按钮可收起） */}
                                    {showTools && aiTools.length > 0 && (
                                        <div className="mb-1.5 space-y-0.5">
                                            {aiTools.map((t, i) => (
                                                <div key={i} className="flex items-start gap-1.5 font-mono text-[10px]">
                                                    <Icon
                                                        icon={t.running ? 'mdi:loading' : 'mdi:toolbox-outline'}
                                                        className={`mt-0.5 size-3 shrink-0 ${
                                                            t.running ? 'animate-spin text-(--info)' : 'text-(--warning)'
                                                        }`}
                                                    />
                                                    <div className="min-w-0 flex-1 text-(--muted)">
                                                        <span className="text-(--fg)/90">{t.name}</span>
                                                        {t.resultLen !== undefined && (
                                                            <span className="ml-1">→ {t.resultLen} 字符</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* AI 文本：流式 or 结果纯文本 */}
                                    {aiBusy && aiOutput ? (
                                        <div className="whitespace-pre-wrap break-words">
                                            {aiOutput}
                                            <span className="ml-0.5 inline-block animate-pulse">▍</span>
                                        </div>
                                    ) : !aiBusy && aiRawContent && (!aiResult || aiResult.length === 0) ? (
                                        <div className="whitespace-pre-wrap break-words">{aiRawContent}</div>
                                    ) : null}

                                    {/* 结果 buff 卡片 + 应用 */}
                                    {!aiBusy && aiResult !== null && aiResult.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="text-[10px] text-(--muted)">
                                                共 {aiResult.length} 条，点击「应用」将整体替换当前 Buff 列表
                                            </div>
                                            {aiResult.map((b) => (
                                                <div key={b.buffName} className="flex items-center gap-2 rounded-lg bg-(--card) px-2.5 py-2">
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
                                            <div className="flex gap-1.5">
                                                <button
                                                    onClick={applyAiResult}
                                                    className="toolbar-btn toolbar-btn-primary flex-1 justify-center"
                                                    style={{ background: 'var(--btn-bg)' }}
                                                    title="整体替换当前 Buff 列表"
                                                >
                                                    <Icon icon="mdi:content-save-outline" className="size-3.5" />
                                                    应用（{aiResult.length} 条）
                                                </button>
                                                <button
                                                    onClick={mergeAiResult}
                                                    className="toolbar-btn toolbar-btn-ghost flex-1 justify-center"
                                                    title="同名覆盖、无同名追加"
                                                >
                                                    <Icon icon="mdi:plus-box-outline" className="size-3.5" />
                                                    追加（{aiResult.length} 条）
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* 解析失败提示 */}
                                    {!aiBusy && aiParseError && (
                                        <div className="mt-1 text-[11px] text-(--warning)">
                                            AI 回复不是可解析的 Buff JSON（{aiParseError}），已作为文本显示，可追问修正。
                                        </div>
                                    )}

                                    {/* 错误（红字内联） */}
                                    {aiError && (
                                        <div className="mt-1 text-(--danger)">
                                            {aiError}
                                            {aiDebug && (
                                                <button
                                                    onClick={() => setAiShowDebug((v) => !v)}
                                                    className="ml-1 text-[10px] underline"
                                                >
                                                    {aiShowDebug ? '收起调试' : '调试'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {aiDebug && aiShowDebug && (
                                        <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-(--code-bg-strong) p-1.5 font-mono text-[10px] leading-relaxed text-(--danger)">
                                            {aiDebug}
                                        </pre>
                                    )}

                                    {/* 日志 / 提示词 折叠按钮 */}
                                    <div className="mt-1.5 flex items-center gap-1.5">
                                        {logs.length > 0 && (
                                            <button
                                                onClick={() => setShowLogs((v) => !v)}
                                                className="text-[10px] text-(--muted) hover:text-(--fg)"
                                            >
                                                日志（{logs.length}）
                                            </button>
                                        )}
                                        {prompts.length > 0 && (
                                            <button
                                                onClick={() => setShowPrompts((v) => !v)}
                                                className="text-[10px] text-(--muted) hover:text-(--fg)"
                                            >
                                                提示词（{prompts.length}）
                                            </button>
                                        )}
                                    </div>
                                    {showLogs && logs.length > 0 && (
                                        <div className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-(--code-bg) p-1.5 font-mono text-[10px] leading-relaxed">
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
                                                                : 'text-(--muted)'
                                                    }
                                                >
                                                    {l.text}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {showPrompts && prompts.length > 0 && (
                                        <div className="mt-1 space-y-1">
                                            {prompts.map((p, i) => (
                                                <pre
                                                    key={i}
                                                    className={`max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-(--code-bg) p-1.5 font-mono text-[10px] leading-relaxed ${
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
                            </div>
                        ) : null}

            </div>

                    {/* 底部输入行（常驻） */}
                    <div className="flex shrink-0 items-center gap-1.5 border-t border-(--card-border) p-2">
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
                            placeholder="追问，或直接提需求…"
                            className="min-w-0 flex-1 rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-xs outline-none focus:border-(--accent)/60 disabled:opacity-40"
                        />
                        <button
                            onClick={onFollowUp}
                            disabled={aiBusy || !followUp.trim()}
                            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-(--btn-text) transition-all hover:brightness-110 disabled:opacity-40"
                            style={{ background: 'var(--btn-bg)' }}
                        >
                            <Icon icon={aiBusy ? 'mdi:loading' : 'mdi:send'} className={aiBusy ? 'size-3.5 animate-spin' : 'size-3.5'} />
                        </button>
                    </div>
                </div>
            </div>

            {refTarget && (
                <BuffRefModal
                    open
                    entityType={entityType}
                    zoneId={refTarget.zoneId}
                    initialRef={refZone?.ref ?? null}
                    onSave={saveRef}
                    onClose={() => setRefTarget(null)}
                />
            )}

            {/* 底部固定操作条 */}
            <div className="shrink-0 border-t border-(--card-border) px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
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
