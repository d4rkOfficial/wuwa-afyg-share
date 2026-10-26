import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Icon } from '@iconify/react'
import ManageProjectRow from '@/components/manage-project-row'
import UsernameEditor from '@/components/username-editor'
import ClearMyContent from '@/components/clear-my-content'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { signOut } from '@/lib/actions/auth'
import { getAvatarIcons } from '@/lib/data/avatar-icons'
import { LIST_COLUMNS } from '@/lib/project/query'
import { isExpiredProject, isGracePeriod } from '@/lib/utils/expiry'
import type { ProjectListItem } from '@/lib/types/db'

export const metadata: Metadata = {
    title: '我的工程'
}

export const dynamic = 'force-dynamic'

export default async function MePage() {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/me')

    const { data } = await supabase
        .from('projects')
        .select(LIST_COLUMNS)
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
    const projects = (data ?? []) as ProjectListItem[]
    // 到期即算过期（含非匿名宽限期）
    const expiredCount = projects.filter(
        (p) => isExpiredProject(p.expires_at, p.author_name) || isGracePeriod(p.expires_at, p.author_name)
    ).length
    const totalViews = projects.reduce((s, p) => s + (p.view_count ?? 0), 0)
    const totalClones = projects.reduce((s, p) => s + (p.clone_count ?? 0), 0)

    const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()

    // 首次登录需先设置用户名（原由 middleware 强制）
    if (!profile?.username) redirect('/setup-username?redirect=/me')

    const icons = await getAvatarIcons()

    const stats = [
        { label: '工程', value: projects.length, tone: '' },
        { label: '已过期', value: expiredCount, tone: expiredCount > 0 ? 'text-(--danger)' : '' },
        { label: '总浏览', value: totalViews, tone: '' },
        { label: '总克隆', value: totalClones, tone: '' }
    ]

    return (
        <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
            {/* ── 账号区（移动端在上，桌面端吸顶在左） ── */}
            <aside className="space-y-3 lg:sticky lg:top-20">
                <UsernameEditor initial={profile.username} icons={icons} projectCount={projects.length} />

                {/* 统计：移动端一行四格自动换行，不占满整屏 */}
                <div className="grid grid-cols-4 gap-1.5">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-sm border border-(--card-border) bg-(--card) px-1.5 py-2 text-center"
                        >
                            <div className={`mg-num text-sm ${stat.tone}`}>{stat.value.toLocaleString()}</div>
                            <div className="mt-0.5 text-[10px] text-(--muted)">{stat.label}</div>
                        </div>
                    ))}
                </div>

                {/* 操作：竖排等宽（移动端也不会挤成一行） */}
                <div className="flex flex-col gap-1.5 [&>button]:w-full [&>button]:justify-center [&>button]:text-xs [&>form]:w-full">
                    <Link
                        href="/upload"
                        className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-(--card-border) bg-(--btn-bg) px-2 py-2 text-xs font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) lg:text-sm"
                    >
                        <Icon icon="mdi:plus" className="size-4 shrink-0" />
                        上传工程
                    </Link>
                    <ClearMyContent />
                    <form action={signOut}>
                        <button
                            type="submit"
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-(--card-border) bg-(--card) px-2 py-2 text-xs text-(--muted) transition-colors hover:text-(--fg) lg:text-sm"
                        >
                            <Icon icon="mdi:logout" className="size-4 shrink-0" />
                            退出登录
                        </button>
                    </form>
                </div>
            </aside>

            {/* ── 工程列表 ── */}
            <section className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-2.5 mg-hairline">
                    <div>
                        <h1 className="mg-title text-xl">我的工程</h1>
                        <p className="mt-0.5 text-xs text-(--muted)">
                            共 <span className="mg-num text-(--fg)">{projects.length}</span> 个 · 点标题进分享页
                        </p>
                    </div>
                    <Link
                        href="/upload"
                        className="hidden items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--card) px-3 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg) lg:inline-flex"
                    >
                        <Icon icon="mdi:plus" className="size-3.5" />
                        新建
                    </Link>
                </div>

                {projects.length === 0 ? (
                    <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-(--card-border) p-8 text-center">
                        <Icon icon="mdi:package-variant-closed" className="size-9 text-(--muted)" />
                        <p className="text-sm text-(--muted)">还没有上传过工程，去分享第一个吧</p>
                        <Link
                            href="/upload"
                            className="inline-flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--btn-bg) px-4 py-2 text-sm font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg)"
                        >
                            <Icon icon="mdi:plus" className="size-4" />
                            上传工程
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {projects.map((p) => (
                            <ManageProjectRow key={p.id} project={p} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
