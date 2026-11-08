// AI 控制台的工程（/admin/projects、/me）域工具。
//
// 权限口径（与 /me 页面一致）：
// - 非管理员只能动**自己发布**的工程；管理员可动全部。
// - 被「保护」的工程：**不能删除**，但可以改标题/简介/标签/有效期/换源/换码。
// - 换码会让旧分享链接立即失效、换源会替换工程文件内容 —— 这两类在审批卡里必须写清楚。
// - 没有任何改编辑锁的工具（编辑锁只有管理员在界面上能改）。
import { createClient } from '@/lib/supabase/client'
import { deleteProject, regenerateCode, replaceProjectFile, setExpiry, updateProject } from '@/lib/actions/projects'
import { setProjectProtected } from '@/lib/actions/project-protection'
import type { AgentRole, ApprovalDiffField, ApprovalRequest } from '@/lib/agent/types'
import type { ToolDefinition } from '@/lib/ai/tools'
import type { ProjectListItem } from '@/lib/types/db'

export interface ProjectToolContext {
    role: AgentRole
    /** @desc 当前登录用户 id（非管理员时用于限定「自己的工程」） */
    userId: string | null
    requestApproval: (req: Omit<ApprovalRequest, 'id' | 'createdAt'>) => Promise<boolean | { approved: boolean; comment?: string }>
    skipApproval?: boolean
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const asStringArray = (v: unknown): string[] | null =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : null

const LIST_COLUMNS =
    'id, code, author_id, author_name, title, description, tags, game_version, team_preview, published, expires_at, view_count, clone_count, created_at, updated_at, protected'

async function loadProject(idOrCode: string): Promise<ProjectListItem | null> {
    const supabase = createClient()
    const byId = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(idOrCode)
    const q = supabase.from('projects').select(LIST_COLUMNS)
    const { data } = byId ? await q.eq('id', idOrCode).maybeSingle() : await q.eq('code', idOrCode).maybeSingle()
    return (data as ProjectListItem | null) ?? null
}

/** @desc 非管理员只能动自己的工程 */
function assertOwnership(ctx: ProjectToolContext, project: ProjectListItem): string | null {
    if (ctx.role === 'admin') return null
    if (!ctx.userId || project.author_id !== ctx.userId) {
        return `这个工程属于「${project.author_name}」，你只能修改自己发布的工程（管理员可改全部）。`
    }
    return null
}

async function approve(
    ctx: ProjectToolContext,
    req: Omit<ApprovalRequest, 'id' | 'createdAt'>
): Promise<{ ok: true } | { ok: false; text: string }> {
    if (ctx.skipApproval) return { ok: true }
    const decision = await ctx.requestApproval(req)
    const approved = typeof decision === 'boolean' ? decision : decision.approved
    const comment = typeof decision === 'boolean' ? '' : (decision.comment ?? '')
    if (!approved) {
        return { ok: false, text: `人工拒绝了该操作${comment ? `：${comment}` : ''}。请调整方案后重新提议，不要重复提交相同操作。` }
    }
    return { ok: true }
}

const short = (v: string | null | undefined, n = 120): string => {
    const s = (v ?? '').replace(/\s+/g, ' ').trim()
    return s.length > n ? `${s.slice(0, n)}…` : s
}

const field = (label: string, from?: string, to?: string): ApprovalDiffField => ({ label, from, to })

export const PROJECT_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'list_projects',
            description:
                '列出工程（管理员看全部，普通用户只看自己的）。可按关键词过滤（标题/简介/分享码/作者）。用于定位要改的工程 id。',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: '关键词（可选）' },
                    onlyExpired: { type: 'boolean', description: '只列已过期/宽限期（可选）' },
                    limit: { type: 'number', description: '返回条数上限，默认 50，最多 200' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_project',
            description: '按 id 或分享码读取单个工程的详情（标题/简介/标签/有效期/保护状态/字数统计）。',
            parameters: {
                type: 'object',
                properties: { idOrCode: { type: 'string', description: '工程 id 或分享码' } },
                required: ['idOrCode']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_project',
            description: '改工程的标题 / 简介 / 标签（只传要改的字段）。需要人工审批并给出字段级 diff。',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    title: { type: 'string', description: '标题（≤60 字）' },
                    description: { type: 'string', description: '简介（≤500 字）' },
                    tags: { type: 'array', items: { type: 'string' }, description: '标签数组（不可超过 8 个）' }
                },
                required: ['id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_project_expiry',
            description: '设置工程有效期：传 ISO 时间字符串、或 "permanent"（永久）、或 "now"（立即过期）。',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    expiresAt: { type: 'string', description: 'ISO 时间 / permanent / now' }
                },
                required: ['id', 'expiresAt']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_project_protected',
            description: '开关工程的「保护」：保护后批量删除/单条删除/过期清理都跳过它，但字段仍可修改。',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    protected: { type: 'boolean', description: 'true = 保护，false = 解除保护' }
                },
                required: ['id', 'protected']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'regenerate_project_code',
            description: '重新生成分享码：⚠️ 旧分享链接会立即失效。',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'replace_project_file',
            description: '换源：用新的工程 JSON 文本整体替换工程文件内容（分享码/标题/简介/标签/有效期保持不变）。',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    fileText: { type: 'string', description: '完整工程 JSON 文本' }
                },
                required: ['id', 'fileText']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_project',
            description: '删除工程：⚠️ 不可恢复、分享链接失效。被保护的工程不能删除（先解除保护）。',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id']
            }
        }
    }
]

