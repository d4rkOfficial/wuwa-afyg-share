import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import SubstatSetsAdmin from '@/components/admin/substat-sets-admin'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import type { StandardSubstatSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: '标准词条集编辑'
}

export const dynamic = 'force-dynamic'

export default async function AdminSubstatSetsPage() {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin/substat-sets')

    const { isAdmin, locks } = await getViewerLocks()
    // 全局编辑锁关闭时，登录用户也能进编辑页（被单独锁定的角色仍只有管理员能改）
    const canEdit = isAdmin || !locks.substatSetsLocked
    if (!canEdit) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
                <h1 className="mg-title text-xl">无权限</h1>
                <p className="text-(--muted)">
                    标准词条集编辑当前处于锁定状态（仅管理员可编辑）。需要编辑请联系管理员，或在首页底部关闭标准词条集编辑锁。
                </p>
            </div>
        )
    }

    const { data } = await supabase
        .from('standard_substat_sets')
        .select('id, character_name, plan, note, updated_at')
        .order('character_name', { ascending: true })
    const rows = (data ?? []) as StandardSubstatSetRow[]

    return (
        <div className="buff-admin-shell mx-auto max-w-6xl space-y-6">
            <div className="border-b pb-4 mg-hairline">
                <h1 className="mg-title text-2xl md:text-3xl">
                    {isAdmin ? '标准词条集管理' : '标准词条集编辑'}
                </h1>
            </div>

            <SubstatSetsAdmin rows={rows} isAdmin={isAdmin} substatLocks={locks.substatLocks} />
        </div>
    )
}
