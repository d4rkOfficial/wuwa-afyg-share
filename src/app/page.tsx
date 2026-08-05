import Link from 'next/link'
import { Icon } from '@iconify/react'
import ProjectCard from '@/components/project-card'
import Pagination from '@/components/pagination'
import SetupNotice from '@/components/setup-notice'
import AnnouncementBar from '@/components/announcement-bar'
import { createClient, hasEnv } from '@/lib/supabase/server'
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
    const page = Math.max(1, parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1)

    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()

    let query = supabase
        .from('projects')
        .select(LIST_COLUMNS, { count: 'exact' })
        .eq('published', true)
        .not('author_id', 'is', null)
    if (q) query = query.ilike('title', `%${q}%`)
    query = query.order(sort === 'hot' ? 'clone_count' : 'created_at', { ascending: false })

    const from = (page - 1) * PER_PAGE
    const { data, count, error } = await query.range(from, from + PER_PAGE - 1)
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
        <div className="space-y-6">
            <AnnouncementBar announcements={announcements} isAdmin={isAdmin} />

            <div className="flex flex-wrap items-center gap-2">
                <form action="/" method="get" className="flex gap-2">
                    <input
                        type="search"
                        name="q"
                        defaultValue={q}
                        placeholder="搜索工程名称..."
                        className="w-56 rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
                    />
                    <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-(--btn-text)"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon="mdi:magnify" className="size-4" />
                        搜索
                    </button>
                </form>

                <div className="flex items-center gap-2">
                    {(
                        [
                            { key: 'latest', label: '最新', icon: 'mdi:clock-outline' },
                            { key: 'hot', label: '最热', icon: 'mdi:fire' }
                        ] as const
                    ).map(({ key, label, icon }) => {
                        const active = sort === key
                        const href = `/?sort=${key}&page=1${q ? `&q=${encodeURIComponent(q)}` : ''}`
                        return (
                            <Link
                                key={key}
                                href={href}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                                    active
                                        ? 'bg-(--accent) font-medium text-(--accent-fg)'
                                        : 'border border-(--card-border) bg-(--card) text-(--muted) hover:text-(--fg)'
                                }`}
                            >
                                <Icon icon={icon} className="size-4" />
                                {label}
                            </Link>
                        )
                    })}
                </div>
            </div>

            {error ? (
                <div className="rounded-xl border border-(--card-border) bg-(--card) p-8 text-center text-(--muted)">
                    加载失败：{error.message}
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-xl border border-(--card-border) bg-(--card) p-12 text-center">
                    <Icon icon={q ? 'mdi:magnify-close' : 'mdi:package-variant-closed'} className="mx-auto mb-3 size-10 text-(--muted)" />
                    <p className="font-medium">{q ? `没有找到「${q}」相关工程` : '这里还没有人分享工程'}</p>
                    <p className="mt-1 text-sm text-(--muted)">
                        {q ? '换个关键词试试，或发布你自己的工程' : '去工具箱导出你的拉表排轴工程，做第一个分享者'}
                    </p>
                    <Link
                        href="/upload"
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-(--btn-text)"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon="mdi:plus" className="size-4" />
                        上传工程
                    </Link>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {items.map((p) => (
                            <ProjectCard key={p.id} project={p} />
                        ))}
                    </div>
                    <Pagination page={page} totalPages={totalPages} q={q} sort={sort} />
                </>
            )}
        </div>
    )
}
