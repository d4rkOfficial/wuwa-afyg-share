'use client'

// AI 控制台（/agent/admin 与 /agent/user 共用）。DSH 风格：中性灰面、紧凑密度、无衬线 + 等宽代码，
// 铺满标题栏以下的整块区域（固定定位，见 globals.css 的 .agent-shell）。
//
// 三个关键点：
// 1. **流式输出按增量合并**：模型的 content 是一个字一个字回来的，必须把相邻文本 delta
//    合并成同一个文本块（reasoning 同理），否则界面会「一个字一行」。
// 2. **任务即会话**：每次状态变化整份写 IndexedDB；刷新/关浏览器回来还能继续。
// 3. **全程人工审批**：写操作在工具内部 await 这里的审批卡（带 diff + 拒绝理由）。
import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { AiClientError, chatCompletionStream, type ChatMessage } from '@/lib/ai/client'
import { loadAiConfig, saveAiConfig, DEFAULT_AI_CONFIG, type AiConfig } from '@/lib/ai/config'
import { BUFF_TOOLS, executeBuffTool } from '@/lib/agent/tools/buff'
import { INTERACTION_TOOLS, executeInteractionTool, type AskUserRequest } from '@/lib/agent/tools/interaction'
import { SUBSTAT_TOOLS, SUBSTAT_TOOL_NAMES, executeSubstatTool } from '@/lib/agent/tools/substat'
import { PROJECT_TOOLS, PROJECT_TOOL_NAMES, executeProjectTool } from '@/lib/agent/tools/project'
import {
    CONTEXT_BUDGET,
    estimateMessagesTokens,
    estimateTokens,
    formatTokens,
    shouldAutoCompress
} from '@/lib/agent/tokens'
import { buildAgentSystemPrompt } from '@/lib/agent/prompt'
import { runAgent } from '@/lib/agent/run'
import { deleteTask, listTasks, normalizeRestoredTask, putTask } from '@/lib/agent/db'
import Markdown from '@/components/agent/markdown'
import { loadPromptSettings, savePromptSettings, type PromptSettings } from '@/lib/agent/prompt-store'
import { wkToast } from '@/design'
import type { EditLocksSnapshot } from '@/lib/edit-locks.shared'
import type { AgentActivity, AgentRole, AgentTask, ApprovalDecision, ApprovalRequest, TaskStatus } from '@/lib/agent/types'

interface Props {
    role: AgentRole
    locks: EditLocksSnapshot
    /** @desc 当前登录用户 id（工程域用它判定「自己的工程」） */
    userId: string | null
}

const STATUS_LABEL: Record<TaskStatus, string> = {
    idle: '待开始',
    running: '进行中',
    'waiting-approval': '等待审批',
    done: '已完成',
    error: '出错',
    interrupted: '已中断'
}

const newId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `t${Date.now()}${Math.random()}`

/**
 * @desc 默认只渲染最近 N 条过程记录。
 * 长任务会累积几百张工具卡（每张都可能带大段 JSON），全量渲染既慢又没法看出"现在进行到哪"；
 * 更早的部分按需展开，索引仍沿用原始下标，折叠状态不会因为窗口滑动而错位。
 */
const ACTIVITY_WINDOW = 30

/**
 * @desc 会话列表左侧的状态圆标：
 *  - running（黄）：正在跑；
 *  - attention（红）：有未处理的审批 / 没人回答的提问，或上次跑挂了；
 *  - done（绿）：已完成；
 *  - idle（灰）：还没开始 / 被打断，留个灰点保证每行左缘对齐。
 */
function taskDot(task: AgentTask, isRunning: boolean): { tone: 'running' | 'attention' | 'done' | 'idle'; label: string } {
    if (isRunning) return { tone: 'running', label: '运行中' }
    if (task.pendingApproval) return { tone: 'attention', label: '等待审批' }
    if (task.activities.some((activity) => activity.kind === 'ask' && !activity.answer)) {
        return { tone: 'attention', label: '等待回答' }
    }
    if (task.status === 'error') return { tone: 'attention', label: '上次运行出错' }
    if (task.status === 'done') return { tone: 'done', label: '已完成' }
    return { tone: 'idle', label: STATUS_LABEL[task.status] }
}

/** @desc 把一段增量并入活动流：相邻同类型文本合并，避免「一个字一行」 */
function appendActivity(activities: AgentActivity[], next: AgentActivity): AgentActivity[] {
    const last = activities[activities.length - 1]
    if (next.kind === 'text' && last?.kind === 'text') {
        return [...activities.slice(0, -1), { kind: 'text', text: last.text + next.text }]
    }
    if (next.kind === 'reasoning' && last?.kind === 'reasoning') {
        return [...activities.slice(0, -1), { kind: 'reasoning', text: last.text + next.text }]
    }
    // 连续状态行只保留最后一条（「第 N 轮请求…」刷屏没意义）
    if (next.kind === 'status' && last?.kind === 'status') {
        return [...activities.slice(0, -1), next]
    }
    return [...activities, next]
}

