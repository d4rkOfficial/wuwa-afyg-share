import { requireUser } from '@/lib/supabase/admin'
import { chatCompletionStream, DeepSeekError, sanitizeBuffs, type ChatMessage } from '@/lib/ai/deepseek'
import { buildTools, executeTool } from '@/lib/ai/tools'
import { renderSystemPrompt, renderInitialTaskPrompt, DEFAULT_SYSTEM_PROMPT, DEFAULT_INITIAL_TASK_PROMPT } from '@/lib/ai/prompts'
import { BUFF_ENTITY_TYPES } from '@/lib/consts/buff-zones'
import type { BuffEntityType } from '@/lib/types/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_TOOL_ROUNDS = 8

interface AiRequestBody {
    apiKey: string
    toolBase: string
    entityType: BuffEntityType
    entityName: string
    systemPrompt?: string
    initialTaskPrompt?: string
    toolPrompts?: Record<string, string>
    slangDict?: string
    history?: ChatMessage[]
    newUserMessage?: string
}

export async function POST(req: Request) {
    const auth = await requireUser()
    if (!auth.ok) {
        return new Response(JSON.stringify({ type: 'error', message: auth.error ?? '无权限' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    let body: AiRequestBody
    try {
        body = (await req.json()) as AiRequestBody
    } catch {
        return new Response(JSON.stringify({ type: 'error', message: '请求体不是合法 JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    const apiKey = body.apiKey?.trim() ?? ''
    const toolBase = (body.toolBase ?? '').trim()
    const entityType = body.entityType
    const entityName = (body.entityName ?? '').trim().slice(0, 60)
    const systemTemplate = body.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT
    const initialTaskTemplate = body.initialTaskPrompt?.trim() || DEFAULT_INITIAL_TASK_PROMPT
    const toolPrompts = body.toolPrompts
    const slangDict = body.slangDict?.trim() || ''
    const history = Array.isArray(body.history) ? body.history : []
    const newUserMessage = body.newUserMessage?.trim() || ''
    const tools = buildTools(toolPrompts)

    const validation =
        (!apiKey && '请先填入 DeepSeek API Key') ||
        (!toolBase && '请先填入工具箱地址') ||
        (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number]) && '无效的实体类型') ||
        (!entityName && '实体名不能为空')

    if (validation) {
        return new Response(JSON.stringify({ type: 'error', message: validation }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        async start(controller) {
            const push = (obj: unknown) => {
                try {
                    controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
                } catch {
                    /* stream closed */
                }
            }
            const pushLog = (text: string, level: 'info' | 'success' | 'error' | 'debug' = 'info') =>
                push({ type: 'log', level, text })

            // 查询已收录 buff 集（供 get_buff_sets 等工具）
            const getBuffSets = async (queryType?: string, queryName?: string, query?: string) => {
                if (!auth.supabase) return { error: '数据库不可用' }
                let q = auth.supabase
                    .from('buff_sets')
                    .select('entity_type, entity_name, buff_name, scope, exclusive, buff_set')
                    .order('entity_type', { ascending: true })
                    .order('entity_name', { ascending: true })
                if (queryType) q = q.eq('entity_type', queryType)
                if (queryName) q = q.eq('entity_name', queryName)
                if (query) q = q.or(`entity_name.ilike.%${query.replace(/[%_\\]/g, '\\$&')}%,buff_name.ilike.%${query.replace(/[%_\\]/g, '\\$&')}%`)
                const { data, error } = await q.limit(200)
                if (error) return { error: error.message }
                return { total: (data ?? []).length, buffSets: data ?? [] }
            }

            const toolContext = { toolBase, entityType, entityName, getBuffSets, slangDict }

            pushLog(`开始：${entityType} / ${entityName}${newUserMessage ? '（追问）' : ''}`)

            try {
                const systemContent = renderSystemPrompt(systemTemplate)
                const messages: ChatMessage[] = [{ role: 'system', content: systemContent }]
                push({ type: 'prompt', kind: 'system', text: systemContent })

                const initialUser = renderInitialTaskPrompt(initialTaskTemplate, { entityType, entityName })
                messages.push({ role: 'user', content: initialUser })
                push({ type: 'prompt', kind: 'user', text: initialUser })

                if (history.length > 0) {
                    messages.push(...history)
                    push({ type: 'prompt', kind: 'history', text: JSON.stringify(history) })
                }
                if (newUserMessage) {
                    messages.push({ role: 'user', content: newUserMessage })
                    push({ type: 'prompt', kind: 'user', text: newUserMessage })
                }

                pushLog(`请求 DeepSeek（model=deepseek-v4-flash, tools=${tools.length}, 消息数=${messages.length}）…`)

                let content = ''
                let reasoning = ''

                for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
                    const result = await chatCompletionStream(apiKey, messages, {
                        tools,
                        onDelta: (delta) => {
                            if (delta.content) {
                                content += delta.content
                                push({ type: 'ai', text: delta.content })
                            }
                            if (delta.reasoning) {
                                reasoning += delta.reasoning
                                push({ type: 'reasoning', text: delta.reasoning })
                            }
                        }
                    })

                    pushLog(
                        `第 ${round + 1} 轮：finish_reason=${result.finishReason ?? '(无)'}, content=${result.toolCalls ? 0 : content.length} 字符, tool_calls=${result.toolCalls?.length ?? 0}`,
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
                            push({ type: 'tool', name: tc.name, args, running: true })
                            let output: string
                            try {
                                output = await executeTool(toolContext, tc.name, args)
                            } catch (e) {
                                output = JSON.stringify({ error: e instanceof Error ? e.message : '工具执行失败' })
                            }
                            push({ type: 'tool', name: tc.name, args, resultLen: output.length })
                            messages.push({ role: 'tool', tool_call_id: tc.id, content: output })
                        }
                        pushLog(`工具调用完成，继续下一轮（${round + 2}/${MAX_TOOL_ROUNDS}）`, 'info')
                        continue
                    }

                    // 无工具调用 → 最终内容
                    if (result.content?.trim()) {
                        content = result.content
                    }
                    break
                }

                pushLog(
                    `流结束：content=${content.length} 字符, reasoning=${reasoning.length} 字符`,
                    'debug'
                )

                if (!content.trim()) {
                    push({ type: 'error', message: 'DeepSeek 未返回内容' })
                    return
                }

                let buffs: ReturnType<typeof sanitizeBuffs> | null = null
                let parseError: string | null = null
                try {
                    const parsed = JSON.parse(content) as { buffs?: unknown[] }
                    if (Array.isArray(parsed.buffs)) {
                        buffs = sanitizeBuffs(parsed.buffs as never)
                        pushLog(`解析成功，得到 ${buffs.length} 条可用 Buff`, buffs.length > 0 ? 'success' : 'error')
                    } else {
                        parseError = '返回结构缺少 buffs 数组'
                    }
                } catch {
                    parseError = '返回的不是合法 JSON'
                }

                push({ type: 'result', data: buffs, rawContent: content, parseError })
            } catch (e) {
                if (e instanceof DeepSeekError) {
                    push({ type: 'error', message: e.message, debug: e.debug })
                } else {
                    push({ type: 'error', message: e instanceof Error ? e.message : 'AI 生成失败' })
                }
            } finally {
                try {
                    controller.close()
                } catch {
                    /* already closed */
                }
            }
        }
    })

    return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' }
    })
}
