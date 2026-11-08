'use client'

// 我的工程（新系统）
// 与旧版的差别：
// 1. 行不再是「卡片里塞一排小按钮」：一行 = 标题 + 状态 + 元信息 + 一个操作（编辑）；
// 2. 其余操作（改期 / 换码 / 换源 / 保护 / 复制链接 / 删除）全收进「编辑工程」弹窗，行上不放下拉菜单；
// 3. 所有破坏性操作走统一 WkConfirm，不再有「失焦 2 秒自动撤回」这种不可靠确认；
// 4. 字号、控件高度、圆角全部走新系统令牌。
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    WkBadge,
    WkButton,
    WkConfirm,
    WkDialog,
    WkEmpty,
    WkField,
    WkInput,
    WkTagInput,
    WkTextarea,
    wkToast
} from '@/design'
import { copyText } from '@/lib/utils/clipboard'
import { deleteProject, regenerateCode, replaceProjectFile, setExpiry, updateProject } from '@/lib/actions/projects'
import { setProjectProtected } from '@/lib/actions/project-protection'
import { PROJECT_TAGS } from '@/lib/consts/project-tags'
import { teamDisplayNames } from '@/lib/project/extract'
import { formatCount, formatDate } from '@/lib/utils/format'
import { isExpiredProject, isGracePeriod } from '@/lib/utils/expiry'
import type { ProjectListItem } from '@/lib/types/db'

const PER_PAGE = 8

function dateOnly(iso: string | null): string {
    return iso ? iso.slice(0, 10) : ''
}

function daysLeft(expiresAt: string | null): number | null {
    if (!expiresAt) return null
    return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000)
}

function expiryToIso(date: string): string | null {
    return date ? `${date}T23:59:59.999+08:00` : null
}

