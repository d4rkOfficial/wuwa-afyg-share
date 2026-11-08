import '@/design/wk-overlay.css'
import '@/design/wk-tree.css'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AdminUsers from '@/components/wk/admin-users'
import { WkContainer, WkPageHead, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'

export const metadata: Metadata = {
    title: '管理员管理'
}

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
    if (!hasEnv()) {
        return (
            <WkRoot>
                <WkContainer>
                    <p className="wk-meta">服务未配置</p>
                </WkContainer>
            </WkRoot>
        )
    }

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin/users')

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    if (!profile?.is_admin) redirect('/')

    const [{ data: admins }, { data: grants }] = await Promise.all([
        supabase.from('profiles').select('id, username').eq('is_admin', true).order('created_at'),
        supabase.from('admin_grants').select('grantee_id, granted_by')
    ])
    const adminRows = (admins ?? []) as Array<{ id: string; username: string }>
    const grantRows = (grants ?? []) as Array<{ grantee_id: string; granted_by: string | null }>

    const granterIds = [...new Set(grantRows.map((grant) => grant.granted_by).filter((value): value is string => !!value))]
    const { data: granterRows } = granterIds.length
        ? await supabase.from('profiles').select('id, username').in('id', granterIds)
        : { data: [] }
    const nameById = new Map(
        [...adminRows, ...((granterRows ?? []) as Array<{ id: string; username: string }>)].map((admin) => [admin.id, admin.username])
    )

    const view = adminRows.map((admin) => {
        const edge = grantRows.find((grant) => grant.grantee_id === admin.id)
        return {
            id: admin.id,
            username: admin.username,
            grantedBy: edge?.granted_by ? (nameById.get(edge.granted_by) ?? null) : null,
            grantedByMe: edge?.granted_by === user.id
        }
    })

    return (
        <WkRoot>
            <WkContainer>
                <WkPageHead
                    title="管理员管理"
                    sub="按用户名授权管理员；仅授出者可收回自己的授权。被撤销的管理员，其授出的权限一并收回（连坐）。"
                />
                <div style={{ marginTop: 16, maxWidth: 720 }}>
                    <AdminUsers admins={view} />
                </div>
            </WkContainer>
        </WkRoot>
    )
}