export default function AgentConsole({ role, locks, userId }: Props) {
    const [tasks, setTasks] = useState<AgentTask[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [input, setInput] = useState('')
    /**
     * @desc 正在跑的任务 id 集合（可以同时有多个）。
     * 之前是一个全局 `running` 布尔：一个会话在跑，切到另一个空闲会话就发不出消息（send 直接 return）。
     * 会话是彼此独立的，运行态必须按任务记；UI 只关心「当前打开的那个跑没跑」。
     */
    const [runningIds, setRunningIds] = useState<string[]>([])
    const [ai, setAi] = useState<AiConfig>({ ...DEFAULT_AI_CONFIG })
    const [showConfig, setShowConfig] = useState(false)
    // 折叠的是「过程」卡；默认全展开（用户点过才折叠）
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
    // 默认只渲染最近 N 条过程（长任务几百条卡会把整页拖慢，也看不清当前进度）；「显示更早」再补。
    // 用「记着是哪个任务展开的」代替切换时的 setState：换任务自动收回，不需要 effect。
    const [showAllForId, setShowAllForId] = useState<string | null>(null)
    const showAllActivities = !!activeId && showAllForId === activeId
    const [prompts, setPrompts] = useState<PromptSettings>({ extra: '' })
    /** @desc 每个任务各自的取消器：停 A 不会连带停 B */
    const abortMapRef = useRef<Record<string, AbortController>>({})
    /**
     * @desc 待决的审批 / 提问，按任务 id 存档：
     * 多条会话可以同时各挂着一张待批卡，回答必须落回发起它的那个任务。
     */
    const approvalRef = useRef<Record<string, (d: ApprovalDecision) => void>>({})
    const askRef = useRef<Record<string, (answer: string | null) => void>>({})
    const [compressing, setCompressing] = useState(false)
    /**
     * @desc 两个独立的免打扰权限（都存本机，互不依赖）：
     * - `autoApprove` 自动批准：写操作的审批自动通过（审批卡照旧记录，过程可见）。
     * - `autoAnswer` 自动应答：所有**询问**类交互都不再弹窗等回复——
     *   ask_user 的工具提问，以及其它需要用户「询问 / 同意」的交互（目前实现为提问卡）。
     *   注意：它**不负责批准写操作**（那是 autoApprove 的职责），两者都开 = 完全免打扰。
     * 权限与锁的判定都不受影响（不该写的照样被拒）。
     */
    const [autoApprove, setAutoApprove] = useState(false)
    const [autoAnswer, setAutoAnswer] = useState(false)
    /**
     * @desc 权威数据：所有写入一律「按任务 id 找任务」。
     * 之前用单个 `taskRef` 指向"当前任务"，而它会被「切换会话」的 effect 改写；
     * 流式回调是异步的（rAF 里跑），用户切会话/新建任务后就会把 delta 写进另一个会话 —— 跨会话串流。
     * 现在没有任何"当前任务指针"：流式链路在开始时捕获自己的 taskId，之后只认 id。
     */
    const tasksRef = useRef<AgentTask[]>([])
    const threadRef = useRef<HTMLDivElement>(null)
    /** @desc 是否跟随底部（用户上翻后置 false） */
    const pinnedRef = useRef(true)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    /** @desc 流式输出节流：delta 可能每秒上百次，渲染与落盘都必须合并 */
    const rafRef = useRef<number | null>(null)
    const idbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const renderedRef = useRef<AgentTask | null>(null)
    /** @desc 等待落盘的任务（按 id 去重）：两个会话同时产出时不能互相覆盖 */
    const dirtyRef = useRef<Map<string, AgentTask>>(new Map())

    const active = tasks.find((t) => t.id === activeId) ?? null

    useEffect(() => {
        void (async () => {
            try {
                const loaded = (await listTasks()).map(normalizeRestoredTask)
                tasksRef.current = loaded
                setTasks(loaded)
                setActiveId((prev) => prev ?? loaded[0]?.id ?? null)
            } catch {
                /* IndexedDB 不可用时退化为纯内存会话 */
            }
            setAi({ ...(await loadAiConfig()) })
            try {
                setAutoApprove(window.localStorage.getItem('wuwa-afyg:agent-auto-approve') === '1')
                setAutoAnswer(window.localStorage.getItem('wuwa-afyg:agent-auto-answer') === '1')
            } catch {
                /* 读不到就算了 */
            }
            setPrompts(loadPromptSettings())
        })()
    }, [])

    /**
     * @desc 自动贴底：流式输出时内容高度一直在涨（活动条数却不变），
     * 所以用 ResizeObserver 盯住内容高度；用户主动上翻后暂停自动跟随，回到底部再恢复。
     */
    useEffect(() => {
        const el = threadRef.current
        if (!el) return
        const inner = el.firstElementChild
        const onScroll = () => {
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }
        el.addEventListener('scroll', onScroll, { passive: true })
        const ro = new ResizeObserver(() => {
            if (pinnedRef.current) el.scrollTop = el.scrollHeight
        })
        if (inner) ro.observe(inner)
        return () => {
            el.removeEventListener('scroll', onScroll)
            ro.disconnect()
        }
    }, [])

    // 状态变化（新工具卡 / 审批卡）时也贴底
    useEffect(() => {
        const el = threadRef.current
        if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
    }, [active?.activities.length, active?.status])

    // 输入框随内容长高（最多 12rem）
    useEffect(() => {
        const el = inputRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 192)}px`
    }, [input])

    // 关页 / 切走前把最后一批改动落盘（dirty 是稳定的 Map 引用，卸载时取的就是当前内容）
    useEffect(() => {
        const dirty = dirtyRef.current
        return () => {
            if (idbTimerRef.current) clearTimeout(idbTimerRef.current)
            for (const t of dirty.values()) void putTask(t).catch(() => {})
            dirty.clear()
        }
    }, [])

    /** @desc 把脏任务整批写进 IndexedDB（并发会话时每个任务各自可能都脏着） */
    const flushWrites = useCallback(() => {
        if (idbTimerRef.current) {
            clearTimeout(idbTimerRef.current)
            idbTimerRef.current = null
        }
        const pending = [...dirtyRef.current.values()]
        dirtyRef.current.clear()
        for (const t of pending) void putTask(t).catch(() => {})
    }, [])

    /**
     * @desc 整份写回：状态每帧最多渲染一次、IndexedDB 400ms 防抖一次。
     *  流式输出时 delta 密集到每秒上百次，逐次 setState + putTask 会明显掉帧。
     *  注意这里先**同步**并入 `tasksRef`：同一帧里可能连来几十个 delta，
     *  下一次 patch 必须读到刚才那一份，否则后一个会覆盖前一个（丢字）。
     */
    const persist = useCallback((task: AgentTask) => {
        const index = tasksRef.current.findIndex((t) => t.id === task.id)
        tasksRef.current =
            index >= 0
                ? tasksRef.current.map((t) => (t.id === task.id ? task : t))
                : [task, ...tasksRef.current]
        renderedRef.current = task

        if (rafRef.current === null && typeof requestAnimationFrame === 'function') {
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null
                if (!renderedRef.current) return
                setTasks([...tasksRef.current].sort((a, b) => b.updatedAt - a.updatedAt))
            })
        } else if (typeof requestAnimationFrame !== 'function') {
            setTasks([...tasksRef.current].sort((a, b) => b.updatedAt - a.updatedAt))
        }

        dirtyRef.current.set(task.id, task)
        if (idbTimerRef.current) return
        idbTimerRef.current = setTimeout(flushWrites, 400)
    }, [flushWrites])

    /** @desc 立即落盘（状态剧变 / 任务收尾时调用，避免 400ms 窗口里丢结果） */
    const flushTask = useCallback(() => {
        flushWrites()
    }, [flushWrites])

    /**
     * @desc 只改**指定 id** 的任务。流式链路一律走这里，永远不"猜"当前是哪个会话。
     */
    const patchTask = useCallback(
        (taskId: string, fn: (task: AgentTask) => AgentTask) => {
            const current = tasksRef.current.find((t) => t.id === taskId)
            if (!current) return
            persist(fn(current))
        },
        [persist]
    )

    const createTask = useCallback((): AgentTask => {
        const now = Date.now()
        const task: AgentTask = {
            id: newId(),
            title: '新任务',
            status: 'idle',
            messages: [],
            activities: [],
            approvalLog: [],
            pendingApproval: null,
            createdAt: now,
            updatedAt: now
        }
        persist(task)
        flushTask()
        setActiveId(task.id)
        return task
    }, [flushTask, persist])

    /** @desc 供工具调用：弹审批 → 等人工点 → 记录决定。`taskId` 是发起本次运行的任务，绝不取"当前任务" */
    const requestApproval = useCallback(
        (taskId: string, req: Omit<ApprovalRequest, 'id' | 'createdAt'>): Promise<ApprovalDecision> => {
            const full: ApprovalRequest = { ...req, id: newId(), createdAt: Date.now() }
            // 立即通过（审批卡照旧记录，过程可见）：
            // - autoApprove：只自动批「写操作审批」；
            // - autoAnswer：一切询问/同意都自动给答复，写审批也属于「询问同意」，因此同样自动通过。
            if (autoApprove || autoAnswer) {
                patchTask(taskId, (task) => ({
                    ...task,
                    activities: [
                        ...task.activities,
                        { kind: 'approval', request: full, decision: { approved: true, comment: '自动批准（自动批准已开启）' } }
                    ],
                    approvalLog: [
                        ...task.approvalLog,
                        {
                            id: full.id,
                            toolName: full.toolName,
                            title: full.title,
                            target: full.target,
                            approved: true,
                            comment: '自动批准（自动批准已开启）',
                            at: Date.now()
                        }
                    ],
                    updatedAt: Date.now()
                }))
                return Promise.resolve({ approved: true, comment: '自动批准（自动批准已开启）' })
            }
            return new Promise<ApprovalDecision>((resolve) => {
                approvalRef.current[taskId] = (decision) => {
                    delete approvalRef.current[taskId]
                    patchTask(taskId, (current) => ({
                        ...current,
                        pendingApproval: null,
                        status: 'running',
                        approvalLog: [
                            ...current.approvalLog,
                            {
                                id: full.id,
                                toolName: full.toolName,
                                title: full.title,
                                target: full.target,
                                approved: decision.approved,
                                comment: decision.comment,
                                at: Date.now()
                            }
                        ],
                        updatedAt: Date.now()
                    }))
                    resolve(decision)
                }
                patchTask(taskId, (task) => ({
                    ...task,
                    status: 'waiting-approval',
                    pendingApproval: full,
                    activities: [...task.activities, { kind: 'approval', request: full }],
                    updatedAt: Date.now()
                }))
            })
        },
        [autoAnswer, autoApprove, patchTask]
    )

    /** @desc ask_user 工具的宿主实现：弹提问卡，等用户回答。同样绑定到发起运行的任务 */
    const askUser = useCallback(
        (taskId: string, req: AskUserRequest): Promise<string | null> => {
            // 自动应答：不再停下来等人答，直接按「你自己决定」回给模型（问题仍记录在流程里）
            if (autoAnswer) {
                const auto = '（自动应答已开启）按你的最佳判断处理，不用再问我；有歧义就在结果里说明你的取舍。'
                patchTask(taskId, (task) => ({
                    ...task,
                    activities: [
                        ...task.activities,
                        { kind: 'ask', question: req.question, options: req.options, answer: auto }
                    ],
                    updatedAt: Date.now()
                }))
                return Promise.resolve(auto)
            }
            return new Promise<string | null>((resolve) => {
                askRef.current[taskId] = (answer) => {
                    delete askRef.current[taskId]
                    resolve(answer)
                }
                patchTask(taskId, (task) => ({
                    ...task,
                    status: 'waiting-approval',
                    activities: [...task.activities, { kind: 'ask', question: req.question, options: req.options }],
                    updatedAt: Date.now()
                }))
            })
        },
        [autoAnswer, patchTask]
    )

    /** @desc 回答最后一张未作答的提问卡（只作用于传入的任务） */
    const answerAsk = useCallback(
        (taskId: string, answer: string) => {
            const pending = askRef.current[taskId]
            if (!pending) return
            patchTask(taskId, (task) => {
                const target = task.activities
                    .map((a, i) => ({ a, i }))
                    .reverse()
                    .find((x) => x.a.kind === 'ask' && !x.a.answer)
                if (!target) return task
                return {
                    ...task,
                    status: 'running',
                    activities: task.activities.map((a, i) => (i === target.i ? { ...a, answer } : a)),
                    updatedAt: Date.now()
                }
            })
            pending(answer)
        },
        [patchTask]
    )

    /** @desc 审批某个任务上的一张待批卡 */
    const decide = useCallback(
        (taskId: string, requestId: string, approved: boolean, comment?: string) => {
            const pending = approvalRef.current[taskId]
            if (!pending) return
            patchTask(taskId, (task) => ({
                ...task,
                activities: task.activities.map((a) =>
                    a.kind === 'approval' && a.request.id === requestId ? { ...a, decision: { approved, comment } } : a
                ),
                updatedAt: Date.now()
            }))
            pending({ approved, comment })
        },
        [patchTask]
    )

    /**
     * @desc 把消息序列压成要点摘要（手动「压缩」与自动压缩共用同一份提示词）。
     *  保留：任务目标、已完成的写操作与结果、失败原因、待办、用户偏好。
     */
    const summarize = useCallback(
        async (messages: ChatMessage[]): Promise<string> => {
            const transcript = messages
                .filter((m) => m.role !== 'system')
                .map((m) => {
                    if (m.role === 'tool') return `[工具结果] ${(m.content ?? '').slice(0, 1200)}`
                    if (m.tool_calls?.length) {
                        return `[工具调用] ${m.tool_calls.map((c) => `${c.function.name}(${c.function.arguments.slice(0, 300)})`).join('; ')}`
                    }
                    return `[${m.role === 'user' ? '我' : 'AI'}] ${m.content ?? ''}`
                })
                .join('\n')
            const result = await chatCompletionStream(
                ai.apiKey.trim(),
                [
                    {
                        role: 'system',
                        content:
                            '你是会话压缩器。把给定的操作记录压缩成**要点清单**，供后续继续工作。必须保留：任务目标、已执行成功的写操作（实体名 + buff 全名 + 关键数值）、失败的尝试及原因、尚未完成的待办、用户明确表达过的偏好。丢掉：寒暄、重复推理、大段原始数据。用中文，条目式，不超过 1200 字。'
                    },
                    { role: 'user', content: transcript.slice(0, 200_000) }
                ],
                {
                    baseUrl: ai.baseUrl.trim() || undefined,
                    model: ai.model.trim() || undefined,
                    direct: ai.direct,
                    maxOutputTokens: 1600
                }
            )
            return (result.content || '').trim()
        },
        [ai]
    )

    /** @desc 手动压缩按钮（作用于当前打开的任务） */
    async function compressHistory() {
        if (!active || active.messages.length < 4 || compressing) return
        if (!ai.apiKey.trim()) {
            wkToast('请先配置端点', 'error')
            return
        }
        const taskId = active.id
        setCompressing(true)
        try {
            const summary = await summarize(active.messages)
            if (!summary) {
                wkToast('压缩失败：模型没有返回内容', 'error')
                return
            }
            const before = estimateMessagesTokens(active.messages)
            patchTask(taskId, (task) => ({
                ...task,
                messages: [
                    { role: 'user', content: `【历史摘要（${task.messages.length} 条消息压缩而来）】\n${summary}` }
                ],
                activities: appendActivity(task.activities, {
                    kind: 'status',
                    text: `已压缩上下文：约 ${formatTokens(before)} → ${formatTokens(estimateTokens(summary))} tokens`
                }),
                updatedAt: Date.now()
            }))
            wkToast('上下文已压缩', 'success')
        } catch (e) {
            wkToast(e instanceof Error ? e.message : '压缩失败', 'error')
        } finally {
            setCompressing(false)
        }
    }

    /**
     * @desc 自动压缩（run.ts 每轮请求前调用）：用量到预算的 80% 且消息够多时，
     *  直接把历史压成一条摘要。**不需要任何人点按钮**。
     *  返回新数组才会被 run.ts 采用（同引用 = 不压缩）。
     */
    const autoCompress = useCallback(
        async (taskId: string, messages: ChatMessage[]): Promise<ChatMessage[]> => {
            if (!ai.apiKey.trim()) return messages
            const real = messages.filter((m) => m.role !== 'system')
            if (real.length < 6) return messages
            if (!shouldAutoCompress(messages)) return messages
            try {
                const summary = await summarize(messages)
                if (!summary) return messages
                const before = estimateMessagesTokens(messages)
                patchTask(taskId, (task) => ({
                    ...task,
                    activities: appendActivity(task.activities, {
                        kind: 'status',
                        text: `上下文将满（约 ${formatTokens(before)} / ${formatTokens(CONTEXT_BUDGET)}），已自动压缩为摘要`
                    }),
                    updatedAt: Date.now()
                }))
                return [
                    {
                        role: 'user',
                        content: `【历史摘要（自动压缩，${real.length} 条消息）】\n${summary}`
                    }
                ]
            } catch {
                // 压缩失败就把原文继续用（不能因此中断任务）
                return messages
            }
        },
        [ai, patchTask, summarize]
    )

    const run = useCallback(
        async (text: string | null) => {
            // 起始任务 = 当前打开的任务（没有就新建）。之后整条链路只认捕获下来的 taskId。
            let task = tasksRef.current.find((t) => t.id === activeId) ?? null
            if (!task) task = createTask()
            if (text) {
                const userMsg: ChatMessage = { role: 'user', content: text }
                task = {
                    ...task,
                    title: task.messages.length === 0 ? text.slice(0, 40) : task.title,
                    messages: [...task.messages, userMsg],
                    activities: appendActivity(task.activities, { kind: 'user', text }),
                    status: 'running',
                    updatedAt: Date.now()
                }
            } else {
                task = { ...task, status: 'running', updatedAt: Date.now() }
            }
            const taskId = task.id
            /** 本次运行专用：任何写入都锁死到这个任务，切会话 / 新建任务都影响不到它 */
            const patchCurrent = (fn: (t: AgentTask) => AgentTask) => patchTask(taskId, fn)
            persist(task)
            setActiveId(taskId)

            const controller = new AbortController()
            abortMapRef.current[taskId] = controller
            setRunningIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]))

            try {
                await runAgent({
                    apiKey: ai.apiKey.trim(),
                    baseUrl: ai.baseUrl.trim() || undefined,
                    model: ai.model.trim() || undefined,
                    direct: ai.direct,
                    reasoningEffort: ai.reasoningEffort,
                    systemPrompt: buildAgentSystemPrompt(role, prompts),
                    task,
                    tools: [...BUFF_TOOLS, ...SUBSTAT_TOOLS, ...PROJECT_TOOLS, ...INTERACTION_TOOLS],
                    executeTool: (name, args) => {
                        if (name === 'ask_user') return executeInteractionTool({ askUser: (req) => askUser(taskId, req) }, name, args)
                        if (SUBSTAT_TOOL_NAMES.has(name)) {
                            return executeSubstatTool(
                                { role, locks, requestApproval: (req) => requestApproval(taskId, req) },
                                name,
                                args
                            )
                        }
                        if (PROJECT_TOOL_NAMES.has(name)) {
                            return executeProjectTool(
                                { role, userId, requestApproval: (req) => requestApproval(taskId, req) },
                                name,
                                args
                            )
                        }
                        return executeBuffTool(
                            { role, locks, requestApproval: (req) => requestApproval(taskId, req) },
                            name,
                            args
                        )
                    },
                    onActivity: (activity) =>
                        patchCurrent((t) => ({
                            ...t,
                            activities: appendActivity(t.activities, activity),
                            updatedAt: Date.now()
                        })),
                    onMessages: (messages) => patchCurrent((t) => ({ ...t, messages, updatedAt: Date.now() })),
                    beforeRound: (messages) => autoCompress(taskId, messages),
                    signal: controller.signal
                })
                patchCurrent((t) => ({ ...t, status: 'done', pendingApproval: null, updatedAt: Date.now() }))
            } catch (e) {
                if (e instanceof AiClientError && e.debug === 'aborted') {
                    patchCurrent((t) => ({ ...t, status: 'interrupted', updatedAt: Date.now() }))
                } else {
                    const message = e instanceof Error ? e.message : '执行失败'
                    patchCurrent((t) => ({
                        ...t,
                        status: 'error',
                        error: message,
                        activities: appendActivity(t.activities, { kind: 'error', text: message }),
                        updatedAt: Date.now()
                    }))
                }
            } finally {
                const cancelApproval = approvalRef.current[taskId]
                if (cancelApproval) {
                    delete approvalRef.current[taskId]
                    cancelApproval({ approved: false, comment: '执行结束，审批自动取消' })
                }
                const cancelAsk = askRef.current[taskId]
                if (cancelAsk) {
                    delete askRef.current[taskId]
                    cancelAsk(null)
                }
                delete abortMapRef.current[taskId]
                setRunningIds((prev) => prev.filter((id) => id !== taskId))
                flushTask()
            }
        },
        [activeId, ai, askUser, autoCompress, createTask, flushTask, locks, patchTask, persist, prompts, requestApproval, role, userId]
    )

    const send = () => {
        const text = input.trim()
        // 只看「当前打开的会话跑没跑」：别的会话在跑不该挡住这里
        if (!text || (activeId !== null && runningIds.includes(activeId))) return
        if (!ai.apiKey.trim()) {
            wkToast('请先在「端点」里填 API Key', 'error')
            setShowConfig(true)
            return
        }
        setInput('')
        void run(text)
    }

    const stop = () => {
        const id = activeId
        if (!id) return
        abortMapRef.current[id]?.abort()
        const cancelApproval = approvalRef.current[id]
        if (cancelApproval) cancelApproval({ approved: false, comment: '用户已停止' })
        const cancelAsk = askRef.current[id]
        if (cancelAsk) cancelAsk(null)
    }

    /** @desc 当前打开会话是否在跑（UI 上的「运行中 / 停止 / 发送禁用」都只跟它有关） */
    const running = !!activeId && runningIds.includes(activeId)

    // 卡片上的按钮只作用于"当前打开的这个会话"（refs 只在点击时才读，渲染期间不碰）
    const decideOnActive = useCallback(
        (requestId: string, approved: boolean, comment?: string) => {
            if (activeId) decide(activeId, requestId, approved, comment)
        },
        [activeId, decide]
    )
    const answerOnActive = useCallback(
        (answer: string) => {
            if (activeId) answerAsk(activeId, answer)
        },
        [activeId, answerAsk]
    )

    const pendingApproval = active?.pendingApproval ?? null
    const usedTokens = active ? estimateMessagesTokens(active.messages) : 0
    const usedPct = Math.min(100, Math.round((usedTokens / CONTEXT_BUDGET) * 100))

    return (
        <div className="agent-shell">
            {/* ── 会话栏 ── */}
            <aside className="agent-rail">
                <div className="agent-rail-head">
                    <Icon icon="mdi:robot-outline" className="size-4" />
                    <span className="flex-1">任务</span>
                    <button
                        onClick={() => {
                            setInput('')
                            createTask()
                            inputRef.current?.focus()
                        }}
                        className="agent-btn agent-btn-xs"
                        title="新建任务"
                    >
                        <Icon icon="mdi:plus" className="size-3.5" />
                    </button>
                </div>
                <div className="agent-rail-list">
                    {tasks.length === 0 && <p className="agent-muted px-2 py-6 text-center">还没有任务</p>}
                    {tasks.map((t) => {
                        const dot = taskDot(t, runningIds.includes(t.id))
                        return (
                        <div key={t.id} className="group flex items-center">
                            <button
                                onClick={() => {
                                    setActiveId(t.id)
                                }}
                                className="agent-rail-item agent-rail-item--row min-w-0 flex-1"
                                data-active={t.id === activeId}
                                title={dot.label}
                            >
                                <span className="agent-dot" data-tone={dot.tone} aria-label={dot.label} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12px] font-medium">{t.title}</span>
                                    <span className="agent-muted block truncate">
                                        {STATUS_LABEL[t.status]} · {t.activities.length}
                                    </span>
                                </span>
                            </button>
                            <button
                                onClick={async () => {
                                    if (!window.confirm('删除这条本地任务记录？（不影响数据库）')) return
                                    await deleteTask(t.id).catch(() => {})
                                    const next = tasksRef.current.filter((x) => x.id !== t.id)
                                    tasksRef.current = next
                                    setTasks(next)
                                    if (activeId === t.id) setActiveId(null)
                                }}
                                className="agent-muted shrink-0 px-1 opacity-0 transition-opacity group-hover:opacity-100"
                                title="删除本地记录"
                            >
                                <Icon icon="mdi:close" className="size-3.5" />
                            </button>
                        </div>
                        )
                    })}
                </div>
                <div className="agent-muted border-t px-3 py-2" style={{ borderColor: 'var(--agent-border)' }}>
                    任务只存在本机（IndexedDB），关掉再回来仍在
                </div>
            </aside>

            {/* ── 主区 ── */}
            <section className="agent-main">
                <div className="agent-topbar">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{active?.title ?? '新任务'}</span>
                    {active && <span className="agent-chip">{STATUS_LABEL[active.status]}</span>}
                    <span className="agent-chip" title="当前身份">
                        {role === 'admin' ? 'ADMIN' : 'USER'}
                    </span>
                    <button
                        onClick={() => void compressHistory()}
                        disabled={compressing || !active || active.messages.length < 4}
                        className="agent-btn agent-btn-xs"
                        title={'当前上下文约 ' + formatTokens(usedTokens) + ' tokens（预算 ' + formatTokens(CONTEXT_BUDGET) + '），压缩后只保留要点'}
                    >
                        <Icon
                            icon={compressing ? 'mdi:loading' : 'mdi:archive-arrow-down-outline'}
                            className={'size-3.5 ' + (compressing ? 'animate-spin' : '')}
                        />
                        压缩 {usedPct}%
                    </button>
                    <button
                        onClick={() => {
                            const next = !autoApprove
                            if (
                                next &&
                                !window.confirm(
                                    '开启「自动批准」后，AI 的**写操作**直接通过，不再逐条弹审批。\n提问（ask_user）仍会等你回答——想让提问也不阻塞，再开「自动应答」。\n审批卡仍会记录在流程里。确定开启吗？'
                                )
                            ) {
                                return
                            }
                            setAutoApprove(next)
                            try {
                                window.localStorage.setItem('wuwa-afyg:agent-auto-approve', next ? '1' : '0')
                            } catch {
                                /* 忽略 */
                            }
                            wkToast(next ? '已开启自动批准：写操作直接通过' : '已关闭自动批准：恢复逐条审批', next ? 'info' : 'success')
                        }}
                        className={`agent-btn agent-btn-xs ${autoApprove ? 'agent-btn-danger' : ''}`}
                        title={
                            autoApprove
                                ? '自动批准已开启：写操作直接通过；提问仍需人工回答'
                                : '自动批准：写操作不再逐条弹审批'
                        }
                    >
                        <Icon icon={autoApprove ? 'mdi:shield-off-outline' : 'mdi:shield-check-outline'} className="size-3.5" />
                        {autoApprove ? '自动批准' : '逐条审批'}
                    </button>
                    <button
                        onClick={() => {
                            const next = !autoAnswer
                            if (
                                next &&
                                !window.confirm(
                                    '开启「自动应答」后，AI 的一切**询问 / 同意**都自动给答复：ask_user 提问不再弹卡，写操作审批也视为「询问同意」自动通过。\n如果只想自动批写操作、提问仍要人答，请只开「自动批准」。确定开启吗？'
                                )
                            ) {
                                return
                            }
                            setAutoAnswer(next)
                            try {
                                window.localStorage.setItem('wuwa-afyg:agent-auto-answer', next ? '1' : '0')
                            } catch {
                                /* 忽略 */
                            }
                            wkToast(next ? '已开启自动应答：询问不再阻塞' : '已关闭自动应答：询问恢复人工回复', next ? 'info' : 'success')
                        }}
                        className={`agent-btn agent-btn-xs ${autoAnswer ? 'agent-btn-danger' : ''}`}
                        title={
                            autoAnswer
                                ? '自动应答已开启：ask_user 等询问自动回复（点此恢复人工应答）'
                                : '自动应答：AI 的询问自动回复，不再阻塞'
                        }
                    >
                        <Icon icon={autoAnswer ? 'mdi:comment-off-outline' : 'mdi:comment-question-outline'} className="size-3.5" />
                        {autoAnswer ? '自动应答（含审批）' : '人工应答'}
                    </button>
                    <button onClick={() => setShowConfig(true)} className="agent-btn agent-btn-xs">
                        <Icon icon="mdi:cog-outline" className="size-3.5" />
                        {ai.model || '端点'}
                    </button>
                    {running ? (
                        pendingApproval ? null : (
                            <button onClick={stop} className="agent-btn agent-btn-danger !py-1 text-[11px]">
                                <Icon icon="mdi:stop" className="size-3.5" />
                                停止
                            </button>
                        )
                    ) : (
                        active &&
                        (active.status === 'interrupted' || active.status === 'error') && (
                            <button onClick={() => void run(null)} className="agent-btn agent-btn-xs">
                                <Icon icon="mdi:play" className="size-3.5" />
                                继续
                            </button>
                        )
                    )}
                </div>

                <div className="agent-thread" ref={threadRef}>
                    <div className="agent-thread-inner">
                        {!active && (
                            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
                                <Icon icon="mdi:robot-outline" className="size-8" style={{ color: 'var(--agent-fg-3)' }} />
                                <p className="agent-text">说清目标，AI 查数据、给方案；每个写入都等你批准</p>
                                <p className="agent-muted">
                                    例：帮我搜一下嘉贝的表 / 帮我做新角色的buff / 帮我调一下景燃的表级词条
                                </p>
                            </div>
                        )}

                        {active &&
                            (() => {
                                const all = active.activities
                                const hidden = showAllActivities
                                    ? 0
                                    : Math.max(0, all.length - ACTIVITY_WINDOW)
                                return (
                                    <>
                                        {hidden > 0 && (
                                            <div className="flex justify-center">
                                                <button
                                                    onClick={() => setShowAllForId(activeId)}
                                                    className="agent-btn agent-btn-xs"
                                                    title="长任务只渲染最近的过程，方便定位当前进度"
                                                >
                                                    <Icon icon="mdi:chevron-double-up" className="size-3.5" />
                                                    显示更早的 {hidden} 条
                                                </button>
                                            </div>
                                        )}
                                        {all.map((a, i) => {
                                            if (i < hidden) return null
                                            // 折叠状态按「任务id + 下标」记：两个会话的第 N 张卡互不影响
                                            const rowKey = `${active.id}:${i}`
                                            return (
                                                <ActivityRow
                                                    key={i}
                                                    activity={a}
                                                    expanded={!collapsed[rowKey]}
                                                    onToggle={() =>
                                                        setCollapsed((prev) => ({
                                                            ...prev,
                                                            [rowKey]: !prev[rowKey]
                                                        }))
                                                    }
                                                    onDecide={decideOnActive}
                                                    onAnswer={answerOnActive}
                                                />
                                            )
                                        })}
                                    </>
                                )
                            })()}
                    </div>
                </div>

                <div className="agent-composer">
                    <div className="agent-composer-inner">
                        <div className="agent-input-wrap">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        send()
                                    }
                                }}
                                rows={1}
                                placeholder="描述任务，Enter 发送 / Shift+Enter 换行"
                                className="agent-input"
                            />
                            <button
                                onClick={send}
                                disabled={running || !input.trim()}
                                className="agent-btn agent-btn-primary shrink-0 self-end"
                            >
                                <Icon
                                    icon={running ? 'mdi:loading' : 'mdi:arrow-up'}
                                    className={`size-4 ${running ? 'animate-spin' : ''}`}
                                />
                                发送
                            </button>
                        </div>
                        <div className="agent-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>锁：{locks.buffSetsLocked ? '全局锁定' : '全局开放'}</span>
                            <span>已锁实体：{Object.keys(locks.buffLocks).length}</span>
                            {active && active.approvalLog.length > 0 && (
                                <span>
                                    审批：{active.approvalLog.filter((l) => l.approved).length} 通过 /{' '}
                                    {active.approvalLog.filter((l) => !l.approved).length} 拒绝
                                </span>
                            )}
                            <span className="ml-auto">
                                {[
                                    autoApprove ? '自动批准' : '逐条审批',
                                    autoAnswer ? '自动应答' : '人工应答'
                                ].join(' · ')}
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {showConfig && (
                <ConfigModal
                    ai={ai}
                    setAi={setAi}
                    prompts={prompts}
                    setPrompts={setPrompts}
                    onClose={() => setShowConfig(false)}
                />
            )}
        </div>
    )
}

/** @desc 活动流一行 */
function ActivityRow({
    activity,
    expanded,
    onToggle,
    onDecide,
    onAnswer
}: {
    activity: AgentActivity
    expanded: boolean
    onToggle: () => void
    onDecide: (requestId: string, approved: boolean, comment?: string) => void
    onAnswer: (answer: string) => void
}) {
    if (activity.kind === 'ask') return <AskCard activity={activity} onAnswer={onAnswer} />
    if (activity.kind === 'user') {
        return <div className="agent-user">{activity.text}</div>
    }
    if (activity.kind === 'text') {
        return <Markdown text={activity.text} />
    }
    if (activity.kind === 'reasoning') {
        return (
            <details className="agent-tool" open>
                <summary className="agent-tool-head cursor-pointer text-[11px]">
                    <Icon icon="mdi:brain" className="size-3.5" />
                    思考过程
                </summary>
                <div className="agent-pre agent-mono">{activity.text}</div>
            </details>
        )
    }
    if (activity.kind === 'status') {
        return <p className="agent-muted">{activity.text}</p>
    }
    if (activity.kind === 'error') {
        return (
            <p className="agent-approval" style={{ padding: '0.5rem 0.75rem', color: 'var(--agent-danger)' }}>
                {activity.text}
            </p>
        )
    }
    if (activity.kind === 'tool') {
        const failed = activity.ok === false
        return (
            <div className="agent-tool">
                <button onClick={onToggle} className="agent-tool-head">
                    <Icon
                        icon={failed ? 'mdi:alert-circle-outline' : 'mdi:console-line'}
                        className="size-3.5 shrink-0"
                        style={{ color: failed ? 'var(--agent-danger)' : 'var(--agent-fg-3)' }}
                    />
                    <span className="agent-mono min-w-0 flex-1 truncate" style={{ color: 'var(--agent-fg-2)' }}>
                        {activity.name}
                    </span>
                    <span className="agent-muted shrink-0">{failed ? '失败' : 'ok'}</span>
                    <Icon icon={expanded ? 'mdi:chevron-down' : 'mdi:chevron-right'} className="size-3.5 shrink-0" />
                </button>
                {expanded && (
                    <>
                        <pre className="agent-pre agent-mono">{JSON.stringify(activity.args, null, 2)}</pre>
                        {activity.resultText && (
                            <pre className="agent-pre agent-mono">{activity.resultText.slice(0, 4000)}</pre>
                        )}
                    </>
                )}
            </div>
        )
    }
    // approval
    const { request, decision } = activity
    return (
        <div className="agent-approval">
            <div className="agent-approval-head">
                <Icon icon="mdi:shield-check-outline" className="size-4" style={{ color: 'var(--agent-accent)' }} />
                <span className="text-[12px] font-semibold">{request.title}</span>
                <span className="agent-muted">{request.target}</span>
                <span className="flex-1" />
                {decision ? (
                    <span
                        className="agent-chip"
                        style={{ color: decision.approved ? 'var(--agent-ok)' : 'var(--agent-danger)' }}
                    >
                        {decision.approved ? '已批准' : '已拒绝'}
                    </span>
                ) : (
                    <span className="agent-chip" style={{ color: 'var(--agent-warn)' }}>
                        等待审批
                    </span>
                )}
            </div>
            <div className="agent-diff">
                {request.diff.map((row, i) => (
                    <div key={i} className="agent-diff-row">
                        <span
                            className="agent-mono shrink-0"
                            style={{
                                color:
                                    row.kind === 'add'
                                        ? 'var(--agent-ok)'
                                        : row.kind === 'delete'
                                          ? 'var(--agent-danger)'
                                          : row.kind === 'update'
                                            ? 'var(--agent-warn)'
                                            : 'var(--agent-fg-3)'
                            }}
                        >
                            {row.kind === 'add' ? '+' : row.kind === 'delete' ? '−' : row.kind === 'update' ? '~' : '·'}
                        </span>
                        <span className="min-w-0 flex-1 break-words">{row.name}</span>
                        {row.detail && <span className="agent-muted shrink-0">{row.detail}</span>}
                        {row.fields && row.fields.length > 0 && (
                            <div className="mt-0.5 w-full space-y-0.5 pl-3">
                                {row.fields.map((f, fi) => (
                                    <div key={fi} className="agent-mono flex flex-wrap items-baseline gap-1">
                                        <span style={{ color: 'var(--agent-fg-3)' }}>{f.label}</span>
                                        {f.from !== undefined && (
                                            <span
                                                style={{
                                                    color: 'var(--agent-danger)',
                                                    textDecoration: 'line-through'
                                                }}
                                            >
                                                {f.from}
                                            </span>
                                        )}
                                        {f.to !== undefined && <span style={{ color: 'var(--agent-fg)' }}>{f.to}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {!decision && <ApprovalActions requestId={request.id} onDecide={onDecide} />}
        </div>
    )
}

function AskCard({
    activity,
    onAnswer
}: {
    activity: Extract<AgentActivity, { kind: 'ask' }>
    onAnswer: (answer: string) => void
}) {
    const [text, setText] = useState('')
    const answered = activity.answer !== undefined
    return (
        <div className="agent-approval">
            <div className="agent-approval-head">
                <Icon icon="mdi:help-circle-outline" className="size-4" style={{ color: 'var(--agent-accent)' }} />
                <span className="text-[12px] font-semibold">AI 提问</span>
                <span className="flex-1" />
                {answered ? (
                    <span className="agent-chip">已回答</span>
                ) : (
                    <span className="agent-chip" style={{ color: 'var(--agent-warn)' }}>等你回答</span>
                )}
            </div>
            <div className="agent-diff">
                <p className="agent-text">{activity.question}</p>
                {answered && activity.answer && <p className="agent-muted mt-1">回答：{activity.answer}</p>}
            </div>
            {!answered && (
                <div className="agent-approval-foot">
                    {activity.options && activity.options.length > 0 && (
                        <div className="flex w-full flex-wrap gap-1">
                            {activity.options.map((opt) => (
                                <button key={opt} onClick={() => onAnswer(opt)} className="agent-btn agent-btn-xs">
                                    {opt}
                                </button>
                            ))}
                        </div>
                    )}
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && text.trim()) onAnswer(text.trim())
                        }}
                        placeholder="自由作答，Enter 提交"
                        className="min-w-0 flex-1 outline-none"
                        style={{
                            border: '1px solid var(--agent-border)',
                            background: 'var(--agent-bg)',
                            borderRadius: 8,
                            padding: '0.375rem 0.5rem',
                            color: 'var(--agent-fg)'
                        }}
                    />
                    <button onClick={() => text.trim() && onAnswer(text.trim())} className="agent-btn agent-btn-primary">
                        回答
                    </button>
                </div>
            )}
        </div>
    )
}
function ApprovalActions({
    requestId,
    onDecide
}: {
    requestId: string
    onDecide: (requestId: string, approved: boolean, comment?: string) => void
}) {
    const [comment, setComment] = useState('')
    return (
        <div className="agent-approval-foot">
            <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="拒绝理由（可选，会回给 AI）"
                className="min-w-0 flex-1 outline-none"
                style={{
                    border: '1px solid var(--agent-border)',
                    background: 'var(--agent-bg)',
                    borderRadius: 8,
                    padding: '0.375rem 0.5rem',
                    color: 'var(--agent-fg)'
                }}
            />
            <button
                onClick={() => onDecide(requestId, false, comment.trim() || undefined)}
                className="agent-btn agent-btn-danger"
            >
                拒绝
            </button>
            <button onClick={() => onDecide(requestId, true)} className="agent-btn agent-btn-primary">
                <Icon icon="mdi:check" className="size-4" />
                批准
            </button>
        </div>
    )
}

function ConfigModal({
    ai,
    setAi,
    prompts,
    setPrompts,
    onClose
}: {
    ai: AiConfig
    setAi: React.Dispatch<React.SetStateAction<AiConfig>>
    prompts: PromptSettings
    setPrompts: React.Dispatch<React.SetStateAction<PromptSettings>>
    onClose: () => void
}) {
    const [advanced, setAdvanced] = useState(false)
    async function save() {
        const next = await saveAiConfig({ ...ai })
        setAi({ ...next })
        savePromptSettings(prompts)
        onClose()
        wkToast('配置已保存', 'success')
    }
    return (
        <div className="agent-modal-mask" onClick={onClose}>
            <div className="agent-modal" onClick={(e) => e.stopPropagation()}>
                <div className="agent-topbar">
                    <Icon icon="mdi:cog-outline" className="size-4" />
                    <span className="flex-1 text-[12px] font-semibold">AI 端点</span>
                    <button onClick={onClose} className="agent-btn agent-btn-xs agent-btn-quiet">
                        <Icon icon="mdi:close" className="size-4" />
                    </button>
                </div>
                <div className="agent-modal-body">
                    <label className="agent-field">
                        AI 服务地址
                        <input
                            value={ai.baseUrl}
                            onChange={(e) => setAi((c) => ({ ...c, baseUrl: e.target.value }))}
                            placeholder="https://api.deepseek.com"
                        />
                    </label>
                    <label className="agent-field">
                        模型名
                        <input
                            value={ai.model}
                            onChange={(e) => setAi((c) => ({ ...c, model: e.target.value }))}
                            placeholder="deepseek-chat"
                        />
                    </label>
                    <label className="agent-field">
                        API Key
                        <input
                            type="password"
                            value={ai.apiKey}
                            onChange={(e) => setAi((c) => ({ ...c, apiKey: e.target.value }))}
                            placeholder="sk-..."
                        />
                    </label>
                    <div className="agent-field">
                        思考强度
                        <div className="flex items-center gap-1">
                            {(['off', 'low', 'medium', 'high'] as const).map((level) => (
                                <button
                                    key={level}
                                    onClick={() => setAi((c) => ({ ...c, reasoningEffort: level }))}
                                    className={`agent-btn agent-btn-xs ${
                                        ai.reasoningEffort === level ? 'agent-btn-primary' : ''
                                    }`}
                                >
                                    {level === 'off' ? '不传' : level === 'low' ? '低' : level === 'medium' ? '中' : '高'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="agent-muted">浏览器直连（不经站点代理）</span>
                        <button
                            onClick={() => setAi((c) => ({ ...c, direct: !c.direct }))}
                            className={`agent-btn text-[11px] ${ai.direct ? 'agent-btn-primary' : ''}`}
                        >
                            <Icon icon={ai.direct ? 'mdi:check-circle' : 'mdi:circle-outline'} className="size-3.5" />
                            {ai.direct ? '直连' : '经代理'}
                        </button>
                    </div>
                    <button onClick={() => setAdvanced((v) => !v)} className="agent-btn agent-btn-xs self-start">
                        <Icon icon={advanced ? 'mdi:chevron-down' : 'mdi:chevron-right'} className="size-3.5" />
                        高级：补充说明（命名规则与黑话已内置）
                    </button>
                    {advanced && (
                        <>
                            <label className="agent-field">
                                补充说明（追加到系统提示末尾，项目约定优先）
                                <textarea
                                    value={prompts.extra}
                                    onChange={(e) => setPrompts((c) => ({ ...c, extra: e.target.value }))}
                                    rows={4}
                                    placeholder="例：武器按精炼 1-5 阶各拆一条；层数一律填增量"
                                    style={{
                                        border: '1px solid var(--agent-border)',
                                        background: 'var(--agent-bg)',
                                        borderRadius: 8,
                                        padding: '0.375rem 0.5rem',
                                        color: 'var(--agent-fg)',
                                        outline: 'none',
                                        resize: 'vertical'
                                    }}
                                />
                            </label>
                        </>
                    )}
                    <p className="agent-muted">配置只存本机浏览器，与其他 AI 入口共用同一份。</p>
                </div>
                <div className="agent-approval-foot justify-end">
                    <button onClick={onClose} className="agent-btn">
                        取消
                    </button>
                    <button onClick={() => void save()} className="agent-btn agent-btn-primary">
                        <Icon icon="mdi:content-save-outline" className="size-4" />
                        保存
                    </button>
                </div>
            </div>
        </div>
    )
}
