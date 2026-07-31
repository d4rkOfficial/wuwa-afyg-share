import { createClient, hasEnv } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseProjectFile, safeJsonParse } from '@/lib/project/parse'
import { extractTeamPreview } from '@/lib/project/extract'
import { generateCode } from '@/lib/utils/slug'
import { EXPORT_VERSION, type ProjectData } from '@/lib/types/project'
import { CORS_HEADERS, handleOptions } from '@/lib/api/cors'
import { siteUrl } from '@/lib/utils/site'

export { handleOptions as OPTIONS }

export async function GET(req: Request) {
    if (!hasEnv()) return Response.json({ error: '服务未配置' }, { status: 503, headers: CORS_HEADERS })
    const supabase = await createClient()

    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('perPage') ?? '12', 10) || 12))
    const q = (url.searchParams.get('q') ?? '').trim().replace(/[%_\\]/g, '\\$&')
    const sort = url.searchParams.get('sort') ?? 'newest'
    const excludeAnon = url.searchParams.get('excludeAnon') === '1'

    const now = new Date().toISOString()
    let query = supabase
        .from('projects')
        .select('id, code, author_name, title, tags, game_version, team_preview, created_at, clone_count, view_count', {
            count: 'exact'
        })
        .eq('published', true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)

    if (excludeAnon) query = query.not('author_id', 'is', null)

    if (q) query = query.or(`title.ilike.%${q}%,author_name.ilike.%${q}%`)

    if (sort === 'heat') query = query.order('clone_count', { ascending: false })
    query = query.order('created_at', { ascending: false })

    const from = (page - 1) * perPage
    const { data, count, error } = await query.range(from, from + perPage - 1)

    if (error) return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })

    const projects = (data ?? []).map((p) => ({
        id: p.id,
        code: p.code,
        title: p.title,
        authorName: p.author_name,
        tags: p.tags ?? [],
        gameVersion: p.game_version,
        teamPreview: p.team_preview,
        downloads: p.clone_count,
        createdAt: p.created_at
    }))
    return Response.json({ projects, total: count ?? 0, page, perPage }, { headers: CORS_HEADERS })
}

export async function POST(req: Request) {
    if (!hasEnv()) return Response.json({ error: '服务未配置' }, { status: 503, headers: CORS_HEADERS })
    const service = createServiceClient()
    if (!service) return Response.json({ error: '服务未配置' }, { status: 503, headers: CORS_HEADERS })

    let body: { fileText?: unknown }
    try {
        body = await req.json()
    } catch {
        return Response.json({ error: '请求格式错误' }, { status: 400, headers: CORS_HEADERS })
    }
    if (typeof body.fileText !== 'string' || !body.fileText.trim()) {
        return Response.json({ error: '缺少工程文件内容' }, { status: 400, headers: CORS_HEADERS })
    }

    let project: ProjectData
    try {
        project = parseProjectFile(safeJsonParse(body.fileText))
    } catch (e) {
        return Response.json(
            { error: e instanceof Error ? e.message : '解析失败' },
            { status: 400, headers: CORS_HEADERS }
        )
    }

    const preview = extractTeamPreview(project)
    const file = { version: EXPORT_VERSION, exportedAt: Date.now(), project }
    const fileText = JSON.stringify(file)
    const fileSize = new TextEncoder().encode(fileText).length
    if (fileSize > 1024 * 1024) {
        return Response.json({ error: '工程文件超过 1MB 限制' }, { status: 413, headers: CORS_HEADERS })
    }

    const name = project.name.trim().slice(0, 60) || '未命名工程'
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    for (let i = 0; i < 5; i++) {
        const code = generateCode()
        const { error } = await service
            .from('projects')
            .insert({
                code,
                author_id: null,
                author_name: '匿名',
                title: name,
                description: '',
                tags: [],
                team_preview: preview,
                project_json: JSON.parse(fileText),
                file_size: fileSize,
                published: true,
                expires_at: expiresAt
            })
            .select('code')
            .single()
        if (!error) {
            return Response.json(
                { code, url: `${siteUrl()}/share/${code}` },
                { status: 201, headers: CORS_HEADERS }
            )
        }
        if (error.code !== '23505') {
            return Response.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
        }
    }
    return Response.json({ error: '分享码生成冲突，请重试' }, { status: 500, headers: CORS_HEADERS })
}
