'use server'

import { revalidatePath } from 'next/cache'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { parseProjectFile, safeJsonParse } from '@/lib/project/parse'
import { extractTeamPreview } from '@/lib/project/extract'
import { compressProjectText, assertRawSize } from '@/lib/project/compress'
import { generateCode } from '@/lib/utils/slug'
import { EXPORT_VERSION } from '@/lib/types/project'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
}

export interface PublishInput {
    fileText: string
    description: string
    tags: string[]
    expiresDays: number | null
    expiresAt?: string | null
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

function fallbackAuthorName(user: { user_metadata?: Record<string, unknown>; email?: string | null }): string {
    const meta = user.user_metadata ?? {}
    const raw = (meta.name ?? meta.full_name ?? user.email?.split('@')[0]) as string | undefined
    return raw?.trim().slice(0, 20) || '匿名'
}

// 解析 + 提取预览 + 压缩工程文件（发布与换源共用）
function prepareProjectFile(fileText: string) {
    const project = parseProjectFile(safeJsonParse(fileText))
    const preview = extractTeamPreview(project)
    const file = { version: EXPORT_VERSION, exportedAt: Date.now(), project }
    const text = JSON.stringify(file)
    const fileSize = new TextEncoder().encode(text).length
    assertRawSize(text)
    const { blobHex } = compressProjectText(text)
    return { project, preview, blobHex, fileSize }
}

export async function publishProject(input: PublishInput): Promise<ActionResult<{ code: string }>> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase, user } = auth

    let prep: ReturnType<typeof prepareProjectFile>
    try {
        prep = prepareProjectFile(input.fileText)
    } catch (e) {
        return { error: e instanceof Error ? e.message : '解析失败' }
    }
    const { project, preview, blobHex, fileSize } = prep

    const description = input.description.trim().slice(0, 500)
    const tags = sanitizeTags(input.tags)
    const expiresAt =
        input.expiresAt ??
        (input.expiresDays ? new Date(Date.now() + input.expiresDays * 86400000).toISOString() : null)

    const name = project.name.trim()
    const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()
    const author = profile?.username?.trim().slice(0, 20) || fallbackAuthorName(user)

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
                project_blob: blobHex,
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

// 工程换源：以新工程文件覆盖内容（保留分享码、简介、标签、有效期），更新标题
export async function replaceProjectFile(id: string, fileText: string): Promise<ActionResult> {
    const auth = await requireUser()
    if (!auth.user) return { error: auth.error ?? '请先登录' }
    const { supabase } = auth

    let prep: ReturnType<typeof prepareProjectFile>
    try {
        prep = prepareProjectFile(fileText)
    } catch (e) {
        return { error: e instanceof Error ? e.message : '解析失败' }
    }
    const { project, preview, blobHex, fileSize } = prep

    const { error } = await supabase
        .from('projects')
        .update({
            title: project.name.trim().slice(0, 60),
            team_preview: preview,
            project_blob: blobHex,
            file_size: fileSize
        })
        .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
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

    // 保护工程不可删除（含批量删除；需先解除保护）
    const { data: project } = await supabase
        .from('projects')
        .select('protected')
        .eq('id', id)
        .maybeSingle()
    if (!project) return { error: '工程不存在' }
    if (project.protected) return { error: '该工程处于保护状态，请先解除保护后再删除' }

    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/')
    revalidatePath('/me')
    return {}
}
