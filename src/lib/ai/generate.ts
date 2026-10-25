// 前端直连 AI 的 Buff 集生成循环（浏览器端执行，不经过服务端 route）
//
// 口径已与椰果工具箱的 `src/lib/ai/generate/index.ts` 对齐：
// 1. **没有工具调用上限**：模型只要还在查数据就一直循环；唯一的刹车是用户按停止（`signal`）。
// 2. **实时上报生成情况**：每轮请求、每次工具调用、每段流式正文/思考都作为事件抛出，
//    界面据此把「正在做什么」画在生成任务那一行上，而不是等结束才一次性给结果。
import { chatCompletionStream, sanitizeBuffs, AiClientError, type ChatMessage } from '@/lib/ai/client'
import { buildTools, executeTool, type BuffDraftApi } from '@/lib/ai/tools'
import {
    renderSystemPrompt,
    renderInitialTaskPrompt,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_INITIAL_TASK_PROMPT
} from '@/lib/ai/prompts'
import { BUFF_ENTITY_TYPES } from '@/lib/consts/buff-zones'
import type { BuffEntityType } from '@/lib/types/db'

/** @desc 自动修复上限（解析失败后把错误喂回模型重来；与「工具轮次」无关，刻意保留上限） */
export const MAX_FIX_RETRY = 2

/**
 * @desc 生成过程的实时事件（界面按 `type` 分流）。
 *
 * - `status`：一行人话状态（第几轮、在调哪个工具、解析结果…）
 * - `content` / `reasoning`：模型正在流出的正文 / 思考增量（`delta` 是增量，`*Chars` 是累计）
 * - `tool` / `tool-result`：同一 `seq` 的工具开始 / 结束（界面据此配对成一行）
 * - `prompt`：本轮装配的提示词（只在「调试」面板里展示）
 * - `result` / `error`：收尾
 */
export interface GenerateEvent {
    type: 'status' | 'content' | 'reasoning' | 'tool' | 'tool-result' | 'prompt' | 'result' | 'error'
    /** @desc 给人看的一行文本（status / tool / tool-result / result / error / prompt 必有） */
    text?: string
    /** @desc 增量文本（仅 content / reasoning） */
    delta?: string
    /** @desc 本轮序号（从 1 起） */
    round?: number
    /** @desc 本回合已执行的工具调用次数（累计） */
    toolCalls?: number
    toolName?: string
    toolArgs?: Record<string, unknown>
    /** @desc 工具调用的配对序号（开始与结束共用） */
    seq?: number
    /** @desc 累计输出 / 思考字符数（当前轮） */
    contentChars?: number
    reasoningChars?: number
    /** @desc 成功解析出的 Buff 条数（仅 result） */
    buffCount?: number
    /** @desc 解析结果（仅 result；失败为 null） */
    data?: ReturnType<typeof sanitizeBuffs> | null
    rawContent?: string
    parseError?: string | null
    /** @desc 工具返回的完整结果文本（JSON），供任务行展开查看请求 / 响应 */
    resultText?: string
    /** @desc 提示词种类（仅 prompt） */
    promptKind?: 'system' | 'user' | 'history'
    /** @desc 调试信息（仅 error） */
    debug?: string
}

export interface GenerateBuffSetOptions {
    apiKey: string