export default function MeProjects({
    projects,
    elements
}: {
    projects: ProjectListItem[]
    elements?: Record<string, string>
}) {
    const [query, setQuery] = useState('')
    const [page, setPage] = useState(1)

    const filtered = useMemo(() => {
        const key = query.trim().toLowerCase()
        if (!key) return projects
        return projects.filter((project) =>
            [project.title, project.description ?? '', project.code, ...(project.tags ?? []), project.author_name]
                .join('\n')
                .toLowerCase()
                .includes(key)
        )
    }, [projects, query])

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
    const current = Math.min(page, totalPages)
    const items = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE)

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div className="wk-toolbar">
                <WkInput
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value)
                        setPage(1)
                    }}
                    placeholder="搜索标题 / 简介 / 标签 / 分享码"
                    aria-label="搜索我的工程"
                    style={{ flex: 1, minWidth: 200, maxWidth: 320 }}
                />
                {query && (
                    <WkButton size="sm" variant="quiet" onClick={() => setQuery('')}>
                        清空
                    </WkButton>
                )}
                <span className="wk-meta">
                    {query ? (
                        <>
                            匹配 {filtered.length} / {projects.length}
                        </>
                    ) : (
                        <>共 {projects.length} 个</>
                    )}
                </span>
            </div>

            {items.length === 0 ? (
                <WkEmpty
                    title={query ? `没有匹配「${query.trim()}」的工程` : '还没有上传过工程'}
                    hint={query ? '换个关键词试试' : '去工具箱导出工程 JSON，做第一个分享者'}
                    action={
                        query ? (
                            <WkButton size="sm" onClick={() => setQuery('')}>
                                清空搜索
                            </WkButton>
                        ) : (
                            <Link href="/upload" className="wk-btn wk-btn--sm wk-btn--primary">
                                上传工程
                            </Link>
                        )
                    }
                />
            ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                    {items.map((project) => (
                        <ProjectRow key={project.id} project={project} elements={elements} />
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <nav className="wk-pager" aria-label="分页">
                    <WkButton size="sm" disabled={current <= 1} onClick={() => setPage(Math.max(1, current - 1))}>
                        上一页
                    </WkButton>
                    <span className="wk-meta">
                        第 {current} / {totalPages} 页
                    </span>
                    <WkButton size="sm" disabled={current >= totalPages} onClick={() => setPage(Math.min(totalPages, current + 1))}>
                        下一页
                    </WkButton>
                </nav>
            )}
        </div>
    )
}

type ConfirmKind = 'delete' | 'replace' | 'regen' | null

function ProjectRow({ project, elements }: { project: ProjectListItem; elements?: Record<string, string> }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [editing, setEditing] = useState(false)
    const [confirm, setConfirm] = useState<ConfirmKind>(null)

    const [title, setTitle] = useState(project.title)
    const [description, setDescription] = useState(project.description ?? '')
    const [tags, setTags] = useState<string[]>(project.tags ?? [])
    const [expireDate, setExpireDate] = useState(dateOnly(project.expires_at))
    const [replaceText, setReplaceText] = useState('')

    const expired = isExpiredProject(project.expires_at, project.author_name)
    const grace = isGracePeriod(project.expires_at, project.author_name)
    const remaining = daysLeft(project.expires_at)
    const names = teamDisplayNames(project.team_preview)

    function run(task: () => Promise<{ error?: string }>, success: string) {
        startTransition(async () => {
            const result = await task()
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(success, 'ok')
            setConfirm(null)
            setEditing(false)
            router.refresh()
        })
    }

    function onSave() {
        if (!title.trim()) {
            wkToast('标题不能为空', 'error')
            return
        }
        startTransition(async () => {
            const updated = await updateProject(project.id, {
                title: title.trim(),
                description: description.trim(),
                tags
            })
            if (updated.error) {
                wkToast(updated.error, 'error')
                return
            }
            const nextExpiry = expiryToIso(expireDate)
            if (dateOnly(project.expires_at) !== expireDate) {
                const expiryResult = await setExpiry(project.id, nextExpiry)
                if (expiryResult.error) {
                    wkToast(expiryResult.error, 'error')
                    return
                }
            }
            wkToast('已保存', 'ok')
            setEditing(false)
            router.refresh()
        })
    }

    async function copyPageLink() {
        const ok = await copyText(`${window.location.origin}/share/${project.code}`)
        wkToast(ok ? '已复制页面链接' : '复制失败，请手动复制', ok ? 'ok' : 'error')
    }

    return (
        <div className="wk-card wk-card-pad" style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <Link
                            href={`/share/${project.code}`}
                            style={{ fontSize: 'var(--wk-t-lead)', fontWeight: 600, color: 'var(--wk-fg)' }}
                        >
                            {project.title}
                        </Link>
                        {expired ? (
                            <WkBadge tone="danger">已过期</WkBadge>
                        ) : grace ? (
                            <WkBadge tone="warn">宽限中</WkBadge>
                        ) : (
                            <WkBadge tone="ok">
                                {remaining === null ? '永久有效' : remaining <= 0 ? '今天到期' : `剩余 ${remaining} 天`}
                            </WkBadge>
                        )}
                        {project.protected && <WkBadge tone="accent">已保护</WkBadge>}
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 4,
                            fontSize: 'var(--wk-t-meta)',
                            color: 'var(--wk-fg-3)'
                        }}
                    >
                        <span>/{project.code}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDate(project.created_at)}</span>
                        <span aria-hidden="true">·</span>
                        <span>浏览 {formatCount(project.view_count)}</span>
                        <span aria-hidden="true">·</span>
                        <span>克隆 {formatCount(project.clone_count)}</span>
                    </div>
                    {names.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {names.map((name, slot) => {
                                const element = elements?.[name]
                                return (
                                    <span
                                        key={`${name}-${slot}`}
                                        className="wk-badge"
                                        style={
                                            element
                                                ? {
                                                      color: `var(--element-${element})`,
                                                      borderColor: `color-mix(in srgb, var(--element-${element}) 55%, transparent)`
                                                  }
                                                : undefined
                                        }
                                    >
                                        {name}
                                    </span>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <WkButton size="sm" onClick={() => setEditing(true)}>
                        编辑
                    </WkButton>
                </div>
            </div>

            {/* ── 编辑弹窗：基本信息 + 有效期 + 换码 / 换源 ── */}
            <WkDialog
                open={editing}
                onClose={() => setEditing(false)}
                width={560}
                title="编辑工程"
                footer={
                    <>
                        <WkButton variant="quiet" onClick={() => setEditing(false)} disabled={pending}>
                            取消
                        </WkButton>
                        <WkButton variant="primary" onClick={onSave} disabled={pending}>
                            {pending ? '保存中…' : '保存'}
                        </WkButton>
                    </>
                }
            >
                <WkField label="标题">
                    <WkInput value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} />
                </WkField>
                <WkField label="简介">
                    <WkTextarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={500} />
                </WkField>
                <WkField label={`标签（${tags.length}/8）`}>
                    <WkTagInput value={tags} onChange={setTags} suggestions={PROJECT_TAGS} max={8} />
                </WkField>
                <WkField label="有效期" hint={expireDate ? `到期日 ${expireDate} 23:59 后失效` : '永久有效'}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <WkInput
                            type="date"
                            value={expireDate}
                            onChange={(event) => setExpireDate(event.target.value)}
                            style={{ maxWidth: 200 }}
                            aria-label="到期日期"
                        />
                        <WkButton size="sm" variant="quiet" onClick={() => setExpireDate('')}>
                            设为永久
                        </WkButton>
                    </div>
                </WkField>

                <div style={{ paddingTop: 12, borderTop: '1px solid var(--wk-line)' }}>
                    <div className="wk-label" style={{ marginBottom: 8 }}>
                        其他操作
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <WkButton size="sm" onClick={() => setConfirm('regen')} disabled={pending}>
                            重新生成分享码
                        </WkButton>
                        <label className="wk-btn wk-btn--sm" style={{ cursor: 'pointer' }}>
                            替换工程文件
                            <input
                                type="file"
                                accept=".json,application/json"
                                style={{ display: 'none' }}
                                onChange={(event) => {
                                    const file = event.target.files?.[0]
                                    event.target.value = ''
                                    if (!file) return
                                    file.text().then((text) => {
                                        setReplaceText(text)
                                        setConfirm('replace')
                                    })
                                }}
                            />
                        </label>
                        <WkButton size="sm" variant="quiet" onClick={copyPageLink}>
                            复制页面链接
                        </WkButton>
                        <WkButton
                            size="sm"
                            variant="quiet"
                            onClick={() =>
                                run(
                                    () => setProjectProtected(project.id, !project.protected),
                                    project.protected ? '已取消保护' : '已保护'
                                )
                            }
                            disabled={pending}
                            title="保护后即使到期也不展示克隆入口"
                        >
                            {project.protected ? '取消保护' : '保护工程'}
                        </WkButton>
                        <WkButton size="sm" variant="danger" onClick={() => setConfirm('delete')}>
                            删除工程
                        </WkButton>
                    </div>
                    <p className="wk-meta" style={{ marginTop: 8 }}>
                        分享码：/{project.code} · 换码后旧链接立刻失效
                    </p>
                </div>
            </WkDialog>

            <WkConfirm
                open={confirm === 'delete'}
                onClose={() => setConfirm(null)}
                title="删除这个工程？"
                description="分享链接会立刻失效，克隆过的人不受影响。此操作不可撤销。"
                confirmLabel="永久删除"
                busy={pending}
                onConfirm={() => run(() => deleteProject(project.id), '已删除')}
            />
            <WkConfirm
                open={confirm === 'regen'}
                onClose={() => setConfirm(null)}
                title="重新生成分享码？"
                description="旧分享码会立即失效，已经发出去的链接将打不开。"
                confirmLabel="换码"
                tone="primary"
                busy={pending}
                onConfirm={() =>
                    startTransition(async () => {
                        const result = await regenerateCode(project.id)
                        if (result.error) {
                            wkToast(result.error, 'error')
                            return
                        }
                        wkToast(`新分享码：${result.data?.code ?? ''}`, 'ok')
                        setConfirm(null)
                        router.refresh()
                    })
                }
            />
            <WkConfirm
                open={confirm === 'replace'}
                onClose={() => {
                    setConfirm(null)
                    setReplaceText('')
                }}
                title="替换工程文件？"
                description="用新文件覆盖当前工程内容，旧内容不可恢复；标题、简介、标签与分享码保持不变。"
                confirmLabel="替换"
                tone="primary"
                busy={pending}
                onConfirm={() => run(() => replaceProjectFile(project.id, replaceText), '已替换工程文件')}
            />
        </div>
    )
}
