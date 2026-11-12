import { getLatestCharElements } from '@/lib/data/char-elements-latest'
import { CORS_HEADERS, handleOptions } from '@/lib/api/cors'

export { handleOptions as OPTIONS }

export const dynamic = 'force-dynamic'

export async function GET() {
    // 上游不可用时明确报 502（不再返回任何写死的兜底表）：工具箱侧有自己的本地缓存，失败即沿用旧数据
    const { version, elements } = await getLatestCharElements()
    if (!version) {
        return Response.json(
            { error: '角色数据上游暂不可用' },
            { status: 502, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } }
        )
    }
    return Response.json({ version, elements }, { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } })
}
