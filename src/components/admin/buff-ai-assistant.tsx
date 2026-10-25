'use client'

// Buff 集 AI 生成面板（工具箱式 UI）：活动流 + 实时生成情况 + 工具行 + 结果应用
//
// 数据侧与椰果工具箱的 AI 助手同口径：
// - 生成循环**没有工具调用上限**，唯一的刹车是「停止」按钮（AbortSignal 直通到底层请求）；
// - 每一轮 / 每次工具调用 / 每段流式正文都实时画在活动流上，而不是等结束才一次性刷新。
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { generateBuffSet, type GenerateEvent } from '@/lib/ai/generate'
import { AiClientError, type ChatMessage } from '@/lib/ai/client'
import {
    BUFF_REF_ZONES,
    BUFF_SCOPE_LABELS,
    BUFF_ZONE_MAP,
    describeCondition,
    describeZoneConditionBadge,
    sanitizeCondition,
    sanitizeZoneCondition
} from '@/lib/consts/buff-zones'
import { createClient } from '@/lib/supabase/client'
import { saveAiConfig } from '@/lib/ai/config'
import type { BuffDraftApi } from '@/lib/ai/tools'
import type { GeneratedBuff } from '@/lib/ai/types'
import type { BuffEntityType } from '@/lib/types/db'

// ── 活动流（渲染顺序 = 发生顺序）──────────────────────────────

interface ReasoningActivity {
    kind: 'reasoning'
    text: string
    chars: number
    expanded: boolean
}

interface ToolActivity {
    kind: 'tool'
    name: string
    args: Record<string, unknown>
    /** @desc 与 `tool-result` 事件配对的序号 */
    seq?: number
    resultLen?: number
    resultText?: string
    running: boolean
    expanded: boolean
}

interface OutputActivity {
    kind: 'output'
    /** @desc 只保留尾部若干字符（流式预览用；完整正文在 result.rawContent） */
    text: string
    chars: number
}

interface NoticeActivity {
    kind: 'notice'
    tone: 'info' | 'error'
    text: string
}

type Activity = ReasoningActivity | ToolActivity | OutputActivity | NoticeActivity

interface DisplayMsg {
    role: 'user' | 'assistant'
    text: string
    activities: Activity[]
}

/** @desc 流式正文只留尾部这么多字符，避免长 JSON 把 DOM 撑爆 */
const OUTPUT_TAIL_CHARS = 2200
/** @desc 工具结果展开预览的上限（工具结果本身可达数万字符） */
const TOOL_DETAIL_CHARS = 12_000

const TOOL_META: Record<string, { label: string; icon: string }> = {
    list_entities: { label: '实体表', icon: 'mdi:format-list-bulleted' },
    search_entities: { label: '搜索', icon: 'mdi:magnify' },
    get_entity_info: { label: '实体详情', icon: 'mdi:file-document-outline' },
    get_character_terms: { label: '术语', icon: 'mdi:book-open-variant' },
    get_buff_sets: { label: '已收录', icon: 'mdi:database-outline' },
    get_editing_context: { label: '当前实体', icon: 'mdi:cursor-default-outline' },
    diff_buffs: { label: '差异对比', icon: 'mdi:compare-horizontal' },
    get_zone: { label: '乘区', icon: 'mdi:view-grid-outline' },
    get_effects: { label: '效应表', icon: 'mdi:flash-outline' },
    get_scope_rules: { label: '作用域规则', icon: 'mdi:account-group-outline' },
    get_condition_rules: { label: '条件规则', icon: 'mdi:filter-outline' },
    get_ref_rules: { label: '转模规则', icon: 'mdi:swap-horizontal' },
    get_slang_dict: { label: '黑话词典', icon: 'mdi:translate' },
    get_naming_rules: { label: '命名规范', icon: 'mdi:tag-text-outline' },
    get_examples: { label: '示例', icon: 'mdi:format-quote-open-outline' },
    // 管理员编辑工具（直接改草稿 / 落库）
    rename_buff: { label: '改名', icon: 'mdi:rename-outline' },
    update_buff: { label: '改细节', icon: 'mdi:pencil-outline' },
    add_buff: { label: '新增', icon: 'mdi:plus-box-outline' },
    remove_buff: { label: '删除', icon: 'mdi:delete-outline' },
    save_buff_set: { label: '写入', icon: 'mdi:database-export-outline' }
}

/** @desc 会改动编辑中草稿的工具（据此判断本轮是否走了「直接编辑」而非整份 JSON） */
const DRAFT_TOOLS = new Set(['rename_buff', 'update_buff', 'add_buff', 'remove_buff', 'save_buff_set'])

/** @desc 工具行左侧的「类别 / 图标 / 一行摘要」：不展开也能看懂这次查了什么 */
function describeTool(name: string, args: Record<string, unknown>): { label: string; icon: string; summary: string } {
    const meta = TOOL_META[name] ?? { label: '工具', icon: 'mdi:toolbox-outline' }
    const first = Object.entries(args ?? {})
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)[0]
    return { ...meta, summary: first ?? name }
}

