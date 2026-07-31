import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Icon } from '@iconify/react'
import ManageProjectRow from '@/components/manage-project-row'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { signOut } from '@/lib/actions/auth'
import { LIST_COLUMNS } from '@/lib/project/query'
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

    return (
        <div className="mx-auto max-w-3xl space-y-6">
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
