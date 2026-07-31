'use server'

import { redirect } from 'next/navigation'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/utils/site'

export interface ActionResult {
    error?: string
}

export interface AuthSuccess extends ActionResult {
    ok: boolean
}

async function requireClient() {
    if (!hasEnv()) throw new Error('未配置 Supabase 环境变量')
    return await createClient()
}

export async function signInWithGithub(redirectTo = '/'): Promise<ActionResult> {
    const supabase = await requireClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(redirectTo)}` }
    })
    if (error) return { error: error.message }
    if (data.url) redirect(data.url)
    return { error: '登录失败，请重试' }
}

export async function signInWithMagicLink(email: string, redirectTo = '/'): Promise<ActionResult> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: '邮箱格式不正确' }
    const supabase = await requireClient()
    const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(redirectTo)}` }
    })
    if (error) return { error: error.message }
    return {}
}

export async function signOut(): Promise<void> {
    const supabase = await requireClient()
    await supabase.auth.signOut()
    redirect('/')
}