/** @desc 任意值 → 可读的多行文本（工具请求 / 响应的展开预览） */
function formatDetail(value: unknown): string {
    let text: string
    try {
        // 工具结果本身是 JSON 字符串：能解析就美化一层
        const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
        text = JSON.stringify(parsed, null, 2) ?? String(parsed)
    } catch {
        text = String(value ?? '')
    }
    return text.length > TOOL_DETAIL_CHARS ? `${text.slice(0, TOOL_DETAIL_CHARS)}\n…[已截断]` : text
}

/** @desc 结果卡片里每条 buff 的乘区摘要（与左侧列表同口径） */
function zoneSummary(b: GeneratedBuff): string {
    return (
        (b.zones ?? [])
            .map((z) => {
                const label = BUFF_ZONE_MAP.get(z.zoneId)?.label ?? z.zoneId
                const ref = z.ref
                    ? `引用${
                          BUFF_REF_ZONES.find((r) => r.id === z.ref!.targetZoneId)?.label ?? z.ref!.targetZoneId
                      }×${z.ref.pct}%`
                    : `${z.override ? '覆盖+' : '+'}${z.value}`
                const unit = !z.ref && BUFF_ZONE_MAP.get(z.zoneId)?.unit === '%' ? '%' : ''
                const cond = describeZoneConditionBadge(sanitizeZoneCondition(z.condition) ?? null)
                return `${label} ${ref}${unit}${cond ? `[${cond}]` : ''}`
            })
            .join(' · ') || '无乘区'
    )
}

const fmtCount = (value: number): string =>
    value >= 10_000 ? `${Math.round(value / 1000)}k` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)

const fmtDuration = (ms: number): string => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/**
 * @desc 已收录 Buff 集查询（`get_buff_sets` / `get_editing_context` / `diff_buffs` 的数据源）。
 *  与工具箱同口径：生成模型看不到数据库，只能通过工具按需查。
 */
async function queryBuffSets(queryType?: string, queryName?: string, query?: string) {
    const supabase = createClient()
    let q = supabase
        .from('buff_sets')
        .select('entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set')
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
    if (queryType) q = q.eq('entity_type', queryType)
    if (queryName) q = q.eq('entity_name', queryName)
    if (query) {
        const escaped = query.replace(/[%_\\]/g, '\\$&')
        q = q.or(`entity_name.ilike.%${escaped}%,buff_name.ilike.%${escaped}%`)
    }
    const { data, error } = await q.limit(200)
    if (error) return { error: error.message }
    return { total: (data ?? []).length, buffSets: data ?? [] }
}

interface Props {
    entityType: BuffEntityType
    entityName: string

    apiKey: string
    aiBaseUrl: string
    aiModel: string
    /** @desc 浏览器直连（不经站点 /api/ai/stream 转发）；缺省 false = 走站点代理 */
    aiDirect?: boolean
    systemPrompt: string
    initialTaskPrompt: string
    toolPrompts: Record<string, string>
    slangDict: string
    reasoningEffort?: 'off' | 'low' | 'medium' | 'high'

    /** @desc 跨实体共享会话（省 token / 命中缓存） */
    sessionSeed?: ChatMessage[]
    onSessionUpdate?: (messages: ChatMessage[]) => void
    sessionShareEnabled?: boolean

    /** @desc 当前编辑中的 Buff 集（「润色」用它构造请求） */
    getCurrentBuffs?: () => GeneratedBuff[]
    /** @desc AI 可读写的 Buff 草稿（改名 / 改细节 / 增删 / 直接落库） */
    draft?: BuffDraftApi
    /** @desc 结果应用：整体替换 / 追加合并 */
    onApply: (list: GeneratedBuff[]) => void
    onMerge: (list: GeneratedBuff[]) => void
}

/** @desc 待确认的危险工具（如「直接写入数据库」） */
interface ConfirmState {
    toolName: string
    message: string
    resolve: (ok: boolean) => void
}

