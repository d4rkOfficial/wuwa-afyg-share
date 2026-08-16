import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AdminUsers from '@/components/admin/admin-users'
import { createClient, hasEnv } from '@/lib/supabase/server'

export const metadata: Metadata = {
    title: '管理员管理'
}

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin/users')

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    if (!profile?.is_admin) redirect('/')

    // 管理员列表 + 授权边（权限树）
    const [{ data: admins }, { data: grants }] = await Promise.all([
        supabase.from('profiles').select('id, username').eq('is_admin', true).order('created_at'),
        supabase.from('admin_grants').select('grantee_id, granted_by')
    ])
    const adminRows = (admins ?? []) as Array<{ id: string; username: string }>
    const grantRows = (grants ?? []) as Array<{ grantee_id: string; granted_by: string | null }>

    const granterIds = [...new Set(grantRows.map((g) => g.granted_by).filter((v): v is string => !!v))]
    const { data: granterRows } = granterIds.length
        ? await supabase.from('profiles').select('id, username').in('id', granterIds)
        : { data: [] }
    const nameById = new Map(
        [...adminRows, ...((granterRows ?? []) as Array<{ id: string; username: string }>)].map((a) => [a.id, a.username])
    )

    const view = adminRows.map((a) => {
        const edge = grantRows.find((g) => g.grantee_id === a.id)
        return {
            id: a.id,
            username: a.username,
            grantedBy: edge?.granted_by ? (nameById.get(edge.granted_by) ?? null) : null,
            grantedByMe: edge?.granted_by === user.id
        }
    })

    return (
        <div className="buff-admin-shell mx-auto max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold">管理员管理</h1>
                <p className="mt-1 text-sm text-(--muted)">
                    按用户名授权管理员；仅授出者可收回自己的授权。被撤销权限的管理员，其授出的权限一并收回（连坐）。
                </p>
            </div>

            <AdminUsers admins={view} />
        </div>
    )
}
