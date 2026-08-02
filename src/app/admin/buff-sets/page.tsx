import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import BuffSetsAdmin from '@/components/admin/buff-sets-admin'
import { createClient, hasEnv } from '@/lib/supabase/server'
import type { BuffSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: 'Buff 集管理'
}

export const dynamic = 'force-dynamic'

export default async function AdminBuffSetsPage() {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin/buff-sets')

    const { data } = await supabase
        .from('buff_sets')
        .select('entity_type, entity_name, buff_name, scope, exclusive, buff_set')
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
    const rows = (data ?? []) as BuffSetRow[]

    return (
        <div className="buff-admin-shell mx-auto max-w-6xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Buff 集管理</h1>
                <p className="mt-1 text-sm text-(--muted)">
                    左侧按整实体编辑，右侧从工具箱目录选择实体。保存即时发布。
                </p>
            </div>

            <BuffSetsAdmin rows={rows} />
        </div>
    )
}
