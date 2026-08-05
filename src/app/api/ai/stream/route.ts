import { requireUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// 允许转发的上游（opencode-go 等无 CORS 的 OpenAI 兼容网关）
const ALLOWED_ORIGINS = ['https://api.deepseek.com', 'https://opencode.ai']

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

    let allowed = false
    try {
        const u = new URL(baseUrl)
        allowed = ALLOWED_ORIGINS.some(
            (o) =>
                u.origin === o ||
                (o === 'https://opencode.ai' && u.hostname === 'opencode.ai' && u.pathname.startsWith('/zen/'))
        )
    } catch {
        /* 非法 URL */
    }
    if (!allowed) return json({ type: 'error', message: '服务地址不在允许列表' }, 400)

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
