// AI 控制台的 Agent 循环（浏览器端）。
//
// 与「生成 Buff JSON」那条链路（ai/generate.ts）刻意分开：
// - 这里不解析 JSON、不做格式自动修复，AI 的产出是**工具调用 + 自然语言**；
// - 工具可以任意多轮（没有上限），唯一的刹车是停止按钮；
// - 每一个写操作由工具自己 await 人工审批（审批 UI 在 agent/console.tsx），
//   所以这里的 executeTool 可能就是「等一个人点按钮」。
//
// 可恢复：messages 每推进一步都由调用方持久化。页面中断后重跑时，
// 若最后一条是「带 tool_calls 的 assistant 但缺少对应 tool 结果」，会补一条「上次中断」的
// 工具结果再继续 —— 否则多数 OpenAI 兼容端点会直接 400。
import { AiClientError, chatCompletionStream, type ChatMessage } from '@/lib/ai/client'
import type { ToolDefinition } from '@/lib/ai/tools'
import type { AgentActivity, AgentTask, TaskStatus } from '@/lib/agent/types'

export interface RunAgentOptions {
    apiKey: string
    baseUrl?: string
    model?: string
    direct?: boolean
    reasoningEffort?: 'off' | 'low' | 'medium' | 'high'
    systemPrompt: string
    /** @desc 起点任务（messages 会被复制，不会就地改动调用方的对象） */
    task: AgentTask
    tools: ToolDefinition[]
    executeTool: (name: string, args: Record<string, unknown>) => Promise<{ text: string; raw?: unknown }>
    onActivity: (activity: AgentActivity) => void
    /** @desc 每推进一步都回传完整消息序列（调用方负责落 IndexedDB） */
    onMessages: (messages: ChatMessage[]) => void
    onStatus?: (status: TaskStatus, error?: string) => void
    signal?: AbortSignal
    /**
     * @desc 每轮请求前调用：调用方可以在这里按上下文用量压缩历史
     *  （返回压缩后的消息序列；返回原样就是不动）。
     */
    beforeRound?: (messages: ChatMessage[]) => Promise<ChatMessage[]>
}

/** @desc 补上「中断时缺失的工具结果」，保证消息序列对端点合法 */
export function repairInterruptedMessages(messages: ChatMessage[]): ChatMessage[] {
    const out = [...messages]
    const last = out[out.length - 1]
    if (!last || last.role !== 'assistant' || !last.tool_calls?.length) return out
    const answered = new Set(
        out
            .slice(out.length - last.tool_calls.length)
            .filter((m) => m.role === 'tool' && m.tool_call_id)
            .map((m) => m.tool_call_id as string)
    )
    for (const call of last.tool_calls) {
        if (answered.has(call.id)) continue
        out.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify({ interrupted: true, message: '上次执行被中断（页面关闭/刷新），该工具未真正执行' })
        })
    }
    return out
}

export async function runAgent(options: RunAgentOptions): Promise<{ content: string; messages: ChatMessage[] }> {
    const { tools, systemPrompt, onActivity, onMessages, signal } = options
    const emitStatus = (text: string) => onActivity({ kind: 'status', text })

    const reasoningEffort =
        options.reasoningEffort === 'low' || options.reasoningEffort === 'medium' || options.reasoningEffort === 'high'
            ? options.reasoningEffort
            : undefined

    let messages = repairInterruptedMessages(options.task.messages)
    // system 永远以最后一次装配为准（提示词可能升级过），历史里已有的 system 丢掉
    messages = messages.filter((m) => m.role !== 'system')
    messages = [{ role: 'system', content: systemPrompt }, ...messages]
    onMessages(messages)

    let toolCallTotal = 0

    for (let round = 1; ; round++) {
        if (signal?.aborted) throw new AiClientError('已停止', 'aborted')
        // 自动压缩钩子：每轮开始前都可能把历史压成摘要（上下文将满时）
        if (options.beforeRound) {
            const compacted = await options.beforeRound(messages)
            if (compacted !== messages) {
                messages = compacted
                onMessages(messages)
            }
        }
        emitStatus(`第 ${round} 轮请求…（累计工具调用 ${toolCallTotal} 次）`)

        let roundText = ''
        const result = await chatCompletionStream(options.apiKey, messages, {
            tools,
            reasoningEffort,
            baseUrl: options.baseUrl,
            model: options.model,
            direct: options.direct,
            signal,
            onDelta: (delta) => {
                if (delta.content) {
                    roundText += delta.content
                    onActivity({ kind: 'text', text: delta.content })
                }
                if (delta.reasoning) onActivity({ kind: 'reasoning', text: delta.reasoning })
            }
        })

        if (signal?.aborted) throw new AiClientError('已停止', 'aborted')

        // 有工具调用 → 逐个执行（写操作会在工具内部等审批），然后继续下一轮
        if (result.toolCalls && result.toolCalls.length > 0) {
            messages.push({
                role: 'assistant',
                content: result.content || '',
                tool_calls: result.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: { name: tc.name, arguments: tc.arguments }
                }))
            })
            onMessages(messages)

            for (const call of result.toolCalls) {
                if (signal?.aborted) throw new AiClientError('已停止', 'aborted')
                let args: Record<string, unknown> = {}
                try {
                    args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {}
                } catch {
                    args = {}
                }
                toolCallTotal += 1
                onActivity({ kind: 'tool', name: call.name, args })
                let text: string
                let ok = true
                try {
                    const out = await options.executeTool(call.name, args)
                    text = out.text
                    ok = !/"(error|rejected)"\s*:/.test(text.slice(0, 200))
                } catch (e) {
                    ok = false
                    text = JSON.stringify({ error: e instanceof Error ? e.message : '工具执行失败' })
                }
                onActivity({ kind: 'tool', name: call.name, args, ok, resultText: text })
                messages.push({ role: 'tool', tool_call_id: call.id, content: text })
                onMessages(messages)
            }
            emitStatus(`工具处理完毕，继续…`)
            continue
        }

        // 没有工具调用 = 本轮就是最终答复
        const content = (result.content?.trim() ? result.content : roundText).trim()
        messages.push({ role: 'assistant', content })
        onMessages(messages)
        return { content, messages }
    }
}