export default function BuffAiAssistant({
    entityType,
    entityName,
    apiKey,
    aiBaseUrl,
    aiModel,
    aiDirect,
    systemPrompt,
    initialTaskPrompt,
    toolPrompts,
    slangDict,
    reasoningEffort,
    sessionSeed,
    onSessionUpdate,
    sessionShareEnabled,
    getCurrentBuffs,
    draft,
    onApply,
    onMerge
}: Props) {
    const [busy, setBusy] = useState(false)
    const [messages, setMessages] = useState<DisplayMsg[]>([])
    /** @desc 回传给模型的对话历史（不含本轮 system / 首轮任务指令） */
    const [history, setHistory] = useState<ChatMessage[]>([])
    const [followUp, setFollowUp] = useState('')

    /** @desc 实时状态行（第几轮 / 在调什么 / 流出了多少字） */
    const [liveStatus, setLiveStatus] = useState('')
    const [round, setRound] = useState(0)
    const [toolCalls, setToolCalls] = useState(0)
    const [elapsedMs, setElapsedMs] = useState(0)

    const [result, setResult] = useState<GeneratedBuff[] | null>(null)
    const [rawContent, setRawContent] = useState('')
    const [parseError, setParseError] = useState<string | null>(null)
    /** @desc 本轮是否用过草稿编辑工具（用了就不把「回复不是 JSON」当成失败） */
    const [draftTouched, setDraftTouched] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [debug, setDebug] = useState<string | null>(null)
    const [prompts, setPrompts] = useState<{ kind: 'system' | 'user' | 'history'; text: string }[]>([])
    const [showDebug, setShowDebug] = useState(false)

    /**
     * @desc 浏览器直连开关。
     *  初值取 AI 配置（面板由编辑器挂载，编辑期间外部不会改配置），切换即写回配置；
     *  刻意不需要 effect 同步 —— 配置弹窗与编辑器不会同时打开。
     */
    const [directMode, setDirectMode] = useState<boolean>(!!aiDirect)
    const toggleDirect = useCallback(() => {
        setDirectMode((prev) => {
            const next = !prev
            // 持久化失败不影响本次会话（IndexedDB 不可用时静默降级）
            void saveAiConfig({ direct: next }).catch(() => undefined)
            return next
        })
    }, [])

    /** @desc 危险工具确认卡（落库类操作不会静默写库） */
    const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
    const confirmRef = useRef<ConfirmState | null>(null)
    const settleConfirm = useCallback((ok: boolean) => {
        const card = confirmRef.current
        confirmRef.current = null
        setConfirmState(null)
        card?.resolve(ok)
    }, [])
    const requestConfirm = useCallback(
        (toolName: string, message: string) =>
            new Promise<boolean>((resolve) => {
                const card: ConfirmState = { toolName, message, resolve }
                confirmRef.current = card
                setConfirmState(card)
            }),
        []
    )

    const abortRef = useRef<AbortController | null>(null)
    const startedAtRef = useRef(0)
    /**
     * @desc 本轮的工具草稿**工作副本**。
     *
     * 为什么需要它：一轮里模型可能连着调多次改名 / 改细节 / 增删，每次都经 `draft.get()`
     * 读一次编辑器状态。若每次读的是 React state，后一次调用会看不到前一次刚写的改动
     * （同一轮里的多个工具调用会互相覆盖）。这里在回合开始时快照一次，回合内以工作副本为准，
     * 同时把每次改动同步回编辑器（`draft.set`），管理员眼前始终是最新草稿。
     */
    const workingDraftRef = useRef<GeneratedBuff[] | null>(null)
    /** @desc 一键润色：结果自动应用到列表，不停在「应用」按钮上 */
    const polishRef = useRef(false)
    /** @desc 自动滚动：用户向上翻阅时暂停 */
    const autoScrollRef = useRef(true)
    const bodyRef = useRef<HTMLDivElement>(null)

    // 计时器：只在生成中走动（与工具箱状态行同口径）
    useEffect(() => {
        if (!busy) return
        const timer = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200)
        return () => clearInterval(timer)
    }, [busy])

    // 新内容 → 回到底部（用户主动上滚时不打扰）
    useEffect(() => {
        const el = bodyRef.current
        if (!el || !autoScrollRef.current) return
        el.scrollTop = el.scrollHeight
    }, [messages, liveStatus, result])

    const onBodyScroll = () => {
        const el = bodyRef.current
        if (!el) return
        autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 24
    }

    /** @desc 更新最后一条 assistant 消息的活动流（流式事件走这里） */
    const patchLastActivities = useCallback((patch: (activities: Activity[]) => Activity[]) => {
        setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            return [...prev.slice(0, -1), { ...last, activities: patch(last.activities) }]
        })
    }, [])

    /** @desc 更新指定消息的活动流（展开 / 收起思考与工具行时用，历史消息也要能点开） */
    const patchActivitiesAt = useCallback((index: number, patch: (activities: Activity[]) => Activity[]) => {
        setMessages((prev) => prev.map((m, idx) => (idx === index ? { ...m, activities: patch(m.activities) } : m)))
    }, [])

    /** @desc 生成事件 → 活动流（实时） */
    const handleEvent = useCallback(
        (evt: GenerateEvent) => {
            switch (evt.type) {
                case 'status':
                    if (evt.text) setLiveStatus(evt.text)
                    if (evt.round) setRound(evt.round)
                    if (typeof evt.toolCalls === 'number') setToolCalls(evt.toolCalls)
                    break
                case 'prompt':
                    setPrompts((prev) => [...prev, { kind: evt.promptKind ?? 'user', text: evt.text ?? '' }])
                    break
                case 'content':
                    if (evt.round) setRound(evt.round)
                    if (evt.contentChars !== undefined) {
                        setLiveStatus(
                            `第 ${evt.round ?? 1} 轮 · 输出 ${fmtCount(evt.contentChars)} 字${
                                evt.reasoningChars ? ` · 思考 ${fmtCount(evt.reasoningChars)} 字` : ''
                            }`
                        )
                    }
                    patchLastActivities((acts) => {
                        const last = acts[acts.length - 1]
                        if (last && last.kind === 'output') {
                            const merged = last.text + (evt.delta ?? '')
                            return [
                                ...acts.slice(0, -1),
                                {
                                    ...last,
                                    text: merged.length > OUTPUT_TAIL_CHARS ? merged.slice(-OUTPUT_TAIL_CHARS) : merged,
                                    chars: last.chars + (evt.delta?.length ?? 0)
                                }
                            ]
                        }
                        return [
                            ...acts,
                            {
                                kind: 'output',
                                text: (evt.delta ?? '').slice(-OUTPUT_TAIL_CHARS),
                                chars: evt.delta?.length ?? 0
                            }
                        ]
                    })
                    break
                case 'reasoning':
                    if (evt.round) setRound(evt.round)
                    patchLastActivities((acts) => {
                        const last = acts[acts.length - 1]
                        if (last && last.kind === 'reasoning') {
                            return [
                                ...acts.slice(0, -1),
                                {
                                    ...last,
                                    text: last.text + (evt.delta ?? ''),
                                    chars: last.chars + (evt.delta?.length ?? 0)
                                }
                            ]
                        }
                        return [
                            ...acts,
                            {
                                kind: 'reasoning',
                                text: evt.delta ?? '',
                                chars: evt.delta?.length ?? 0,
                                expanded: false
                            }
                        ]
                    })
                    break
                case 'tool':
                    if (evt.round) setRound(evt.round)
                    if (typeof evt.toolCalls === 'number') setToolCalls(evt.toolCalls)
                    if (evt.text) setLiveStatus(evt.text)
                    if (evt.toolName && DRAFT_TOOLS.has(evt.toolName)) setDraftTouched(true)
                    patchLastActivities((acts) => [
                        ...acts,
                        {
                            kind: 'tool',
                            name: evt.toolName ?? 'tool',
                            args: evt.toolArgs ?? {},
                            seq: evt.seq,
                            running: true,
                            expanded: false
                        }
                    ])
                    break
                case 'tool-result':
                    if (evt.text) setLiveStatus(evt.text)
                    patchLastActivities((acts) =>
                        acts.map((act) =>
                            act.kind === 'tool' && act.running && (evt.seq === undefined || act.seq === evt.seq)
                                ? {
                                      ...act,
                                      running: false,
                                      resultLen: evt.resultText?.length ?? act.resultLen,
                                      resultText: evt.resultText
                                  }
                                : act
                        )
                    )
                    break
                case 'error':
                    if (evt.text) setError(evt.text)
                    break
                case 'result':
                    setRawContent(evt.rawContent ?? '')
                    setParseError(evt.parseError ?? null)
                    setResult(Array.isArray(evt.data) ? (evt.data as GeneratedBuff[]) : null)
                    if (evt.parseError) setLiveStatus(`解析失败：${evt.parseError}`)
                    else if (evt.buffCount) setLiveStatus(`解析成功：${evt.buffCount} 条 Buff`)
                    break
            }
        },
        [patchLastActivities]
    )

    /** @desc 发起一次生成（首轮 / 润色 / 追问共用） */
    const runRequest = useCallback(
        async (userMessage: string, nextHistory: ChatMessage[], autoApply = false) => {
            if (!apiKey.trim()) {
                setError('请先在侧栏填入 AI API Key')
                return
            }
            if (!entityName.trim()) {
                setError('请先选择实体名')
                return
            }
            polishRef.current = autoApply
            setBusy(true)
            setError(null)
            setDebug(null)
            setResult(null)
            setRawContent('')
            setParseError(null)
            setDraftTouched(false)
            setPrompts([])
            setShowDebug(false)
            setRound(0)
            setToolCalls(0)
            setElapsedMs(0)
            setLiveStatus('正在准备…')
            startedAtRef.current = Date.now()
            autoScrollRef.current = true
            // 新回合：草稿工作副本重新从编辑器读取（回合内的多次工具调用共用它）
            workingDraftRef.current = null
            const controller = new AbortController()
            abortRef.current = controller
            setMessages((prev) => [
                ...prev,
                ...(userMessage ? [{ role: 'user' as const, text: userMessage, activities: [] }] : []),
                { role: 'assistant', text: '', activities: [] }
            ])

            try {
                // 草稿接口：回合内以工作副本为准，写入同步回编辑器
                const draftApi: BuffDraftApi | undefined = draft
                    ? {
                          get: () => {
                              if (!workingDraftRef.current) workingDraftRef.current = draft.get()
                              return workingDraftRef.current
                          },
                          set: (list) => {
                              workingDraftRef.current = list
                              draft.set(list)
                          },
                          save: () => draft.save(workingDraftRef.current ?? undefined)
                      }
                    : undefined
                await generateBuffSet({
                    apiKey: apiKey.trim(),
                    entityType,
                    entityName: entityName.trim(),
                    baseUrl: aiBaseUrl.trim() || undefined,
                    model: aiModel.trim() || undefined,
                    systemPrompt,
                    initialTaskPrompt,
                    toolPrompts,
                    slangDict,
                    reasoningEffort,
                    history: nextHistory,
                    newUserMessage: userMessage,
                    getBuffSets: queryBuffSets,
                    draft: draftApi,
                    onConfirm: requestConfirm,
                    seedMessages: sessionShareEnabled ? sessionSeed : undefined,
                    onMessages: sessionShareEnabled ? onSessionUpdate : undefined,
                    direct: directMode,
                    signal: controller.signal,
                    onEvent: handleEvent
                })
            } catch (e) {
                if (e instanceof AiClientError) {
                    // 主动停止不算失败：只留一行提示
                    if (e.debug === 'aborted') {
                        setLiveStatus('已停止生成')
                    } else {
                        setError(e.message)
                        setDebug(e.debug)
                    }
                } else {
                    setError(e instanceof Error ? e.message : '生成失败')
                }
            } finally {
                // 回合结束（正常 / 停止 / 报错）：挂着的确认卡一律按「拒绝」收尾，避免 Promise 永久悬挂
                if (confirmRef.current) settleConfirm(false)
                setBusy(false)
                abortRef.current = null
                polishRef.current = false
            }
        },
        [
            apiKey,
            entityName,
            entityType,
            aiBaseUrl,
            aiModel,
            systemPrompt,
            initialTaskPrompt,
            toolPrompts,
            slangDict,
            reasoningEffort,
            sessionShareEnabled,
            sessionSeed,
            onSessionUpdate,
            draft,
            requestConfirm,
            settleConfirm,
            directMode,
            handleEvent
        ]
    )

    /** @desc 一键生成：清空对话从头生成 */
    function onGenerate() {
        setHistory([])
        setMessages([])
        void runRequest('', [])
    }

    /** @desc 一键润色：只重写 buffName，数值 / 乘区 / 条件原样保留 */
    function onPolish() {
        const current = getCurrentBuffs?.() ?? []
        if (current.length === 0) {
            setError('当前没有 Buff 可润色')
            return
        }
        const msg = `请按命名规范润色以下 Buff 集内每个 buff 的 buffName（格式：[条件]<触发,附加条件>乘区1+乘区2+…+层数；条件标注归属者与所需链/阶，仅叠层>1 时带 N 层，单层不带）。\n要求：保留每个 buff 的 zones/scope/condition/exclusive 完全不变，只重写 buffName；不要增删乘区、不要改数值或条件；不确定规范时调用 get_naming_rules。\n输出完整 buffs JSON。\n\n当前 Buff 集：\n${JSON.stringify(current)}`
        setHistory([])
        setMessages([])
        void runRequest(msg, [], true)
    }

    /** @desc 追问：把上一条 AI 输出记进历史，再带上新指令 */
    function onFollowUp() {
        const msg = followUp.trim()
        if (!msg || busy) return
        // 把上一条 AI 的原始输出（完整 JSON 优先）记成 assistant 轮，追问才有上下文
        const assistantTurn = rawContent.trim() || (result ? JSON.stringify({ buffs: result }) : '')
        const nextHistory: ChatMessage[] = assistantTurn
            ? [...history, { role: 'assistant', content: assistantTurn }]
            : [...history]
        setHistory(nextHistory)
        setFollowUp('')
        void runRequest(msg, nextHistory)
    }

    function stop() {
        abortRef.current?.abort()
    }

    function reset() {
        if (busy) return
        setMessages([])
        setHistory([])
        setResult(null)
        setRawContent('')
        setParseError(null)
        setError(null)
        setDebug(null)
        setPrompts([])
        setLiveStatus('')
        setRound(0)
        setToolCalls(0)
    }

    /** @desc 应用结果：整体替换 / 追加合并，并把这次输出记进历史（供后续追问） */
    function applyResult(mode: 'replace' | 'merge') {
        if (!result) return
        setHistory((prev) => [
            ...prev,
            { role: 'assistant', content: rawContent || JSON.stringify({ buffs: result }) }
        ])
        if (mode === 'replace') onApply(result)
        else onMerge(result)
        setLiveStatus(mode === 'replace' ? `已应用 ${result.length} 条 Buff` : `已追加 ${result.length} 条 Buff`)
        setResult(null)
    }

    // 润色结果自动应用（不停在按钮上）
    useEffect(() => {
        if (!result || busy || !polishRef.current) return
        onApply(result)
        setHistory((prev) => [...prev, { role: 'assistant', content: rawContent || JSON.stringify({ buffs: result }) }])
        setLiveStatus(`润色完成，已应用 ${result.length} 条`)
        setResult(null)
    }, [result, busy, rawContent, onApply])

    const hasContent = messages.length > 0 || Boolean(result) || Boolean(error)

    return (
        <div className="buff-editor-ai flex h-full min-h-0 w-96 shrink-0 flex-col border-l border-(--card-border)">
            {/* 头部：标题 + 动作（生成 / 润色 / 停止 / 清空） */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-(--card-border) px-3 py-2">
                <span className="flex items-center gap-1 mg-title text-xs text-(--accent-text)">
                    <Icon icon="mdi:robot-outline" className="size-4" />
                    AI 生成
                </span>
                <button
                    onClick={onGenerate}
                    disabled={busy || !entityName.trim()}
                    className="toolbar-btn toolbar-btn-primary px-2 py-1 text-[11px]"
                >
                    <Icon
                        icon={busy ? 'mdi:loading' : 'mdi:auto-fix'}
                        className={busy ? 'size-3.5 animate-spin' : 'size-3.5'}
                    />
                    {busy ? '生成中…' : '一键生成'}
                </button>
                <button
                    onClick={onPolish}
                    disabled={busy || !entityName.trim()}
                    title="按命名规范润色当前 Buff 集的 buff 名（保留乘区 / 数值 / 条件不变）"
                    className="toolbar-btn toolbar-btn-ghost px-2 py-1 text-[11px]"
                >
                    <Icon icon="mdi:brush-variant" className="size-3.5" />
                    润色
                </button>
                {busy ? (
                    <button
                        onClick={stop}
                        className="toolbar-btn toolbar-btn-ghost px-2 py-1 text-[11px] text-(--danger)"
                        title="停止生成（立即断开请求）"
                    >
                        <Icon icon="mdi:stop" className="size-3.5" />
                        停止
                    </button>
                ) : (
                    hasContent && (
                        <button
                            onClick={reset}
                            className="rounded-sm p-1 text-(--muted) transition-colors hover:text-(--danger)"
                            title="清空对话"
                        >
                            <Icon icon="mdi:restart" className="size-3.5" />
                        </button>
                    )
                )}
                {/* 浏览器直连开关：直连不经站点转发（多一跳 / 平台限制），与工具箱同款 */}
                <button
                    onClick={toggleDirect}
                    className={`ml-auto flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] transition-colors ${
                        directMode
                            ? 'border-(--accent) text-(--accent-text)'
                            : 'border-(--card-border) text-(--muted) hover:text-(--fg)'
                    }`}
                    title={
                        directMode
                            ? '当前为浏览器直连（端点必须自己允许 CORS）。点击改为经站点转发'
                            : '当前经站点 /api/ai/stream 转发。点击改为浏览器直连（需端点允许 CORS）'
                    }
                >
                    <Icon icon={directMode ? 'mdi:flash' : 'mdi:cloud-outline'} className="size-3" />
                    {directMode ? '直连' : '代理'}
                </button>
            </div>

            {/* 活动流 */}
            <div
                ref={bodyRef}
                onScroll={onBodyScroll}
                className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed"
            >
                {!hasContent && !busy && (
                    <div className="py-10 text-center mg-note">
                        点「一键生成」，AI 会自己查实体数据、
                        <br />
                        多轮核对后输出 Buff 集 JSON。
                        <br />
                        生成过程实时可见，不限工具调用轮数。
                    </div>
                )}

                {messages.map((m, i) =>
                    m.role === 'user' ? (
                        <div key={i} className="flex justify-end">
                            <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-sm bg-(--accent) px-2.5 py-1.5 text-xs text-(--accent-fg)">
                                {m.text}
                            </div>
                        </div>
                    ) : (
                        <div key={i} className="flex flex-col gap-1">
                            {m.activities.length === 0 && busy && i === messages.length - 1 && (
                                <div className="flex items-center gap-1.5 text-(--muted)">
                                    <Icon icon="mdi:lightbulb-on-outline" className="size-3 shrink-0" />
                                    <span className="font-medium">思考</span>
                                    <span className="opacity-40">·</span>
                                    <span>等待模型响应…</span>
                                </div>
                            )}
                            {m.activities.map((act, j) => {
                                if (act.kind === 'reasoning') {
                                    return (
                                        <div key={j} className="flex items-start gap-1.5 text-(--muted)">
                                            <Icon icon="mdi:lightbulb-on-outline" className="mt-0.5 size-3 shrink-0" />
                                            <span className="shrink-0 font-medium">思考</span>
                                            <span className="shrink-0 opacity-40">·</span>
                                            <button
                                                onClick={() => {
                                                    const next = !act.expanded
                                                    patchActivitiesAt(i, (acts) =>
                                                        acts.map((a, k) =>
                                                            k === j && a.kind === 'reasoning'
                                                                ? { ...a, expanded: next }
                                                                : a
                                                        )
                                                    )
                                                }}
                                                className="min-w-0 flex-1 text-left transition-colors hover:text-(--fg)"
                                                title={act.expanded ? '收起思考' : '展开思考'}
                                            >
                                                <span
                                                    className={
                                                        act.expanded
                                                            ? 'whitespace-pre-wrap'
                                                            : 'line-clamp-2 whitespace-pre-wrap'
                                                    }
                                                >
                                                    {act.text}
                                                </span>
                                            </button>
                                            <span className="shrink-0 text-[10px] opacity-50">
                                                {fmtCount(act.chars)} 字
                                            </span>
                                        </div>
                                    )
                                }
                                if (act.kind === 'tool') {
                                    const meta = describeTool(act.name, act.args)
                                    return (
                                        <div key={j} className="text-(--muted)">
                                            <button
                                                onClick={() =>
                                                    patchActivitiesAt(i, (acts) =>
                                                        acts.map((a, k) =>
                                                            k === j && a.kind === 'tool'
                                                                ? { ...a, expanded: !a.expanded }
                                                                : a
                                                        )
                                                    )
                                                }
                                                className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-(--card-hover)"
                                                title={act.expanded ? '收起请求 / 响应' : '展开请求 / 响应'}
                                            >
                                                <Icon icon={meta.icon} className="size-3 shrink-0" />
                                                <span className="shrink-0 font-medium">{meta.label}</span>
                                                <span className="shrink-0 opacity-40">·</span>
                                                <span className="min-w-0 flex-1 truncate opacity-80">
                                                    {meta.summary}
                                                </span>
                                                {act.running ? (
                                                    <span className="shrink-0 text-(--info)">执行中…</span>
                                                ) : (
                                                    <span className="shrink-0 text-[10px] opacity-50">
                                                        {act.resultLen ?? 0} 字符
                                                    </span>
                                                )}
                                                <Icon
                                                    icon={act.expanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                                                    className="size-3 shrink-0 opacity-50"
                                                />
                                            </button>
                                            {act.expanded && (
                                                <div className="ml-4 mt-0.5 space-y-1 border-l border-(--card-border) pb-1 pl-2">
                                                    <div>
                                                        <div className="mb-0.5 text-[10px] text-(--muted)">请求参数</div>
                                                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-(--code-bg) p-1.5 font-mono text-[10px] leading-relaxed">
                                                            {formatDetail(act.args)}
                                                        </pre>
                                                    </div>
                                                    {act.resultText !== undefined && (
                                                        <div>
                                                            <div className="mb-0.5 text-[10px] text-(--muted)">
                                                                响应结果
                                                            </div>
                                                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-(--code-bg) p-1.5 font-mono text-[10px] leading-relaxed">
                                                                {formatDetail(act.resultText)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                }
                                if (act.kind === 'notice') {
                                    return (
                                        <div
                                            key={j}
                                            className={`flex items-start gap-1.5 ${
                                                act.tone === 'error' ? 'text-(--danger)' : 'text-(--muted)'
                                            }`}
                                        >
                                            <Icon
                                                icon={
                                                    act.tone === 'error'
                                                        ? 'mdi:alert-circle-outline'
                                                        : 'mdi:information-outline'
                                                }
                                                className="mt-0.5 size-3 shrink-0"
                                            />
                                            <span className="min-w-0 flex-1 whitespace-pre-wrap">{act.text}</span>
                                        </div>
                                    )
                                }
                                // 流式输出尾巴：生成过程中实时滚动（这就是「实时展示生成情况」）
                                return (
                                    <div key={j} className="rounded-sm bg-(--code-bg) p-1.5">
                                        <div className="mb-0.5 flex items-center gap-1 text-[10px] text-(--muted)">
                                            <Icon icon="mdi:code-json" className="size-3" />
                                            输出
                                            <span className="mg-num text-(--fg)">{fmtCount(act.chars)}</span> 字
                                            {busy && <span className="animate-pulse">▍</span>}
                                        </div>
                                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-(--fg)">
                                            {act.text}
                                        </pre>
                                    </div>
                                )
                            })}
                        </div>
                    )
                )}

                {/* 结果卡片：应用 / 追加 */}
                {result !== null && result.length > 0 && (
                    <div className="space-y-1.5 rounded-sm border border-(--card-border) bg-(--card) p-2">
                        <div className="text-[10px] text-(--muted)">
                            共 <span className="mg-num text-(--fg)">{result.length}</span> 条 · 「应用」整体替换当前列表，
                            「追加」同名覆盖
                        </div>
                        {result.map((b, i) => {
                            const cond = sanitizeCondition(b.condition, 'buff')
                            const condText = cond ? describeCondition(cond) : ''
                            return (
                                <div key={i} className="rounded-sm bg-(--card-hover) px-2 py-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-(--fg)">
                                            {b.buffName}
                                        </span>
                                        <span className="rounded-sm bg-(--accent) px-1 py-0.5 text-[9px] text-(--accent-fg)">
                                            {BUFF_SCOPE_LABELS[b.scope ?? 'team']}
                                        </span>
                                        {b.exclusive && (
                                            <span className="rounded-sm border border-(--warning) px-1 py-0.5 text-[9px] text-(--warning)">
                                                效应专属
                                            </span>
                                        )}
                                        {condText && condText !== '无条件' && (
                                            <span className="rounded-sm border border-(--card-border) px-1 py-0.5 text-[9px] text-(--muted)">
                                                {condText}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 truncate text-[10px] text-(--muted)">{zoneSummary(b)}</div>
                                </div>
                            )
                        })}
                        <div className="flex gap-1.5 pt-0.5">
                            <button
                                onClick={() => applyResult('replace')}
                                className="toolbar-btn toolbar-btn-primary flex-1 justify-center"
                            >
                                <Icon icon="mdi:content-save-outline" className="size-3.5" />
                                应用（<span className="mg-num">{result.length}</span>）
                            </button>
                            <button
                                onClick={() => applyResult('merge')}
                                className="toolbar-btn toolbar-btn-ghost flex-1 justify-center"
                            >
                                <Icon icon="mdi:plus-box-outline" className="size-3.5" />
                                追加（<span className="mg-num">{result.length}</span>）
                            </button>
                        </div>
                    </div>
                )}

                {/* 解析失败 / 错误 / 调试 */}
                {!busy && parseError && !draftTouched && (
                    <div className="text-[11px] text-(--warning)">
                        AI 回复不是可解析的 Buff JSON（{parseError}），已作为文本显示，可追问修正。
                    </div>
                )}
                {error && (
                    <div className="flex items-start gap-1.5 text-[11px] text-(--danger)">
                        <Icon icon="mdi:alert-circle-outline" className="mt-0.5 size-3 shrink-0" />
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">{error}</span>
                    </div>
                )}
                {(prompts.length > 0 || rawContent || debug) && (
                    <div className="pt-0.5">
                        <button
                            onClick={() => setShowDebug((v) => !v)}
                            className="flex items-center gap-1 text-[10px] text-(--muted) transition-colors hover:text-(--fg)"
                        >
                            <Icon icon={showDebug ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="size-3" />
                            调试（提示词 {prompts.length} 段
                            {rawContent ? ` · 原始输出 ${rawContent.length} 字符` : ''}）
                        </button>
                        {showDebug && (
                            <div className="mt-1 space-y-1">
                                {debug && (
                                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-(--code-bg-strong) p-1.5 font-mono text-[10px] leading-relaxed text-(--danger)">
                                        {debug}
                                    </pre>
                                )}
                                {rawContent && (
                                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-(--code-bg) p-1.5 font-mono text-[10px] leading-relaxed text-(--fg)">
                                        {rawContent}
                                    </pre>
                                )}
                                {prompts.map((p, i) => (
                                    <pre
                                        key={i}
                                        className={`max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-(--code-bg) p-1.5 font-mono text-[10px] leading-relaxed ${
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
            </div>

            {/* 危险操作确认（落库类工具）：确认前回合一直阻塞在这里 */}
            {confirmState && (
                <div className="shrink-0 border-t border-(--card-border) px-3 py-2">
                    <div className="flex items-start gap-2">
                        <Icon icon="mdi:alert-outline" className="mt-px size-4 shrink-0 text-(--danger)" />
                        <div className="min-w-0 flex-1 leading-tight">
                            <div className="text-xs font-medium text-(--fg)">
                                确认执行「{confirmState.toolName}」
                            </div>
                            <div className="mt-0.5 break-words text-[10px] text-(--muted)">
                                {confirmState.message}
                            </div>
                        </div>
                    </div>
                    <div className="mt-2 flex justify-end gap-1.5">
                        <button
                            onClick={() => settleConfirm(false)}
                            className="toolbar-btn toolbar-btn-ghost px-2.5 py-1 text-[10px]"
                        >
                            拒绝
                        </button>
                        <button
                            onClick={() => settleConfirm(true)}
                            className="rounded-sm bg-(--danger) px-2.5 py-1 text-[10px] font-medium text-(--danger-fg) transition-all hover:brightness-110"
                        >
                            允许执行
                        </button>
                    </div>
                </div>
            )}

            {/* 实时状态行（对齐工具箱状态条：一句话 + 轮次 / 工具数 + 耗时） */}
            <div className="flex shrink-0 items-center gap-1.5 border-t border-(--card-border) px-3 py-1.5 text-[10px] tabular-nums">
                <span
                    className="inline-block size-1.5 shrink-0 rounded-full"
                    style={{ background: 'var(--accent)', opacity: busy ? 1 : 0.3 }}
                />
                <span className="min-w-0 flex-1 truncate text-(--muted)" title={liveStatus}>
                    {liveStatus || '空闲'}
                </span>
                {(round > 0 || toolCalls > 0) && (
                    <span className="shrink-0 text-(--muted) opacity-70">
                        {round > 0 ? `第 ${round} 轮` : ''}
                        {round > 0 && toolCalls > 0 ? ' · ' : ''}
                        {toolCalls > 0 ? `${toolCalls} 次工具` : ''}
                    </span>
                )}
                {busy && <span className="shrink-0 text-(--muted) opacity-70">{fmtDuration(elapsedMs)}</span>}
            </div>

            {/* 追问输入行 */}
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
                    disabled={busy}
                    placeholder="追问，或直接提需求…"
                    className="min-w-0 flex-1 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-xs outline-none focus:border-(--accent) disabled:opacity-50"
                />
                <button
                    onClick={onFollowUp}
                    disabled={busy || !followUp.trim()}
                    className="toolbar-btn toolbar-btn-ghost shrink-0 px-2.5 py-1.5"
                    title="发送追问"
                >
                    <Icon
                        icon={busy ? 'mdi:loading' : 'mdi:send'}
                        className={busy ? 'size-3.5 animate-spin' : 'size-3.5'}
                    />
                </button>
            </div>
        </div>
    )
}
