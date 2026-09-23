import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import SubstatSetsAdmin from '@/components/admin/substat-sets-admin'
import { createClient, hasEnv } from '@/lib/supabase/server'
import type { StandardSubstatSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: '标准词条集管理'
}

export const dynamic = 'force-dynamic'

export default async function AdminSubstatSetsPage() {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin/substat-sets')

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    const isAdmin = !!profile?.is_admin
    if (!isAdmin) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
                <h1 className="text-xl font-black tracking-tight">无权限</h1>
                <p className="text-(--muted)">仅管理员可访问标准词条集管理。</p>
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
            <div>
                <h1 className="text-2xl font-black tracking-tight">标准词条集管理</h1>
                <p className="mt-1 text-sm text-(--muted)">
                    每个角色一套标准 14 条副词条声骸配置。绝大部分角色由工具箱按角色数据本地生成，
                    这里只维护「特殊角色」的整份方案（5 个部位的主词条 + 副主词条 + 副词条全覆盖）。
                    保存后工具箱经 /api/substat-sets 公开拉取，用于一键把角色 5 个声骸改标准词条。
                </p>
            </div>

            <SubstatSetsAdmin rows={rows} />
        </div>
    )
}
