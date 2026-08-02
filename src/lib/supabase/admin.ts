import { createClient, hasEnv } from '@/lib/supabase/server'

export interface AuthCheck {
    ok: boolean
    supabase: Awaited<ReturnType<typeof createClient>> | null
    user: { id: string } | null
    error?: string
}

async function createAuth(): Promise<AuthCheck> {
    if (!hasEnv()) return { ok: false, supabase: null, user: null, error: '服务未配置' }
    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, supabase, user: null, error: '请先登录' }
    return { ok: true, supabase, user: { id: user.id } }
}

// 登录即可（编辑 buff 集 / AI 生成 / 拉目录）
export async function requireUser(): Promise<AuthCheck> {
    return createAuth()
}

// 仅管理员（工程管理 / 后续管理功能）
export async function requireAdmin(): Promise<AuthCheck> {
    const auth = await createAuth()
    if (!auth.ok) return auth
    const { data: profile } = await auth.supabase!
        .from('profiles')
        .select('is_admin')
        .eq('id', auth.user!.id)
        .maybeSingle()
    if (!profile?.is_admin) return { ...auth, ok: false, error: '无权限：仅管理员可执行该操作' }
    return auth
}