    entityType: BuffEntityType
    entityName: string
    baseUrl?: string
    model?: string
    systemPrompt?: string
    initialTaskPrompt?: string
    toolPrompts?: Record<string, string>
    slangDict?: string
    history?: ChatMessage[]
    newUserMessage?: string
    reasoningEffort?: 'off' | 'low' | 'medium' | 'high'
    /** @desc 浏览器直连（`true` = 不经站点 /api/ai/stream 转发） */
    direct?: boolean
    /** @desc 单次请求最大输出 token（缺省用 client 内置值） */
    maxOutputTokens?: number
    /** @desc 用户停止（唯一能终止生成的手段） */
    signal?: AbortSignal
    getBuffSets: (queryType?: string, queryName?: string, query?: string) => Promise<unknown>
    /** @desc 管理员编辑中的 Buff 草稿（改名 / 改细节 / 增删 / 直接落库的工具数据源） */
    draft?: BuffDraftApi
    /** @desc 危险操作（直接写入数据库）的确认回调；缺省时该类工具一律拒绝 */
    onConfirm?: (toolName: string, message: string) => Promise<boolean>
    onEvent?: (evt: GenerateEvent) => void
    // 跨实体共享会话：seed = 完整前缀消息（不含 system，来自上一实体生成）；onMessages = 本次完整序列（不含 system）回传
    seedMessages?: ChatMessage[]
    onMessages?: (messages: ChatMessage[]) => void
}

export interface GenerateBuffSetResult {
    buffs: ReturnType<typeof sanitizeBuffs> | null
    rawContent: string
    parseError: string | null
}

/** @desc 用户按下停止时的统一错误（界面据 `debug === 'aborted'` 静默收尾） */
const abortedError = (): AiClientError => new AiClientError('已停止生成', 'aborted')

