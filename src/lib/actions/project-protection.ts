'use server'

// 工程保护与批量删除（评论功能已下掉，仅保留工程维度）：
//  - setProjectProtected：作者本人或管理员设置/解除保护
//  - deleteMyContent：本人清空自己的全部工程（保护工程豁免）
//  - adminDeleteUserContent / adminUserSummary：管理员按用户名批量删除/统计

import { revalidatePath } from 'next/cache'
import { requireUser, requireAdmin } from '@/lib/supabase/admin'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
}

async function withUser() {
    const r = await requireUser()
    if (!r.ok || !r.supabase) return { supabase: null as never, user: null as never, error: r.error ?? '无权限' }
    return { supabase: r.supabase, user: r.user, error: null as string | null }
}

// 设置/解除工程保护状态（作者本人或管理员）
export async function setProjectProtected(projectId: string, isProtected: boolean): Promise<ActionResult> {
    const auth = await withUser()
    if (auth.error || !auth.supabase || !auth.user) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const { data: project } = await supabase
        .from('projects')
        .select('author_id')
        .eq('id', projectId)
        .maybeSingle()
    if (!project) return { error: '工程不存在' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', auth.user.id)
        .maybeSingle()
    const isAdmin = !!profile?.is_admin

    if (project.author_id !== auth.user.id && !isAdmin) {
        return { error: '仅工程作者或管理员可设置保护状态' }
    }

    const { error } = await supabase.from('projects').update({ protected: isProtected }).eq('id', projectId)
    if (error) return { error: error.message }
    revalidatePath('/me')
    return {}
}

// 本人清空全部工程（保护工程不受影响）
export async function deleteMyContent(): Promise<ActionResult<{ deletedProjects: number }>> {
    const auth = await withUser()
    if (auth.error || !auth.supabase || !auth.user) return { error: auth.error ?? '无权限' }

    const { data, error } = await auth.supabase.rpc('delete_user_content', { p_target: auth.user.id })
    if (error) return { error: error.message }
    const row = (data as [{ deleted_projects?: number }] | null)?.[0]
    revalidatePath('/')
    revalidatePath('/me')
    return { data: { deletedProjects: row?.deleted_projects ?? 0 } }
}

// 管理员：删除任意用户全部工程（按用户名；保护工程豁免）
export async function adminDeleteUserContent(
    username: string
): Promise<ActionResult<{ deletedProjects: number }>> {
    const auth = await requireAdmin()
    if (!auth.ok || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const name = username.trim().slice(0, 20)
    if (!name) return { error: '用户名不能为空' }
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', name)
        .maybeSingle()
    if (!profile) return { error: '用户不存在或尚未设置用户名' }

    const { data, error } = await supabase.rpc('delete_user_content', { p_target: profile.id })
    if (error) return { error: error.message }
    const row = (data as [{ deleted_projects?: number }] | null)?.[0]
    revalidatePath('/')
    revalidatePath('/admin/projects')
    return { data: { deletedProjects: row?.deleted_projects ?? 0 } }
}

// 管理员：查询某用户工程统计（二次确认弹窗展示用）
export async function adminUserSummary(
    username: string
): Promise<ActionResult<{ username: string; projectCount: number }>> {
    const auth = await requireAdmin()
    if (!auth.ok || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const name = username.trim().slice(0, 20)
    if (!name) return { error: '用户名不能为空' }
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', name)
        .maybeSingle()
    if (!profile) return { error: '用户不存在或尚未设置用户名' }

    const { count } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', profile.id)

    return { data: { username: profile.username, projectCount: count ?? 0 } }
}
