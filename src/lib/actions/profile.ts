'use server'

import { revalidatePath } from 'next/cache'
import { createClient, hasEnv } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/actions/auth'

const USERNAME_RE = /^[\p{L}\p{N}_]+$/u

export async function updateUsername(raw: string): Promise<ActionResult> {
    if (!hasEnv()) return { error: '服务未配置' }
    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) return { error: '请先登录' }

    const username = raw.trim()
    if (username.length < 2 || username.length > 20) return { error: '用户名需为 2-20 个字符' }
    if (!USERNAME_RE.test(username)) return { error: '用户名只能包含中文、字母、数字、下划线' }

    const { error } = await supabase.from('profiles').upsert(
        { id: user.id, username },
        { onConflict: 'id' }
    )
    if (error) {
        if (error.code === '23505') return { error: '用户名已被占用' }
        return { error: error.message }
    }

    // 同步存量工程的作者名（author_name 为冗余列）
    await supabase.from('projects').update({ author_name: username }).eq('author_id', user.id)

    revalidatePath('/', 'layout')
    revalidatePath('/me')
    return {}
}
