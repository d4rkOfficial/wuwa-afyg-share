// DeepSeek 官方 API 流式客户端（server-only，key 由前端管理员输入后透传）
import type { GeneratedBuff } from '@/lib/ai/types'
import { BUFF_ZONE_MAP, BUFF_REF_ZONE_MAP, BUFF_SCOPES } from '@/lib/consts/buff-zones'
import type { BuffScope } from '@/lib/types/db'

const DEEPSEEK_BASE = 'https://api.deepseek.com'
const MODEL = 'deepseek-v4-flash'
const TIMEOUT_MS = 240000
const MAX_TOKENS = 65536

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface ChatDelta {
    content?: string
    reasoning?: string
}

export interface ChatResult {
    content: string
    reasoning: string
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
        [k: string]: unknown
    }
    finishReason?: string
}

interface StreamChunk {
    choices?: Array<{
        delta?: { content?: string | null; reasoning_content?: string | null }
        finish_reason?: string | null
    }>
    usage?: ChatResult['usage']
    error?: { message?: string }
}

export class DeepSeekError extends Error {
    debug: string

    constructor(message: string, debug: string) {
        super(message)
        this.name = 'DeepSeekError'
        this.debug = debug
    }
}

export interface StreamOptions {
    onDelta?: (delta: ChatDelta) => void
    maxTokens?: number
}

export async function chatCompletionStream(
    apiKey: string,
    messages: ChatMessage[],
    options: StreamOptions = {}
): Promise<ChatResult> {
    if (!apiKey.trim()) throw new Error('未提供 DeepSeek API Key')

    const maxTokens = options.maxTokens ?? MAX_TOKENS
    let res: Response
    try {
        res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages,
                response_format: { type: 'json_object' },
                stream: true,
                stream_options: { include_usage: true },
                temperature: 0.3,
                max_tokens: maxTokens
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
    } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        if (err.includes('AbortError') || err.includes('TimeoutError')) {
            throw new DeepSeekError('DeepSeek 请求超时', '请求超时，请重试或换模型')
        }
        throw new DeepSeekError(`无法连接 DeepSeek：${err}`, err)
    }

    if (!res.ok) {
        let detail = ''
        try {
            const body = (await res.json()) as { error?: { message?: string } }
            detail = body?.error?.message ?? ''
        } catch {
            /* ignore */
        }
        throw new DeepSeekError(`DeepSeek 接口错误（HTTP ${res.status}）：${detail || res.statusText}`, `HTTP ${res.status}`)
    }

    if (!res.body) throw new DeepSeekError('DeepSeek 响应无 body', '响应无 body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let reasoning = ''
    let finishReason = ''
    let usage: ChatResult['usage'] | undefined

    try {
        for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue
                const payload = trimmed.slice(5).trim()
                if (payload === '[DONE]') continue
                let chunk: StreamChunk
                try {
                    chunk = JSON.parse(payload)
                } catch {
                    continue
                }
                if (chunk.error?.message) throw new DeepSeekError(`DeepSeek 流错误：${chunk.error.message}`, payload)
                const delta = chunk.choices?.[0]?.delta
                if (delta?.content) {
                    content += delta.content
                    options.onDelta?.({ content: delta.content })
                }
                if (delta?.reasoning_content) {
                    reasoning += delta.reasoning_content
                    options.onDelta?.({ reasoning: delta.reasoning_content })
                }
                if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason
                if (chunk.usage) usage = chunk.usage
            }
        }
    } catch (e) {
        if (e instanceof DeepSeekError) throw e
        const err = e instanceof Error ? e.message : String(e)
        throw new DeepSeekError(`读取流失败：${err}`, err)
    }

    return { content, reasoning, usage, finishReason: finishReason || undefined }
}

// 只保留白名单乘区、合法数值，避免脏数据
export function sanitizeBuffs(buffs: GeneratedBuff[]): GeneratedBuff[] {
    const out: GeneratedBuff[] = []
    const seen = new Set<string>()
    for (const b of buffs) {
        const name = b.buffName?.trim()
        if (!name || seen.has(name)) continue
        const zones = (Array.isArray(b.zones) ? b.zones : [])
            .filter((z) => z && BUFF_ZONE_MAP.has(z.zoneId) && Number.isFinite(z.value))
            .map((z) => ({
                zoneId: z.zoneId,
                value: z.value,
                ...(z.override ? { override: true } : {}),
                ...(sanitizeRef(z.ref) ? { ref: sanitizeRef(z.ref) } : {})
            }))
        if (!zones.length) continue
        const scope: BuffScope =
            b.scope && BUFF_SCOPES.includes(b.scope as BuffScope) ? (b.scope as BuffScope) : 'team'
        const exclusive = scope === 'effect_only' || !!b.exclusive
        seen.add(name)
        out.push({ buffName: name, scope, exclusive, zones })
    }
    return out
}

// 只保留白名单引用乘区、合法数值
function sanitizeRef(ref: GeneratedBuff['zones'][number]['ref']): GeneratedBuff['zones'][number]['ref'] | undefined {
    if (!ref || !BUFF_REF_ZONE_MAP.has(ref.targetZoneId)) return undefined
    if (!Number.isFinite(ref.pct)) return undefined
    const clean: NonNullable<GeneratedBuff['zones'][number]['ref']> = {
        targetZoneId: ref.targetZoneId,
        pct: ref.pct
    }
    if (Number.isFinite(ref.threshold)) clean.threshold = ref.threshold
    if (Number.isFinite(ref.lower)) clean.lower = ref.lower
    if (Number.isFinite(ref.upper)) clean.upper = ref.upper
    if (ref.discrete) clean.discrete = true
    if (Number.isFinite(ref.divisor)) clean.divisor = ref.divisor
    if (Number.isFinite(ref.multiplier)) clean.multiplier = ref.multiplier
    return clean
}
