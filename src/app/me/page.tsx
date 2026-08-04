import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Icon } from '@iconify/react'
import ManageProjectRow from '@/components/manage-project-row'
import UsernameEditor from '@/components/username-editor'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { signOut } from '@/lib/actions/auth'
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

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            {profile?.username && <UsernameEditor initial={profile.username} />}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">我的工程</h1>
                    <p className="mt-1 text-sm text-(--muted)">共 {projects.length} 个</p>
                </div>
                <div className="flex gap-2">
                    <form action={signOut}>
                        <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-(--card-border) bg-(--card) px-3 py-2 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                        >
                            <Icon icon="mdi:logout" className="size-4" />
                            退出登录
                        </button>
                    </form>
                    <Link
                        href="/upload"
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-(--btn-text)"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon="mdi:plus" className="size-4" />
                        上传工程
                    </Link>
                </div>
            </div>

            {projects.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-(--card-border) bg-(--card) p-3 text-center">
                        <div className="text-lg font-bold tabular-nums">{projects.length}</div>
                        <div className="text-xs text-(--muted)">工程</div>
                    </div>
                    <div className="rounded-xl border border-(--card-border) bg-(--card) p-3 text-center">
                        <div className="text-lg font-bold tabular-nums text-red-400">{expiredCount}</div>
                        <div className="text-xs text-(--muted)">已过期</div>
                    </div>
                    <div className="rounded-xl border border-(--card-border) bg-(--card) p-3 text-center">
                        <div className="text-lg font-bold tabular-nums">{totalViews.toLocaleString()}</div>
                        <div className="text-xs text-(--muted)">总浏览</div>
                    </div>
                    <div className="rounded-xl border border-(--card-border) bg-(--card) p-3 text-center">
                        <div className="text-lg font-bold tabular-nums">{totalClones.toLocaleString()}</div>
                        <div className="text-xs text-(--muted)">总克隆</div>
                    </div>
                </div>
            )}

            {projects.length === 0 ? (
                <div className="rounded-xl border border-(--card-border) bg-(--card) p-12 text-center text-(--muted)">
                    还没有上传过工程，去分享第一个吧
                </div>
            ) : (
                <div className="space-y-3">
                    {projects.map((p) => (
                        <ManageProjectRow key={p.id} project={p} />
                    ))}
                </div>
            )}
        </div>
    )
}