export async function executeProjectTool(
    ctx: ProjectToolContext,
    name: string,
    args: Record<string, unknown>
): Promise<{ text: string }> {
    switch (name) {
        case 'list_projects': {
            const supabase = createClient()
            const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200)
            let q = supabase.from('projects').select(LIST_COLUMNS).order('created_at', { ascending: false })
            if (ctx.role !== 'admin') {
                if (!ctx.userId) return { text: JSON.stringify({ error: '请先登录' }) }
                q = q.eq('author_id', ctx.userId)
            }
            const query = str(args.query)
            if (query) {
                const escaped = query.replace(/[%_\\]/g, '\\$&')
                q = q.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%,code.ilike.%${escaped}%,author_name.ilike.%${escaped}%`)
            }
            const { data, error } = await q.limit(limit)
            if (error) return { text: JSON.stringify({ error: error.message }) }
            const now = Date.now()
            let rows = (data ?? []) as ProjectListItem[]
            if (args.onlyExpired === true) rows = rows.filter((r) => r.expires_at && new Date(r.expires_at).getTime() <= now)
            return {
                text: JSON.stringify({
                    total: rows.length,
                    rows: rows.map((r) => ({
                        id: r.id,
                        code: r.code,
                        title: r.title,
                        author: r.author_name,
                        tags: r.tags,
                        expiresAt: r.expires_at,
                        expired: !!r.expires_at && new Date(r.expires_at).getTime() <= now,
                        protected: r.protected,
                        views: r.view_count,
                        clones: r.clone_count
                    }))
                })
            }
        }
        case 'get_project': {
            const project = await loadProject(str(args.idOrCode))
            if (!project) return { text: JSON.stringify({ error: '没有找到这个工程（id 或分享码不对）' }) }
            return {
                text: JSON.stringify({
                    id: project.id,
                    code: project.code,
                    title: project.title,
                    description: project.description,
                    tags: project.tags,
                    author: project.author_name,
                    expiresAt: project.expires_at,
                    protected: project.protected,
                    published: project.published,
                    views: project.view_count,
                    clones: project.clone_count,
                    createdAt: project.created_at,
                    updatedAt: project.updated_at,
                    team: project.team_preview?.names ?? []
                })
            }
        }
        case 'update_project': {
            const project = await loadProject(str(args.id))
            if (!project) return { text: JSON.stringify({ error: '没有找到这个工程' }) }
            const ownErr = assertOwnership(ctx, project)
            if (ownErr) return { text: JSON.stringify({ error: ownErr }) }

            const title = args.title === undefined ? project.title : str(args.title)
            const description = args.description === undefined ? project.description : String(args.description ?? '').trim()
            const tags = args.tags === undefined ? project.tags : (asStringArray(args.tags) ?? [])
            if (!title) return { text: JSON.stringify({ error: '标题不能为空' }) }
            if (title.length > 60) return { text: JSON.stringify({ error: '标题最多 60 字' }) }
            if (description.length > 500) return { text: JSON.stringify({ error: '简介最多 500 字' }) }
            if (tags.length > 8) return { text: JSON.stringify({ error: '标签最多 8 个' }) }

            const fields: ApprovalDiffField[] = []
            if (title !== project.title) fields.push(field('标题', short(project.title), short(title)))
            if (description !== project.description) fields.push(field('简介', short(project.description), short(description)))
            if (JSON.stringify(tags) !== JSON.stringify(project.tags)) {
                fields.push(field('标签', project.tags.join('、') || '（空）', tags.join('、') || '（空）'))
            }
            if (fields.length === 0) return { text: JSON.stringify({ ok: true, unchanged: true }) }

            const gate = await approve(ctx, {
                toolName: name,
                title: '修改工程信息',
                target: `project / ${project.title}`,
                diff: [{ kind: 'update', name: `${project.code} ${project.title}`, detail: '字段变更', fields }],
                payload: { id: project.id, title, description, tags }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await updateProject(project.id, { title, description, tags })
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, id: project.id }) }
        }
        case 'set_project_expiry': {
            const project = await loadProject(str(args.id))
            if (!project) return { text: JSON.stringify({ error: '没有找到这个工程' }) }
            const ownErr = assertOwnership(ctx, project)
            if (ownErr) return { text: JSON.stringify({ error: ownErr }) }

            const raw = str(args.expiresAt)
            let next: string | null = null
            if (raw === 'permanent' || raw === '') next = null
            else if (raw === 'now') next = new Date().toISOString()
            else {
                const d = new Date(raw)
                if (Number.isNaN(d.getTime())) return { text: JSON.stringify({ error: 'expiresAt 不是合法时间（用 ISO 或 permanent/now）' }) }
                next = d.toISOString()
            }
            const from = project.expires_at ? new Date(project.expires_at).toLocaleString('zh-CN') : '永久'
            const to = next ? new Date(next).toLocaleString('zh-CN') : '永久'
            if (from === to) return { text: JSON.stringify({ ok: true, unchanged: true }) }

            const gate = await approve(ctx, {
                toolName: name,
                title: '修改工程有效期',
                target: `project / ${project.title}`,
                diff: [{ kind: 'update', name: project.code, fields: [field('有效期', from, to)] }],
                payload: { id: project.id, expiresAt: next }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await setExpiry(project.id, next)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, expiresAt: next }) }
        }
        case 'set_project_protected': {
            const project = await loadProject(str(args.id))
            if (!project) return { text: JSON.stringify({ error: '没有找到这个工程' }) }
            const ownErr = assertOwnership(ctx, project)
            if (ownErr) return { text: JSON.stringify({ error: ownErr }) }
            const next = args.protected === true
            if (next === project.protected) return { text: JSON.stringify({ ok: true, unchanged: true }) }

            const gate = await approve(ctx, {
                toolName: name,
                title: next ? '开启工程保护' : '解除工程保护',
                target: `project / ${project.title}`,
                diff: [
                    {
                        kind: 'update',
                        name: project.code,
                        fields: [field('保护', project.protected ? '已保护' : '未保护', next ? '已保护' : '未保护')]
                    }
                ],
                payload: { id: project.id, protected: next }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await setProjectProtected(project.id, next)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, protected: next }) }
        }
        case 'regenerate_project_code': {
            const project = await loadProject(str(args.id))
            if (!project) return { text: JSON.stringify({ error: '没有找到这个工程' }) }
            const ownErr = assertOwnership(ctx, project)
            if (ownErr) return { text: JSON.stringify({ error: ownErr }) }

            const gate = await approve(ctx, {
                toolName: name,
                title: '重新生成分享码（旧链接将失效）',
                target: `project / ${project.title}`,
                diff: [{ kind: 'update', name: project.code, fields: [field('分享码', project.code, '将由系统重新生成')] }],
                payload: { id: project.id }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await regenerateCode(project.id)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, newCode: res.data?.code }) }
        }
        case 'replace_project_file': {
            const project = await loadProject(str(args.id))
            if (!project) return { text: JSON.stringify({ error: '没有找到这个工程' }) }
            const ownErr = assertOwnership(ctx, project)
            if (ownErr) return { text: JSON.stringify({ error: ownErr }) }
            const fileText = typeof args.fileText === 'string' ? args.fileText : ''
            if (!fileText.trim()) return { text: JSON.stringify({ error: 'fileText 不能为空' }) }
            let parsedName = ''
            try {
                const parsed = JSON.parse(fileText) as { project?: { name?: string } }
                parsedName = parsed?.project?.name ?? ''
            } catch {
                return { text: JSON.stringify({ error: 'fileText 不是合法 JSON，换源前请先修好' }) }
            }

            const gate = await approve(ctx, {
                toolName: name,
                title: '换源（替换工程文件内容）',
                target: `project / ${project.title}`,
                diff: [
                    {
                        kind: 'update',
                        name: project.code,
                        fields: [
                            field('文件', `${project.title} 的现有工程文件`, `新文件（${(fileText.length / 1024).toFixed(1)} KB${parsedName ? `，名称：${parsedName}` : ''}）`)
                        ]
                    }
                ],
                payload: { id: project.id, bytes: fileText.length, projectName: parsedName }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await replaceProjectFile(project.id, fileText)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, bytes: fileText.length }) }
        }
        case 'delete_project': {
            const project = await loadProject(str(args.id))
            if (!project) return { text: JSON.stringify({ error: '没有找到这个工程' }) }
            const ownErr = assertOwnership(ctx, project)
            if (ownErr) return { text: JSON.stringify({ error: ownErr }) }
            if (project.protected) {
                return { text: JSON.stringify({ error: '该工程处于保护状态，不能删除。需要先解除保护（set_project_protected protected=false）。' }) }
            }
            const gate = await approve(ctx, {
                toolName: name,
                title: '删除工程（不可恢复）',
                target: `project / ${project.title}`,
                diff: [
                    {
                        kind: 'delete',
                        name: `${project.code} ${project.title}`,
                        detail: `${project.view_count} 浏览 / ${project.clone_count} 克隆`
                    }
                ],
                payload: { id: project.id }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await deleteProject(project.id)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, deleted: project.title }) }
        }
        default:
            return { text: JSON.stringify({ error: `未知工具：${name}` }) }
    }
}

export const PROJECT_TOOL_NAMES = new Set(PROJECT_TOOLS.map((t) => t.function.name))
