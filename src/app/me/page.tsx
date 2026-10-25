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

    return (
        <div className="workbench">
            {/* ── sidebar：账号 + 统计 + 操作 ── */}
            <aside className="workbench-sidebar" aria-label="账号">
                <UsernameEditor
                    initial={profile.username}
                    icons={icons}
                    projectCount={projects.length}
                />

                <div className="grid grid-cols-2 gap-1.5">
                    {[
                        { label: '工程', value: projects.length, tone: '' },
                        { label: '已过期', value: expiredCount, tone: expiredCount > 0 ? 'text-(--danger)' : '' },
                        { label: '总浏览', value: totalViews, tone: '' },
                        { label: '总克隆', value: totalClones, tone: '' }
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-sm border border-(--card-border) bg-(--card-hover) px-2.5 py-2 text-center"
                        >
                            <div className={`mg-num text-base ${stat.tone}`}>
                                {stat.value.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-(--muted)">{stat.label}</div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col gap-1.5 border-t border-(--card-border) pt-2">
                    <Link
                        href="/upload"
                        className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-(--card-border) bg-(--btn-bg) px-3 py-2 text-sm font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg)"
                    >
                        <Icon icon="mdi:plus" className="size-4" />
                        上传工程
                    </Link>
                    <ClearMyContent />
                    <form action={signOut}>
                        <button
                            type="submit"
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-(--card-border) bg-(--card) px-3 py-2 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                        >
                            <Icon icon="mdi:logout" className="size-4" />
                            退出登录
                        </button>
                    </form>
                </div>
            </aside>

            {/* ── 主内容区：我的工程 ── */}
            <section className="workbench-main space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3 mg-hairline">
                    <div>
                        <h1 className="mg-title text-xl">我的工程</h1>
                        <p className="mt-0.5 text-xs text-(--muted)">
                            共 <span className="mg-num text-(--fg)">{projects.length}</span> 个 · 点标题进分享页
                        </p>
                    </div>
                </div>

                {projects.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-(--card-border) p-8 text-center">
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
