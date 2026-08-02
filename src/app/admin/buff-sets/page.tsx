import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Icon } from '@iconify/react'
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

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    if (!profile?.is_admin) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
                <Icon icon="mdi:shield-lock-outline" className="mx-auto size-12 text-(--muted)" />
                <h1 className="text-xl font-bold">无权限</h1>
                <p className="text-(--muted)">仅管理员可编辑 Buff 集内容。请确认你的账号已启用管理员权限。</p>
            </div>
        )
    }

    const { data } = await supabase
        .from('buff_sets')
        .select('entity_type, entity_name, buff_name, scope, exclusive, buff_set')
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
    const rows = (data ?? []) as BuffSetRow[]

    return (
        <div className="mx-auto max-w-6xl space-y-6">
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
