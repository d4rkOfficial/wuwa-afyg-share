import { getCloudflareContext } from '@opennextjs/cloudflare'

// 启动器安装包统一下载逻辑：文件放在 public/downloads/ 下，由静态资源绑定（ASSETS）取回后
// 以附件形式响应，浏览器只会保存为原始文件名，不会在页内打开。

type AssetFetcher = { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }

export interface LauncherFile {
    /** public/downloads 下的真实文件名（中文原名） */
    fileName: string
    /** Content-Disposition 里的 ASCII 兜底名 */
    asciiName: string
    /** 文件尚未上传时的提示文案 */
    missingHint: string
}

async function loadAsset(request: Request, assetPath: string): Promise<Response | null> {
    // 线上（Cloudflare Workers）：走静态资源绑定，与 worker 同源互不干扰
    try {
        const { env } = await getCloudflareContext({ async: true })
        const assets = (env as { ASSETS?: AssetFetcher }).ASSETS
        if (assets) {
            const res = await assets.fetch(new URL(assetPath, 'https://assets.local'))
            if (res.ok) return res
        }
    } catch {
        /* 本地开发或非 Cloudflare 环境：回落到下面 */
    }

    // 本地 next dev / next start：直接向同源静态路径取文件
    try {
        const res = await fetch(new URL(assetPath, request.url))
        if (res.ok) return res
    } catch {
        /* 取不到时返回 null */
    }

    return null
}

export async function respondWithLauncher(request: Request, file: LauncherFile): Promise<Response> {
    const asset = await loadAsset(request, `/downloads/${encodeURIComponent(file.fileName)}`)
    if (!asset) {
        return new Response(file.missingHint, {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
    }
    const length = asset.headers.get('content-length')
    if (length) headers['Content-Length'] = length

    return new Response(asset.body, { status: 200, headers })
}