export async function generateBuffSet(options: GenerateBuffSetOptions): Promise<GenerateBuffSetResult> {
    const apiKey = options.apiKey.trim()

    const entityType = options.entityType
    const entityName = options.entityName.trim().slice(0, 60)
    const systemTemplate = options.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT
    const initialTaskTemplate = options.initialTaskPrompt?.trim() || DEFAULT_INITIAL_TASK_PROMPT
    const toolPrompts = options.toolPrompts
    const slangDict = options.slangDict?.trim() || ''
    const history = Array.isArray(options.history) ? options.history : []
    const newUserMessage = options.newUserMessage?.trim() || ''
    // 'off' 表示不发送 reasoning_effort（兼容严格模式的 OpenAI 兼容提供商）
    const reasoningEffort: 'low' | 'medium' | 'high' | undefined =
        options.reasoningEffort === 'low' || options.reasoningEffort === 'medium' || options.reasoningEffort === 'high'
            ? options.reasoningEffort
            : undefined
    const emit = options.onEvent ?? (() => {})
    const signal = options.signal
    const toolContext = {
        entityType,
        entityName,
        getBuffSets: options.getBuffSets,
        slangDict,
        draft: options.draft,
        onConfirm: options.onConfirm
    }
    // 草稿类工具只在管理员编辑器里上清单（否则模型会调用必失败的工具）
    const tools = buildTools(toolPrompts, { draft: Boolean(options.draft) })

    if (!apiKey) throw new Error('请先填入所选 AI 提供商的 API Key')

    if (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number])) {
        throw new Error('无效的实体类型')
    }
    if (!entityName) throw new Error('实体名不能为空')

    const emitStatus = (text: string, extra: Partial<GenerateEvent> = {}) =>
        emit({ type: 'status', text, ...extra })

    // 结束时回传完整消息序列（不含 system），供跨实体共享会话缓存命中
    const finish = (r: GenerateBuffSetResult): GenerateBuffSetResult => {
        options.onMessages?.(messages.slice(1))
        return r
    }

    emitStatus(`开始：${entityType} / ${entityName}${newUserMessage ? '（追问）' : ''}`)

    /**
     * @desc 管理员编辑器里额外注入一段「草稿编辑工具」说明。
     *  刻意写在这里而不是提示词模板里：模板可被用户自定义（localStorage），
     *  而「有没有草稿」只有运行时才知道，工具能力不能靠用户模板去描述。
     */
    const draftSection = options.draft
        ? `\n\n【编辑工具（当前界面已打开 Buff 编辑器）】你可以直接改「编辑中的草稿」，改完管理员立刻能在列表里看到：\n- rename_buff：给某一条 buff 改名（保留数值/条件）\n- update_buff：改某一条的 scope / 实例级条件 / 乘区贡献条目（只传要改的字段）\n- add_buff / remove_buff：增删单条 buff\n- save_buff_set：把当前草稿**直接写入数据库**（会弹管理员确认；只在用户明确要求保存时调用）\n小范围修正（改名、改数值/条件、补一条）请优先用这些工具，不要为改一条而重新输出整份 JSON；\n只有「整份重新生成 / 大规模改写」才输出完整 buffs JSON 供管理员点「应用」。`
        : ''
    const systemContent = `${renderSystemPrompt(systemTemplate, { entityType })}${draftSection}`
    const messages: ChatMessage[] = [{ role: 'system', content: systemContent }]
    emit({ type: 'prompt', promptKind: 'system', text: systemContent })

    // 跨实体共享会话前缀（不含 system；来自上一实体生成的完整消息序列）
    const seed = Array.isArray(options.seedMessages) ? options.seedMessages : []
    if (seed.length > 0) {
        messages.push(...seed)
        emit({ type: 'prompt', promptKind: 'history', text: JSON.stringify(seed) })
    }

    const initialUser = renderInitialTaskPrompt(initialTaskTemplate, { entityType, entityName })
    messages.push({ role: 'user', content: initialUser })
    emit({ type: 'prompt', promptKind: 'user', text: initialUser })

    if (history.length > 0) {
        messages.push(...history)
        emit({ type: 'prompt', promptKind: 'history', text: JSON.stringify(history) })
    }
    if (newUserMessage) {
        messages.push({ role: 'user', content: newUserMessage })
        emit({ type: 'prompt', promptKind: 'user', text: newUserMessage })
    }

    emitStatus(`请求 AI（model=${options.model?.trim() || '默认'}, tools=${tools.length}, 消息数=${messages.length}）…`)

    /** @desc 最终输出 */
    let content = ''
    /** @desc 自动修复已用次数 */
    let fixCount = 0
    /** @desc 本回合已执行的工具调用总数（跨轮累计） */
    let toolCallTotal = 0
    /** @desc 工具调用配对序号发号器（开始 / 结束两条事件共用） */
    let toolSeq = 0

    // 无工具调用上限：只有「模型不再调工具」或「用户停止」才会离开循环
    for (let round = 1; ; round++) {
        if (signal?.aborted) throw abortedError()
        /** @desc 本轮已流出的正文 / 思考 */
        let roundText = ''
        let roundChars = 0
        let roundReasoningChars = 0

        emitStatus(
            `第 ${round} 轮请求${toolCallTotal > 0 ? `（累计工具调用 ${toolCallTotal} 次）` : ''}…`,
            { round, toolCalls: toolCallTotal }
        )

        const result = await chatCompletionStream(apiKey, messages, {
            tools,
            reasoningEffort,
            baseUrl: options.baseUrl,
            model: options.model,
            signal,
            direct: options.direct,
            maxOutputTokens: options.maxOutputTokens,
            onDelta: (delta) => {
                if (delta.content) {
                    roundText += delta.content
                    roundChars += delta.content.length
                    emit({ type: 'content', delta: delta.content, round, contentChars: roundChars, reasoningChars: roundReasoningChars })
                }
                if (delta.reasoning) {
                    roundReasoningChars += delta.reasoning.length
                    emit({
                        type: 'reasoning',
                        delta: delta.reasoning,
                        round,
                        contentChars: roundChars,
                        reasoningChars: roundReasoningChars
                    })
                }
            }
        })

        if (signal?.aborted) throw abortedError()

        // 有工具调用 → 执行并回喂（继续下一轮，不设上限）
        if (result.toolCalls && result.toolCalls.length > 0) {
            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: result.content || '',
                tool_calls: result.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: { name: tc.name, arguments: tc.arguments }
                }))
            }
            messages.push(assistantMsg)

            for (const tc of result.toolCalls) {
                if (signal?.aborted) throw abortedError()
                let args: Record<string, unknown> = {}
                try {
                    args = tc.arguments ? JSON.parse(tc.arguments) : {}
                } catch {
                    args = {}
                }
                toolCallTotal += 1
                toolSeq += 1
                const seq = toolSeq
                emit({
                    type: 'tool',
                    text: `工具调用（第 ${round} 轮）：${tc.name}`,
                    round,
                    toolCalls: toolCallTotal,
                    toolName: tc.name,
                    toolArgs: args,
                    seq
                })
                let output: string
                try {
                    output = await executeTool(toolContext, tc.name, args)
                } catch (e) {
                    output = JSON.stringify({ error: e instanceof Error ? e.message : '工具执行失败' })
                }
                emit({
                    type: 'tool-result',
                    text: `工具返回：${tc.name}（${output.length} 字符）`,
                    round,
                    toolCalls: toolCallTotal,
                    toolName: tc.name,
                    toolArgs: args,
                    seq,
                    resultText: output
                })
                messages.push({ role: 'tool', tool_call_id: tc.id, content: output })
            }
            emitStatus(`第 ${round} 轮工具处理完毕，继续生成…`, { round, toolCalls: toolCallTotal })
            continue
        }

        // 无工具调用 → 尝试解析最终内容
        // result.content 优先；为空时用本轮流式累积的正文兜底（个别端点会在 finish 后给空 content）
        content = result.content?.trim() ? result.content : roundText

        if (!content.trim()) {
            emit({ type: 'error', text: 'AI 未返回内容', round, toolCalls: toolCallTotal })
            return finish({ buffs: null, rawContent: content, parseError: 'AI 未返回内容' })
        }

        let buffs: ReturnType<typeof sanitizeBuffs> | null = null
        let parseError: string | null = null
        try {
            const parsed = JSON.parse(content) as { buffs?: unknown[] }
            if (Array.isArray(parsed.buffs)) {
                buffs = sanitizeBuffs(parsed.buffs as never)
                if (buffs.length > 0) {
                    emitStatus(`解析成功，得到 ${buffs.length} 条可用 Buff`, { round, toolCalls: toolCallTotal })
                    emit({
                        type: 'result',
                        data: buffs,
                        rawContent: content,
                        parseError: null,
                        buffCount: buffs.length,
                        round,
                        toolCalls: toolCallTotal
                    })
                    return finish({ buffs, rawContent: content, parseError: null })
                }
                parseError = 'buffs 数组为空'
            } else {
                parseError = '返回结构缺少 buffs 数组'
            }
        } catch {
            parseError = '返回的不是合法 JSON'
        }

        // 管理员编辑场景：模型直接用人话回复（例如「已把 A 改名为 B」）是合法的，
        // 不做 JSON 自动修复 —— 否则每句回复都会被强行要求量产 JSON，白白多烧两轮。
        if (options.draft && !content.trim().startsWith('{')) {
            emitStatus(`本轮为文字回复（未输出整份 JSON）`, { round, toolCalls: toolCallTotal })
            return finish({ buffs: null, rawContent: content, parseError: null })
        }

        // 解析失败 → 自动修复（把错误喂回 AI 再生成一轮）
        if (fixCount < MAX_FIX_RETRY) {
            fixCount++
            messages.push({ role: 'assistant', content })
            messages.push({
                role: 'user',
                content: `你上一条回复不是可用的 Buff JSON（错误：${parseError}）。请重新只输出符合输出格式的完整 buffs JSON：{"buffs":[{...}]}，不要包含任何其它内容、解释或代码块标记。`
            })
            emitStatus(`Buff JSON 解析失败（${parseError}），自动修复第 ${fixCount}/${MAX_FIX_RETRY} 次`, {
                round,
                toolCalls: toolCallTotal
            })
            continue
        }

        emit({
            type: 'error',
            text: `生成失败：${entityName}（${parseError}）`,
            round,
            toolCalls: toolCallTotal
        })
        emit({ type: 'result', data: null, rawContent: content, parseError, round, toolCalls: toolCallTotal })
        return finish({ buffs: null, rawContent: content, parseError })
    }
}
