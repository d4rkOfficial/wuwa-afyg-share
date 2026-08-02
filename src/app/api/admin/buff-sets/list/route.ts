import { requireUser } from '@/lib/supabase/admin'
import { fetchToolList } from '@/lib/ai/info'
import { BUFF_ENTITY_TYPES } from '@/lib/consts/buff-zones'
import type { BuffEntityType } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

interface ListRequestBody {
    toolBase: string
    entityType: BuffEntityType
}

export async function POST(req: Request) {
    const auth = await requireUser()
    if (!auth.ok) {
        return new Response(JSON.stringify({ type: 'error', message: auth.error ?? '无权限' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    let body: ListRequestBody
    try {
        body = (await req.json()) as ListRequestBody
    } catch {
        return new Response(JSON.stringify({ type: 'error', message: '请求体不是合法 JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    const toolBase = (body.toolBase ?? '').trim()
    const entityType = body.entityType
    const validation =
        (!toolBase && '请先填入工具箱地址') ||
        (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number]) && '无效的实体类型')

    if (validation) {
        return new Response(JSON.stringify({ type: 'error', message: validation }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        async start(controller) {
            const push = (chunk: Uint8Array) => {
                try {
                    controller.enqueue(chunk)
                } catch {
                    /* stream closed */
                }
            }
            const pushLog = (text: string, level: 'info' | 'success' | 'error' | 'debug' = 'info') =>
                push(encoder.encode(JSON.stringify({ type: 'log', level, text }) + '\n'))

            try {
                const url = `${toolBase}/api/v1/list/${entityType === 'character' ? 'character' : entityType === 'weapon' ? 'weapon' : entityType === 'echo' ? 'echo' : 'echo-set'}`
                pushLog(`拉取工具箱目录：${url}`)
                const list = await fetchToolList(toolBase, entityType)
                pushLog(`目录获取成功，共 ${list.length} 条`, 'success')
                push(encoder.encode(JSON.stringify({ type: 'result', data: list }) + '\n'))
            } catch (e) {
                push(
                    encoder.encode(
                        JSON.stringify({ type: 'error', message: e instanceof Error ? e.message : '拉取实体目录失败' }) + '\n'
                    )
                )
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
