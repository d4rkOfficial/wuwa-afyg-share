'use server'

// 管理员权限链管理：按用户名授权 / 仅授出者撤销（连坐收回）/ 权限树列表。
// 数据变更全部走 0003 的 definer RPC（grant_admin / revoke_admin），
// 本文件只做参数清洗与结果透传。

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/admin'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
}

async function withAdmin() {
    const r = await requireAdmin()
    if (!r.ok || !r.supabase) return { supabase: null as never, error: r.error ?? '无权限' }
    return { supabase: r.supabase, error: null as string | null }
}

export interface AdminView {
    id: string
    username: string
    grantedBy: string | null // 授权者用户名；null = 根管理员（不可撤销）
    grantedByMe: boolean
}

// 管理员列表 + 授权关系（权限树）
export async function adminListAdmins(): Promise<ActionResult<{ admins: AdminView[]; myId: string }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) return { error: '请先登录' }

    const [{ data: admins }, { data: grants }] = await Promise.all([
        supabase.from('profiles').select('id, username').eq('is_admin', true).order('created_at'),
        supabase.from('admin_grants').select('grantee_id, granted_by')
    ])
    const adminRows = (admins ?? []) as Array<{ id: string; username: string }>
    const grantRows = (grants ?? []) as Array<{ grantee_id: string; granted_by: string | null }>

    const nameById = new Map(adminRows.map((a) => [a.id, a.username]))
    const view = adminRows.map((a) => {
        const edge = grantRows.find((g) => g.grantee_id === a.id)
        const grantedBy = edge?.granted_by ? (nameById.get(edge.granted_by) ?? null) : null
        return {
            id: a.id,
            username: a.username,
            grantedBy,
            grantedByMe: edge?.granted_by === user.id
        }
    })

    return { data: { admins: view, myId: user.id } }
}

export async function adminGrantAdmin(usernameRaw: string): Promise<ActionResult<{ message: string }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const username = usernameRaw.trim().slice(0, 20)
    if (!username) return { error: '用户名不能为空' }

    const { data, error } = await auth.supabase.rpc('grant_admin', { p_username: username })
    if (error) return { error: error.message }
    revalidatePath('/admin/users')
    return { data: { message: String(data ?? '') } }
}

export async function adminRevokeAdmin(usernameRaw: string): Promise<ActionResult<{ message: string }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const username = usernameRaw.trim().slice(0, 20)
    if (!username) return { error: '用户名不能为空' }

    const { data, error } = await auth.supabase.rpc('revoke_admin', { p_username: username })
    if (error) return { error: error.message }
    revalidatePath('/admin/users')
    return { data: { message: String(data ?? '') } }
}
