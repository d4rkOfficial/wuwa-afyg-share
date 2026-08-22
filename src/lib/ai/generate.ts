// 前端直连 DeepSeek 的 Buff 集生成循环（浏览器端执行，不再经过服务端 route）
import { chatCompletionStream, sanitizeBuffs, type ChatMessage } from '@/lib/ai/deepseek'
import { buildTools, executeTool } from '@/lib/ai/tools'
import { renderSystemPrompt, renderInitialTaskPrompt, DEFAULT_SYSTEM_PROMPT, DEFAULT_INITIAL_TASK_PROMPT } from '@/lib/ai/prompts'
import { BUFF_ENTITY_TYPES } from '@/lib/consts/buff-zones'
import type { BuffEntityType } from '@/lib/types/db'

export const MAX_FIX_RETRY = 2

export interface GenerateEvent {
    type: 'log' | 'prompt' | 'ai' | 'reasoning' | 'tool' | 'result' | 'error'
    level?: 'info' | 'success' | 'error' | 'debug'
    text?: string
    kind?: 'system' | 'user' | 'history'
    data?: unknown
    rawContent?: string
    parseError?: string | null
    name?: string
    args?: Record<string, unknown>
    resultLen?: number
    running?: boolean
    message?: string
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
    getBuffSets: (queryType?: string, queryName?: string, query?: string) => Promise<unknown>
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
    const tools = buildTools(toolPrompts)

    if (!apiKey) throw new Error('请先填入所选 AI 提供商的 API Key')
    
    if (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number])) {
        throw new Error('无效的实体类型')
    }
    if (!entityName) throw new Error('实体名不能为空')

    const toolContext = { entityType, entityName, getBuffSets: options.getBuffSets, slangDict }
    const emitLog = (text: string, level: GenerateEvent['level'] = 'info') => emit({ type: 'log', level, text })

    // 结束时回传完整消息序列（不含 system），供跨实体共享会话缓存命中
    const finish = (r: GenerateBuffSetResult): GenerateBuffSetResult => {
        options.onMessages?.(messages.slice(1))
        return r
    }

    emitLog(`开始：${entityType} / ${entityName}${newUserMessage ? '（追问）' : ''}`)

    const systemContent = renderSystemPrompt(systemTemplate, { entityType })
    const messages: ChatMessage[] = [{ role: 'system', content: systemContent }]
    emit({ type: 'prompt', kind: 'system', text: systemContent })

    // 跨实体共享会话前缀（不含 system；来自上一实体生成的完整消息序列）
    const seed = Array.isArray(options.seedMessages) ? options.seedMessages : []
    if (seed.length > 0) {
        messages.push(...seed)
        emit({ type: 'prompt', kind: 'history', text: JSON.stringify(seed) })
    }

    const initialUser = renderInitialTaskPrompt(initialTaskTemplate, { entityType, entityName })
    messages.push({ role: 'user', content: initialUser })
    emit({ type: 'prompt', kind: 'user', text: initialUser })

    if (history.length > 0) {
        messages.push(...history)
        emit({ type: 'prompt', kind: 'history', text: JSON.stringify(history) })
    }
    if (newUserMessage) {
        messages.push({ role: 'user', content: newUserMessage })
        emit({ type: 'prompt', kind: 'user', text: newUserMessage })
    }

    emitLog(
        `请求 AI（model=${options.model?.trim() || 'deepseek-v4-flash'}, tools=${tools.length}, 消息数=${messages.length}）…`
    )

    let content = ''
    let reasoning = ''
    let fixCount = 0

    for (let round = 1; ; round++) {
        const result = await chatCompletionStream(apiKey, messages, {
            tools,
            reasoningEffort,
            baseUrl: options.baseUrl,
            model: options.model,
            onDelta: (delta) => {
                if (delta.content) {
                    content += delta.content
                    emit({ type: 'ai', text: delta.content })
                }
                if (delta.reasoning) {
                    reasoning += delta.reasoning
                    emit({ type: 'reasoning', text: delta.reasoning })
                }
            }
        })

        emitLog(
            `第 ${round} 轮：finish_reason=${result.finishReason ?? '(无)'}, content=${result.toolCalls ? 0 : content.length} 字符, tool_calls=${result.toolCalls?.length ?? 0}`,
            'debug'
        )

        // 有工具调用 → 执行并回喂
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
                let args: Record<string, unknown> = {}
                try {
                    args = tc.arguments ? JSON.parse(tc.arguments) : {}
                } catch {
                    args = {}
                }
                emit({ type: 'tool', name: tc.name, args, running: true })
                let output: string
                try {
                    output = await executeTool(toolContext, tc.name, args)
                } catch (e) {
                    output = JSON.stringify({ error: e instanceof Error ? e.message : '工具执行失败' })
                }
                emit({ type: 'tool', name: tc.name, args, resultLen: output.length })
                messages.push({ role: 'tool', tool_call_id: tc.id, content: output })
            }
            emitLog(`工具调用完成，继续下一轮（第 ${round + 1} 轮）`, 'info')
            continue
        }

        // 无工具调用 → 尝试解析最终内容
        if (result.content?.trim()) {
            content = result.content
        }

        if (!content.trim()) {
            emit({ type: 'error', message: 'DeepSeek 未返回内容' })
            return finish({ buffs: null, rawContent: content, parseError: 'DeepSeek 未返回内容' })
        }

        let buffs: ReturnType<typeof sanitizeBuffs> | null = null
        let parseError: string | null = null
        try {
            const parsed = JSON.parse(content) as { buffs?: unknown[] }
            if (Array.isArray(parsed.buffs)) {
                buffs = sanitizeBuffs(parsed.buffs as never)
                if (buffs.length > 0) {
                    emitLog(`解析成功，得到 ${buffs.length} 条可用 Buff`, 'success')
                    emit({ type: 'result', data: buffs, rawContent: content, parseError: null })
                    return finish({ buffs, rawContent: content, parseError: null })
                }
                parseError = 'buffs 数组为空'
            } else {
                parseError = '返回结构缺少 buffs 数组'
            }
        } catch {
            parseError = '返回的不是合法 JSON'
        }

        // 解析失败 → 自动修复（把错误喂回 AI 再生成一轮）
        if (fixCount < MAX_FIX_RETRY) {
            fixCount++
            messages.push({ role: 'assistant', content })
            messages.push({
                role: 'user',
                content: `你上一条回复不是可用的 Buff JSON（错误：${parseError}）。请重新只输出符合输出格式的完整 buffs JSON：{"buffs":[{...}]}，不要包含任何其它内容、解释或代码块标记。`
            })
            emitLog(`Buff JSON 解析失败（${parseError}），自动修复第 ${fixCount}/${MAX_FIX_RETRY} 次`, 'debug')
            content = ''
            reasoning = ''
            continue
        }

        emitLog(`流结束：content=${content.length} 字符, reasoning=${reasoning.length} 字符`, 'debug')
        emit({ type: 'result', data: null, rawContent: content, parseError })
        return finish({ buffs: null, rawContent: content, parseError })
    }
}
