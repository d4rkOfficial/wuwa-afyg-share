import { getLatestCharElements } from '@/lib/data/char-elements-latest'
import { CORS_HEADERS, handleOptions } from '@/lib/api/cors'

export { handleOptions as OPTIONS }

export const dynamic = 'force-dynamic'

export async function GET() {
    // 走带 TTL 缓存的版本：上游挂了也回静态快照而不是 502，工具箱侧不必处理错误分支
    const { version, elements } = await getLatestCharElements()
    return Response.json({ version, elements }, { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } })
}
