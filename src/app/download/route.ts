import { getCloudflareContext } from '@opennextjs/cloudflare'

// 椰果工具箱启动器下载：文件放在 public/downloads/ 下，由静态资源绑定（ASSETS）取回后
// 以附件形式响应，浏览器只会保存为「椰果工具箱启动器.exe」，不会在页内打开。
export const dynamic = 'force-dynamic'

const FILE_NAME = '椰果工具箱启动器.exe'
const ASSET_PATH = `/downloads/${encodeURIComponent(FILE_NAME)}`
const ASCII_NAME = 'ye-guo-toolbox-launcher.exe'

type AssetFetcher = { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }

async function loadAsset(request: Request): Promise<Response | null> {
    // 线上（Cloudflare Workers）：走静态资源绑定，与 worker 同源互不干扰
    try {
        const { env } = await getCloudflareContext({ async: true })
        const assets = (env as { ASSETS?: AssetFetcher }).ASSETS
        if (assets) {
            const res = await assets.fetch(new URL(ASSET_PATH, 'https://assets.local'))
            if (res.ok) return res
        }
    } catch {
        /* 本地开发或非 Cloudflare 环境：回落到下面 */
    }

    // 本地 next dev / next start：直接向同源静态路径取文件
    try {
        const res = await fetch(new URL(ASSET_PATH, request.url))
        if (res.ok) return res
    } catch {
        /* 取不到时返回 null */
    }

    return null
}

export async function GET(request: Request) {
    const asset = await loadAsset(request)
    if (!asset) {
        return new Response('启动器文件缺失，请稍后重试或联系站务。', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${ASCII_NAME}"; filename*=UTF-8''${encodeURIComponent(FILE_NAME)}`,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
    }
    const length = asset.headers.get('content-length')
    if (length) headers['Content-Length'] = length

    return new Response(asset.body, { status: 200, headers })
}
