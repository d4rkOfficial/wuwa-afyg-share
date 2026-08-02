import { requireUser } from '@/lib/supabase/admin'
import { fetchToolInfo, prepareAiInfo } from '@/lib/ai/info'
import { chatCompletionStream, DeepSeekError, sanitizeBuffs, type ChatMessage } from '@/lib/ai/deepseek'
import { renderSystemPrompt, renderUserPrompt, DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE } from '@/lib/ai/prompts'
import { BUFF_ENTITY_TYPES } from '@/lib/consts/buff-zones'
import type { BuffEntityType } from '@/lib/types/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface AiRequestBody {
    apiKey: string
    toolBase: string
    entityType: BuffEntityType
    entityName: string
    systemPrompt?: string
    userPromptTemplate?: string
    slangDict?: string
    history?: ChatMessage[]
    newUserMessage?: string
}

function toolInfoEntity(entityType: BuffEntityType): string {
    if (entityType === 'character') return 'character'
    if (entityType === 'weapon') return 'weapon'
    if (entityType === 'echo') return 'echo'
    return 'echo-set'
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
    const userTemplate = body.userPromptTemplate?.trim() || DEFAULT_USER_PROMPT_TEMPLATE
    const slangDict = body.slangDict?.trim() || ''
    const history = Array.isArray(body.history) ? body.history : []
    const newUserMessage = body.newUserMessage?.trim() || ''

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

            pushLog(`开始：${entityType} / ${entityName}${newUserMessage ? '（追问）' : ''}`)

            try {
                // 组装消息：首轮渲染 info；追问用历史 + 新消息
                const systemContent = renderSystemPrompt(systemTemplate, slangDict)
                const messages: ChatMessage[] = [{ role: 'system', content: systemContent }]
                push({ type: 'prompt', kind: 'system', text: systemContent })

                const infoUrl = `${toolBase}/api/v1/info/${toolInfoEntity(entityType)}/${encodeURIComponent(entityName)}`
                pushLog(`拉取工具箱 info：${infoUrl}`)
                const info = await fetchToolInfo(toolBase, entityType, entityName)
                if (info === null) {
                    push({ type: 'error', message: `工具箱未找到「${entityName}」的信息` })
                    return
                }
                pushLog(`工具箱 info 获取成功（${JSON.stringify(info).length} 字符）`, 'success')

                const initialUser = renderUserPrompt(userTemplate, {
                    entityType,
                    entityName,
                    info: prepareAiInfo(entityType, info)
                })
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

                pushLog(`请求 DeepSeek（model=deepseek-v4-flash, max_tokens=65536, 消息数=${messages.length}）…`)

                let content = ''
                let reasoning = ''
                const result = await chatCompletionStream(apiKey, messages, {
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
                    `流结束：finish_reason=${result.finishReason ?? '(无)'}, content=${content.length} 字符, reasoning=${reasoning.length} 字符, usage=${result.usage ? JSON.stringify(result.usage) : '(无)'}`,
                    'debug'
                )

                if (!content.trim()) {
                    push({ type: 'error', message: 'DeepSeek 未返回内容', debug: `finish_reason=${result.finishReason ?? '(无)'}\nusage=${JSON.stringify(result.usage ?? {})}` })
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
