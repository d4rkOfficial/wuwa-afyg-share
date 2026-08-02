import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AdminProjects from '@/components/admin/admin-projects'
import { createClient, hasEnv } from '@/lib/supabase/server'

export const metadata: Metadata = {
    title: '工程管理'
}

export const dynamic = 'force-dynamic'

export default async function AdminProjectsPage() {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin/projects')

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    if (!profile?.is_admin) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
                <h1 className="text-xl font-bold">无权限</h1>
                <p className="text-(--muted)">仅管理员可访问工程管理。</p>
            </div>
        )
    }

    return (
        <div className="buff-admin-shell mx-auto max-w-6xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold">工程管理</h1>
                <p className="mt-1 text-sm text-(--muted)">
                    管理员可改名、调整过期时间、删除任意用户的分享工程。
                </p>
            </div>

            <AdminProjects />
        </div>
    )
}
