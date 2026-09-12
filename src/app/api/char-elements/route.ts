import { fetchLatestCharElements } from '@/lib/data/char-elements-latest'
import { CORS_HEADERS, handleOptions } from '@/lib/api/cors'

export { handleOptions as OPTIONS }

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const { version, elements } = await fetchLatestCharElements()
        return Response.json(
            { version, elements },
            { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
        )
    } catch (error) {
        return Response.json(
            { error: error instanceof Error ? error.message : '角色数据获取失败' },
            { status: 502, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
        )
    }
}