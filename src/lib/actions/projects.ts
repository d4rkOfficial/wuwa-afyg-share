'use server'

import { revalidatePath } from 'next/cache'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { parseProjectFile, safeJsonParse } from '@/lib/project/parse'
import { extractTeamPreview } from '@/lib/project/extract'
import { generateCode } from '@/lib/utils/slug'
import { EXPORT_VERSION, type ProjectData } from '@/lib/types/project'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
}

export interface PublishInput {
    fileText: string
    description: string
    tags: string[]
    expiresDays: number | null
}

async function requireUser() {
    if (!hasEnv()) return { user: null, error: '服务未配置' }
    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) return { user: null, error: '请先登录' }
    return { supabase, user, error: null as string | null }
}

function sanitizeTags(tags: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of tags) {
        const tag = t.trim().slice(0, 12)
        if (tag && !seen.has(tag)) {
            seen.add(tag)
            out.push(tag)
        }
        if (out.length >= 8) break
    }
    return out
}

function authorName(user: { user_metadata?: Record<string, unknown>; email?: string | null }): string {
    const meta = user.user_metadata ?? {}
    const raw = (meta.name ?? meta.full_name ?? user.email?.split('@')[0]) as string | undefined
    return raw?.trim().slice(0, 20) || '匿名'
}

export async function publishProject(input: PublishInput): Promise<ActionResult<{ code: string }>> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase, user } = auth

    let project: ProjectData
    try {
        project = parseProjectFile(safeJsonParse(input.fileText))
    } catch (e) {
        return { error: e instanceof Error ? e.message : '解析失败' }
    }

    const preview = extractTeamPreview(project)
    const description = input.description.trim().slice(0, 500)
    const tags = sanitizeTags(input.tags)
    const expiresAt = input.expiresDays
        ? new Date(Date.now() + input.expiresDays * 86400000).toISOString()
        : null

    const file = { version: EXPORT_VERSION, exportedAt: Date.now(), project }
    const fileText = JSON.stringify(file)
    const fileSize = new TextEncoder().encode(fileText).length
    if (fileSize > 1024 * 1024) return { error: '工程文件超过 1MB 限制' }

    const name = project.name.trim()
    const author = authorName(user)

    for (let i = 0; i < 5; i++) {
        const code = generateCode()
        const { error } = await supabase
            .from('projects')
            .insert({
                code,
                author_id: user.id,
                author_name: author,
                title: name,
                description,
                tags,
                team_preview: preview,
                project_json: JSON.parse(fileText),
                file_size: fileSize,
                expires_at: expiresAt
            })
            .select('code')
            .single()
        if (!error) {
            revalidatePath('/')
            return { data: { code } }
        }
        if (error.code !== '23505') return { error: error.message }
    }
    return { error: '分享码生成冲突，请重试' }
}

export interface UpdateInput {
    title: string
    description: string
    tags: string[]
}

export async function updateProject(id: string, input: UpdateInput): Promise<ActionResult> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase } = auth

    const title = input.title.trim().slice(0, 60)
    if (!title) return { error: '标题不能为空' }

    const { error } = await supabase
        .from('projects')
        .update({
            title,
            description: input.description.trim().slice(0, 500),
            tags: sanitizeTags(input.tags)
        })
        .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
    revalidatePath('/me')
    return {}
}

export async function setExpiry(id: string, expiresAt: string | null): Promise<ActionResult> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase } = auth

    const { error } = await supabase.from('projects').update({ expires_at: expiresAt }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/me')
    return {}
}

export async function regenerateCode(id: string): Promise<ActionResult<{ code: string }>> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase } = auth

    for (let i = 0; i < 5; i++) {
        const code = generateCode()
        const { error } = await supabase.from('projects').update({ code }).eq('id', id)
        if (!error) return { data: { code } }
        if (error.code !== '23505') return { error: error.message }
    }
    return { error: '分享码生成冲突，请重试' }
}

export async function togglePublish(id: string): Promise<ActionResult<{ published: boolean }>> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase } = auth

    const { data, error } = await supabase
        .from('projects')
        .select('published')
        .eq('id', id)
        .single()
    if (error) return { error: error.message }

    const published = !data.published
    const { error: updError } = await supabase
        .from('projects')
        .update({ published })
        .eq('id', id)
    if (updError) return { error: updError.message }
    revalidatePath('/')
    revalidatePath('/me')
    return { data: { published } }
}

export async function deleteProject(id: string): Promise<ActionResult> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase } = auth

    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
    revalidatePath('/me')
    return {}
}

export async function toggleLike(projectId: string): Promise<ActionResult<{ liked: boolean }>> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase, user } = auth

    const { data: existing } = await supabase
        .from('likes')
        .select('project_id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle()

    if (existing) {
        const { error } = await supabase
            .from('likes')
            .delete()
            .eq('project_id', projectId)
            .eq('user_id', user.id)
        if (error) return { error: error.message }
        revalidatePath('/')
        return { data: { liked: false } }
    }

    const { error } = await supabase.from('likes').insert({ project_id: projectId, user_id: user.id })
    if (error) return { error: error.message }
    revalidatePath('/')
    return { data: { liked: true } }
}
