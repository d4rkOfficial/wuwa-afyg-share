'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import CopyButton from '@/components/copy-button'
import ExpiryCountdown from '@/components/expiry-countdown'
import { deleteProject, regenerateCode, setExpiry, togglePublish, updateProject } from '@/lib/actions/projects'
import { formatDate, formatCount } from '@/lib/utils/format'
import { siteUrl } from '@/lib/utils/site'
import type { ProjectListItem } from '@/lib/types/db'

const EXPIRY_OPTIONS = [
    { days: null as number | null, label: '永久' },
    { days: 7, label: '+7 天' },
    { days: 30, label: '+30 天' },
    { days: 90, label: '+90 天' }
]

interface Props {
    project: ProjectListItem
}

export default function ManageProjectRow({ project }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [editing, setEditing] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const [title, setTitle] = useState(project.title)
    const [description, setDescription] = useState(project.description)
    const [tagsText, setTagsText] = useState(project.tags.join(', '))

    const [flash, setFlash] = useState<string | null>(null)

    // eslint-disable-next-line react-hooks/purity -- 过期徽章需按当前时间判断
    const isExpired = project.expires_at !== null && new Date(project.expires_at).getTime() <= Date.now()
    const shareUrl = `${siteUrl()}/share/${project.code}`

    function run(fn: () => Promise<unknown>) {
        startTransition(async () => {
            const res = await fn()
            const r = res as { error?: string; data?: { code?: string } } | undefined
            if (r?.error) {
                setFlash(r.error)
                return
            }
            if (r?.data?.code) {
                setFlash(`新分享码：${r.data.code}`)
            }
            router.refresh()
        })
    }

    function onExtend(days: number | null) {
        // eslint-disable-next-line react-hooks/purity -- 事件处理中计算延长后的过期时间
        const expiresAt = days === null ? null : new Date(Date.now() + days * 86400000).toISOString()
        run(() => setExpiry(project.id, expiresAt))
    }

    function onSave() {
        run(async () => {
            const res = await updateProject(project.id, {
                title,
                description,
                tags: tagsText
                    .split(/[,，\s]+/)
                    .map((t) => t.trim())
                    .filter(Boolean)
            })
            setEditing(false)
            return res
        })
    }

    return (
        <div className="rounded-xl border border-(--card-border) bg-(--card) p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href={`/share/${project.code}`}
                            className="line-clamp-1 font-medium transition-colors hover:text-(--accent-text)"
                        >
                            {project.title}
                        </Link>
                        {project.published ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500">
                                <Icon icon="mdi:check-circle-outline" className="size-3.5" />
                                已发布
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-zinc-500/15 px-2 py-0.5 text-xs text-(--muted)">
                                <Icon icon="mdi:eye-off-outline" className="size-3.5" />
                                已下架
                            </span>
                        )}
                        {project.expires_at && !isExpired && <ExpiryCountdown expiresAt={project.expires_at} />}
                        {isExpired && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                                <Icon icon="mdi:alert-decagram-outline" className="size-3.5" />
                                已过期
                            </span>
                        )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--muted)">
                        <span className="font-mono">/{project.code}</span>
                        <span>{formatDate(project.created_at)}</span>
                        <span className="flex items-center gap-0.5">
                            <Icon icon="mdi:eye-outline" className="size-3.5" />
                            {formatCount(project.view_count)}
                        </span>
                        <span className="flex items-center gap-0.5">
                            <Icon icon="mdi:content-copy" className="size-3.5" />
                            {formatCount(project.clone_count)}
                        </span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    <CopyButton text={shareUrl} label="链接" />
                    <button
                        onClick={() => run(() => regenerateCode(project.id))}
                        disabled={pending}
                        title="重新生成分享码"
                        className="inline-flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--card) px-2.5 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-50"
                    >
                        <Icon icon="mdi:refresh" className="size-4" />
                        换码
                    </button>
                    <button
                        onClick={() => run(() => togglePublish(project.id))}
                        disabled={pending}
                        title={project.published ? '下架' : '发布'}
                        className="inline-flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--card) px-2.5 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-50"
                    >
                        <Icon icon={project.published ? 'mdi:eye-off-outline' : 'mdi:eye-outline'} className="size-4" />
                        {project.published ? '下架' : '发布'}
                    </button>
                    <button
                        onClick={() => setEditing((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--card) px-2.5 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                    >
                        <Icon icon="mdi:pencil-outline" className="size-4" />
                        编辑
                    </button>
                    {confirmDelete ? (
                        <button
                            onClick={() => run(() => deleteProject(project.id))}
                            disabled={pending}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50"
                        >
                            确认删除
                        </button>
                    ) : (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            onBlur={() => setTimeout(() => setConfirmDelete(false), 2000)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20"
                        >
                            <Icon icon="mdi:trash-can-outline" className="size-4" />
                            删除
                        </button>
                    )}
                </div>
            </div>

            {flash && <div className="mt-3 rounded-lg bg-(--card-hover) px-3 py-2 text-xs text-(--fg)">{flash}</div>}

            {editing && (
                <div className="mt-4 space-y-3 border-t border-(--card-border) pt-4">
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={60}
                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm outline-none transition-colors focus:border-(--accent)/60"
                    />
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="简介"
                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
                    />
                    <input
                        value={tagsText}
                        onChange={(e) => setTagsText(e.target.value)}
                        placeholder="标签（逗号分隔）"
                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
                    />
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-(--muted)">分享码有效期：</span>
                        <div className="flex flex-wrap gap-1.5">
                            {EXPIRY_OPTIONS.map((opt) => (
                                <button
                                    key={opt.label}
                                    onClick={() => onExtend(opt.days)}
                                    className="rounded-md border border-(--card-border) bg-(--card-hover) px-2.5 py-1 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => run(() => setExpiry(project.id, new Date().toISOString()))}
                            className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/20"
                        >
                            立即过期
                        </button>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setEditing(false)}
                            className="rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) hover:text-(--fg)"
                        >
                            取消
                        </button>
                        <button
                            onClick={onSave}
                            disabled={pending}
                            className="rounded-lg px-4 py-1.5 text-sm font-medium text-(--btn-text) disabled:opacity-50"
                            style={{ background: 'var(--btn-bg)' }}
                        >
                            保存
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
