import { createClient, hasEnv } from '@/lib/supabase/server'

export interface AdminCheck {
    ok: boolean
    error?: string
}

// 供 server action 与 route handler 复用的管理员校验
export async function requireAdmin(): Promise<AdminCheck> {
    if (!hasEnv()) return { ok: false, error: '服务未配置' }
    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: '请先登录' }
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    if (!profile?.is_admin) return { ok: false, error: '无权限：仅管理员可编辑 Buff 集' }
    return { ok: true }
}
