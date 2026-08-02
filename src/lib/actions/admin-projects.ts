'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/admin'
import type { ProjectListItem } from '@/lib/types/db'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
}

async function withAdmin() {
    const r = await requireAdmin()
    if (!r.ok || !r.supabase) return { supabase: null as never, error: r.error ?? '无权限' }
    return { supabase: r.supabase, error: null as string | null }
}

export interface AdminProjectQuery {
    q?: string
    page?: number
    pageSize?: number
}

export async function adminListProjects(query: AdminProjectQuery): Promise<ActionResult<{ items: ProjectListItem[]; total: number }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const q = (query.q ?? '').trim().slice(0, 60)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(50, Math.max(5, query.pageSize ?? 20))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let listQuery = supabase
        .from('projects')
        .select('id, code, author_id, author_name, title, description, tags, game_version, team_preview, published, expires_at, view_count, clone_count, created_at, updated_at', { count: 'exact' })
    if (q) {
        listQuery = listQuery.or(`title.ilike.%${q.replace(/[%_\\]/g, '\\$&')}%,code.ilike.%${q.replace(/[%_\\]/g, '\\$&')}%,author_name.ilike.%${q.replace(/[%_\\]/g, '\\$&')}%`)
    }
    const { data, count, error } = await listQuery
        .order('created_at', { ascending: false })
        .range(from, to)

    if (error) return { error: error.message }
    return { data: { items: (data ?? []) as ProjectListItem[], total: count ?? 0 } }
}

export async function adminUpdateProject(
    id: string,
    input: { title?: string; authorName?: string }
): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const patch: Record<string, string> = {}
    if (input.title !== undefined) {
        const title = input.title.trim().slice(0, 60)
        if (!title) return { error: '标题不能为空' }
        patch.title = title
    }
    if (input.authorName !== undefined) {
        const name = input.authorName.trim().slice(0, 20)
        if (!name) return { error: '作者名不能为空' }
        patch.author_name = name
    }
    if (Object.keys(patch).length === 0) return { error: '没有要更新的字段' }

    const { error } = await supabase.from('projects').update(patch).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
    revalidatePath('/me')
    return {}
}

export async function adminSetProjectExpiry(id: string, expiresAt: string | null): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const { error } = await supabase.from('projects').update({ expires_at: expiresAt }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
    revalidatePath('/me')
    return {}
}

export async function adminDeleteProject(id: string): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
    revalidatePath('/me')
    return {}
}
