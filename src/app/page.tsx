import Link from 'next/link'
import { Icon } from '@iconify/react'
import ProjectCard from '@/components/project-card'
import ProjectFilters from '@/components/project-filters'
import Pagination from '@/components/pagination'
import SetupNotice from '@/components/setup-notice'
import AnnouncementBar from '@/components/announcement-bar'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getProvider } from '@/lib/upstream'
import { CHAR_ELEMENTS } from '@/lib/data/char-elements'
import { LIST_COLUMNS } from '@/lib/project/query'
import { isExpiredProject } from '@/lib/utils/expiry'
import type { ProjectListItem, AnnouncementRow } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

const PER_PAGE = 12

export default async function HomePage({
    searchParams
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const sp = await searchParams
    const q = typeof sp.q === 'string' ? sp.q.trim() : ''
    const sort = typeof sp.sort === 'string' && sp.sort === 'hot' ? 'hot' : 'latest'
    const characterParam = typeof sp.character === 'string' ? sp.character.trim() : ''
    const character = Object.hasOwn(CHAR_ELEMENTS, characterParam) ? characterParam : ''
    const page = Math.max(1, parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1)

    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()

    const from = (page - 1) * PER_PAGE
    let result
    if (q) {
        // 文本搜索走 RPC：跨 title / description / author_name / tags / team_preview.names 模糊匹配
        // （仅 q 非空时调用；函数未建到库时会报错，但不影响无关键词的浏览路径）
        result = await supabase
            .rpc('search_projects', { p_q: q, p_character: character, p_sort: sort }, { count: 'exact' })
            .select(LIST_COLUMNS)
            .range(from, from + PER_PAGE - 1)
    } else {
        let query = supabase
            .from('projects')
            .select(LIST_COLUMNS, { count: 'exact' })
            .eq('published', true)
            .not('author_id', 'is', null)
        if (character) query = query.contains('team_preview', { names: [character] })
        query = query.order(sort === 'hot' ? 'clone_count' : 'created_at', { ascending: false })
        result = await query.range(from, from + PER_PAGE - 1)
    }
    const { data, count, error } = result
    // 应用层按有效期限（含非匿名宽限一周）过滤，已失效工程不展示
    const items = ((data ?? []) as ProjectListItem[]).filter(
        (p) => !isExpiredProject(p.expires_at, p.author_name)
    )
    const totalPages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE))

    // 公告（公开读，表未建时兜底为空）
    const { data: announcementRows } = await supabase
        .from('announcements')
        .select('id, title, content, created_at')
        .order('created_at', { ascending: false })
    const announcements = (announcementRows ?? []) as AnnouncementRow[]

    // 角色头像（上游 nanoka CDN；失败时用占位图兜底，不影响列表展示）
    let charIcons: Record<string, string> = {}
    try {
        charIcons = await getProvider().getCharacterIcons()
    } catch {
        /* 上游不可用时静默降级 */
    }

    // 当前用户是否管理员（决定公告栏是否显示编辑入口）
    const {
        data: { user }
    } = await supabase.auth.getUser()
    let isAdmin = false
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .maybeSingle()
        isAdmin = !!profile?.is_admin
    }

    return (
        <div className="space-y-8 md:space-y-10">
            <AnnouncementBar announcements={announcements} isAdmin={isAdmin} />

            <ProjectFilters key={`${q}:${sort}:${character}`} q={q} sort={sort} character={character} />

            {error ? (
                <div className="rounded-none border-2 border-(--card-border) bg-(--card) p-8 text-center text-(--muted)">
                    加载失败：{error.message}
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-none border-2 border-(--card-border) bg-(--card) p-12 text-center">
                    <Icon icon={q || character ? 'mdi:account-search-outline' : 'mdi:package-variant-closed'} className="mx-auto mb-3 size-10 text-(--muted)" />
                    <p className="font-medium">
                        {q || character
                            ? `没有找到${q ? `包含「${q}」` : ''}${q && character ? '且' : ''}${character ? `队伍包含「${character}」` : ''}的工程`
                            : '这里还没有人分享工程'}
                    </p>
                    <p className="mt-1 text-sm text-(--muted)">
                        {q || character ? '调整筛选条件试试，或发布你自己的工程' : '去工具箱导出你的拉表排轴工程，做第一个分享者'}
                    </p>
                    <Link
                        href="/upload"
                        className="mt-4 inline-flex items-center gap-1.5 rounded-none px-4 py-2 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg)"
                    >
                        <Icon icon="mdi:plus" className="size-4" />
                        上传工程
                    </Link>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((p) => (
                            <ProjectCard key={p.id} project={p} icons={charIcons} />
                        ))}
                    </div>
                    <Pagination page={page} totalPages={totalPages} q={q} sort={sort} character={character} />
                </>
            )}
        </div>
    )
}
