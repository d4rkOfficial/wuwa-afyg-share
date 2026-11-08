import '@/design/wk-overlay.css'
import '@/design/wk-plaza.css'
import Link from 'next/link'
import ProjectCard from '@/components/wk/project-card'
import ProjectFilters from '@/components/wk/project-filters'
import Pagination from '@/components/wk/pagination'
import SetupNotice from '@/components/setup-notice'
import AnnouncementBar from '@/components/wk/announcement-bar'
import { WkContainer, WkEmpty, WkPageHead, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getLatestCharElements } from '@/lib/data/char-elements-latest'
import { getAvatarIcons } from '@/lib/data/avatar-icons'
import { LIST_COLUMNS } from '@/lib/project/query'
import { isExpiredProject } from '@/lib/utils/expiry'
import { formatCount } from '@/lib/utils/format'
import { getViewerLocks } from '@/lib/edit-locks'
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
    // 角色属性表只取一次：既用于校验筛选参数，也直接传给卡片与筛选条（客户端不再自己取）
    const { elements: characterElements } = await getLatestCharElements()
    const character = Object.hasOwn(characterElements, characterParam) ? characterParam : ''
    const page = Math.max(1, parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1)

    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()

    const from = (page - 1) * PER_PAGE
    let result
    if (q) {
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
    const items = ((data ?? []) as ProjectListItem[]).filter((project) => !isExpiredProject(project.expires_at, project.author_name))
    const totalPages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE))

    const [{ data: announcementRows }, charIcons, viewer] = await Promise.all([
        supabase.from('announcements').select('id, title, content, created_at').order('created_at', { ascending: false }),
        getAvatarIcons(),
        getViewerLocks()
    ])
    const announcements = (announcementRows ?? []) as AnnouncementRow[]
    // 访客没必要看一个「暂无公告」的空卡片占据首屏；管理员需要它作为发布入口
    const showAnnouncements = announcements.length > 0 || viewer.isAdmin

    const hasFilter = Boolean(q || character) || sort !== 'latest'

    // 空态文案与操作：先算清楚再渲染，避免 JSX 里堆四层三元
    const emptyTitle = hasFilter
        ? q
            ? `没有找到包含「${q}」的工程`
            : `没有找到队伍包含「${character}」的工程`
        : page > 1
          ? '这一页没有工程了'
          : '还没有人分享工程'
    const emptyHint = hasFilter
        ? '换个关键词或清除筛选试试'
        : page > 1
          ? '返回第一页看看最新的工程'
          : '去工具箱导出工程 JSON，做第一个分享者'
    const emptyAction = hasFilter ? (
        <Link href="/" className="wk-btn wk-btn--sm">
            清除筛选
        </Link>
    ) : page > 1 ? (
        <Link href="/" className="wk-btn wk-btn--sm">
            回到第一页
        </Link>
    ) : (
        <Link href={viewer.signedIn ? '/upload' : '/login?redirect=/upload'} className="wk-btn wk-btn--sm wk-btn--primary">
            上传工程
        </Link>
    )

    return (
        <WkRoot>
            <WkContainer>
                <WkPageHead
                    title="工程广场"
                    sub={
                        <>
                            分享、浏览和克隆《鸣潮》拉表排轴工程 · 共 <strong>{formatCount(count ?? 0)}</strong> 个工程
                        </>
                    }
                    actions={
                        <Link href={viewer.signedIn ? '/upload' : '/login?redirect=/upload'} className="wk-btn wk-btn--primary">
                            上传工程
                        </Link>
                    }
                />

                {showAnnouncements && (
                    <div style={{ marginTop: 16 }}>
                        <AnnouncementBar announcements={announcements} isAdmin={viewer.isAdmin} />
                    </div>
                )}

                <div style={{ marginTop: 16 }}>
                    <ProjectFilters q={q} sort={sort} character={character} elements={characterElements} />
                </div>

                {error ? (
                    <WkEmpty title="加载失败" hint={error.message} />
                ) : items.length === 0 ? (
                    <WkEmpty title={emptyTitle} hint={emptyHint} action={emptyAction} />
                ) : (
                    <>
                        <div className="wk-result-row">
                            <span>
                                共 {formatCount(count ?? 0)} 个结果
                                {q ? ` · 关键词「${q}」` : ''}
                                {character ? ` · 含角色「${character}」` : ''}
                                {sort === 'hot' ? ' · 按最热' : ''}
                            </span>
                        </div>
                        <div className="wk-grid-cards">
                            {items.map((project) => (
                                <ProjectCard key={project.id} project={project} icons={charIcons} elements={characterElements} />
                            ))}
                        </div>
                        <Pagination page={page} totalPages={totalPages} q={q} sort={sort} character={character} />
                    </>
                )}
            </WkContainer>
        </WkRoot>
    )
}
