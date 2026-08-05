'use server'

import { requireAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface ActionResult {
    error?: string
}

const MAX_TITLE_LEN = 120
const MAX_LEN = 2000

export async function createAnnouncement(title: string, content: string): Promise<ActionResult> {
    const auth = await requireAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const t = title.trim().slice(0, MAX_TITLE_LEN)
    const c = content.trim().slice(0, MAX_LEN)
    if (!t) return { error: '公告标题不能为空' }
    if (!c) return { error: '公告详情不能为空' }
    const { error } = await auth.supabase.from('announcements').insert({ title: t, content: c })
    if (error) return { error: error.message }
    revalidatePath('/')
    return {}
}

export async function updateAnnouncement(id: string, title: string, content: string): Promise<ActionResult> {
    const auth = await requireAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const t = title.trim().slice(0, MAX_TITLE_LEN)
    const c = content.trim().slice(0, MAX_LEN)
    if (!t) return { error: '公告标题不能为空' }
    if (!c) return { error: '公告详情不能为空' }
    const { error } = await auth.supabase
        .from('announcements')
        .update({ title: t, content: c })
        .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
    return {}
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
    const auth = await requireAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const { error } = await auth.supabase.from('announcements').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
    return {}
}
