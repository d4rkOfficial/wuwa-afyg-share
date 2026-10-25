import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import BuffSetsAdmin from '@/components/admin/buff-sets-admin'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import type { BuffSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: 'Buff 集编辑'
}

export const dynamic = 'force-dynamic'

export default async function AdminBuffSetsPage() {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin/buff-sets')

    const { isAdmin, locks } = await getViewerLocks()
    // 全局编辑锁关闭时，登录用户也能进编辑页（条目级锁仍由下面的网格逐个拦）
    const canEdit = isAdmin || !locks.buffSetsLocked
    if (!canEdit) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
                <h1 className="mg-title text-xl">无权限</h1>
                <p className="text-(--muted)">
                    Buff 集编辑当前处于锁定状态（仅管理员可编辑）。需要编辑请联系管理员，或在首页底部关闭 Buff 集编辑锁。
                </p>
            </div>
        )
    }

    const { data } = await supabase
        .from('buff_sets')
        .select('entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set')
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
    const rows = (data ?? []) as BuffSetRow[]

    return (
        <div className="buff-admin-shell mx-auto max-w-6xl space-y-6">
            <div className="border-b pb-4 mg-hairline">
                <h1 className="mg-title text-2xl md:text-3xl">{isAdmin ? 'Buff 集管理' : 'Buff 集编辑'}</h1>
                <p className="mt-1.5 mg-note">
                    左侧按角色/武器/声骸/套装选实体，右侧就地编辑该实体的 Buff（不再弹窗）。
                    {isAdmin
                        ? '管理员可保存/删除、逐个条目加锁；快照（根 + 版本链）仅管理员可用。'
                        : '编辑锁开启期间仅管理员可保存；被单独锁定的条目（左侧带锁图标）同样仅管理员可改。'}
                </p>
            </div>

            <BuffSetsAdmin rows={rows} isAdmin={isAdmin} buffLocks={locks.buffLocks} />
        </div>
    )
}
