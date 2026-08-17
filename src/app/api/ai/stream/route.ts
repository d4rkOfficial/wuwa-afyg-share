import { requireUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// 白名单：即使是非 HTTPS / 回环地址也允许转发（通常用于本地自建网关，如 Ollama/vLLM）
const EXPLICIT_ALLOW = ['http://localhost:11434', 'http://localhost:8000']

// 明确禁止的 SSRF 目标 host（内网/回环/链路本地/元数据），避免被用来探测内网
const BLOCKED_HOST_NAMES = new Set([
    'localhost',
    '0.0.0.0',
    '127.0.0.1',
    '127.0.0.2',
    '::1',
    'fc00::',
    'fe80::',
    '169.254.169.254', // 云元数据
    'metadata.google.internal',
    'metadata'
])

interface StreamRequestBody {
    baseUrl?: string
    apiKey?: string
    body?: Record<string, unknown>
}

function json(data: unknown, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}

// 放行策略（方案 a）：默认允许公网 HTTPS；仅拦截明显不安全的 SSRF 目标。
// 非 HTTPS（含本地 http）必须显式在 EXPLICIT_ALLOW 内才放行。
function isAllowed(baseUrl: string): boolean {
    let u: URL
    try {
        u = new URL(baseUrl)
    } catch {
        return false
    }
    const host = u.hostname.toLowerCase()

    // 显式白名单（本地自建 http）优先放行
    if (EXPLICIT_ALLOW.includes(u.origin)) return true

    // 明确阻止内网/回环/链路本地/元数据
    const isLoopback =
        host === '::1' ||
        /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host)
    if (BLOCKED_HOST_NAMES.has(host) || isLoopback) return false

    // 公网地址必须 HTTPS
    return u.protocol === 'https:'
}

export async function POST(req: Request) {
    const auth = await requireUser()
    if (!auth.ok) {
        return json({ type: 'error', message: auth.error ?? '无权限' }, 401)
    }

    let input: StreamRequestBody
    try {
        input = (await req.json()) as StreamRequestBody
    } catch {
        return json({ type: 'error', message: '请求体不是合法 JSON' }, 400)
    }

    const baseUrl = (input.baseUrl ?? '').trim().replace(/\/+$/, '')
    const apiKey = (input.apiKey ?? '').trim()
    const body = input.body

    if (!apiKey) return json({ type: 'error', message: '缺少 API Key' }, 400)
    if (!body || typeof body !== 'object') return json({ type: 'error', message: '缺少请求体' }, 400)

    if (!isAllowed(baseUrl)) {
        return json({ type: 'error', message: '服务地址不在允许范围' }, 400)
    }

    let upstream: Response
    try {
        upstream = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        })
    } catch (e) {
        return json({ type: 'error', message: `上游请求失败：${e instanceof Error ? e.message : String(e)}` }, 502)
    }

    if (!upstream.ok) {
        const text = await upstream.text()
        return new Response(text, {
            status: upstream.status,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    // 流式透传上游 SSE
    return new Response(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store'
        }
    })
}
