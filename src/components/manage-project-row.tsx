'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import ShareLinkPicker from '@/components/share-link-picker'
import ExpiryCountdown from '@/components/expiry-countdown'
import { toast } from '@/components/ui/toast'
import { deleteProject, regenerateCode, setExpiry, updateProject, replaceProjectFile } from '@/lib/actions/projects'
import { formatDate, formatCount } from '@/lib/utils/format'
import { isExpiredProject, isGracePeriod } from '@/lib/utils/expiry'
import type { ProjectListItem } from '@/lib/types/db'

interface Props {
    project: ProjectListItem
}

export default function ManageProjectRow({ project }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [editing, setEditing] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [expireDate, setExpireDate] = useState('')

    const [title, setTitle] = useState(project.title)
    const [description, setDescription] = useState(project.description)
    const [tagsText, setTagsText] = useState(project.tags.join(', '))

    // 换源弹窗
    const [showReplace, setShowReplace] = useState(false)
    const [replaceText, setReplaceText] = useState('')
    const [replacePreview, setReplacePreview] = useState<string | null>(null)
    const [replaceError, setReplaceError] = useState<string | null>(null)
    const replaceFileRef = useRef<HTMLInputElement>(null)

    // 状态徽章按当前时间判断
    const expired = isExpiredProject(project.expires_at, project.author_name)
    // 宽限期按当前时间判断
    const grace = isGracePeriod(project.expires_at, project.author_name)

    function run(fn: () => Promise<unknown>, successMsg?: string) {
        toast('操作中…', 'info')
        startTransition(async () => {
            const res = await fn()
            const r = res as { error?: string; data?: { code?: string } } | undefined
            if (r?.error) {
                toast(r.error, 'error')
                return
            }
            if (r?.data?.code) {
                toast(`新分享码：${r.data.code}`, 'success')
            } else if (successMsg) {
                toast(successMsg, 'success')
            }
            router.refresh()
        })
    }

    function onSetExpireDate() {
        if (!expireDate) return
        // 当天 23:59:59.999 过期
        const expiresAt = `${expireDate}T23:59:59.999+08:00`
        run(() => setExpiry(project.id, expiresAt), '已设置过期日期')
        setExpireDate('')
    }

    function onReplaceTextChange(text: string) {
        setReplaceText(text)
        setReplaceError(null)
        setReplacePreview(null)
        if (!text.trim()) return
        try {
            const parsed = JSON.parse(text) as { project?: { name?: string } }
            setReplacePreview(parsed?.project?.name ?? '（已解析工程文件）')
        } catch {
            // 解析交给服务端，仅尝试预览名称
        }
    }

    function onReplaceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => onReplaceTextChange(String(reader.result ?? ''))
        reader.readAsText(file)
        if (replaceFileRef.current) replaceFileRef.current.value = ''
    }

    function onReplaceSubmit() {
        if (!replaceText.trim()) return
        run(async () => {
            const res = await replaceProjectFile(project.id, replaceText)
            if (!res.error) {
                setShowReplace(false)
                setReplaceText('')
                setReplacePreview(null)
            }
            return res
        }, '已换源')
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
        }, '已保存')
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
                        {expired ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                                <Icon icon="mdi:alert-decagram-outline" className="size-3.5" />
                                已过期
                            </span>
                        ) : grace ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/15 px-2 py-0.5 text-xs text-orange-400">
                                <Icon icon="mdi:clock-alert-outline" className="size-3.5" />
                                宽限中
                            </span>
                        ) : (
                            project.expires_at && <ExpiryCountdown expiresAt={project.expires_at} />
                        )}
                        {grace && (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                disabled={pending}
                                className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                                title="删除该工程"
                            >
                                <Icon icon="mdi:trash-can-outline" className="size-3.5" />
                                删除
                            </button>
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
                    <ShareLinkPicker code={project.code} label="链接" />
                    <button
                        onClick={() => setEditing((v) => !v)}
                        className="inline-flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--card) px-2.5 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                    >
                        <Icon icon="mdi:pencil-outline" className="size-4" />
                        编辑
                    </button>
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
                        onClick={() => setShowReplace(true)}
                        disabled={pending}
                        title="换源（替换工程文件）"
                        className="inline-flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--card) px-2.5 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-50"
                    >
                        <Icon icon="mdi:swap-horizontal" className="size-4" />
                        换源
                    </button>
                </div>
            </div>

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
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-(--muted)">过期日期：</span>
                        <input
                            type="date"
                            value={expireDate}
                            onChange={(e) => setExpireDate(e.target.value)}
                            className="rounded-md border border-(--card-border) bg-(--input-bg) px-2 py-1 text-xs outline-none transition-colors focus:border-(--accent)/60"
                        />
                        <button
                            onClick={onSetExpireDate}
                            disabled={pending || !expireDate}
                            className="rounded-md border border-(--card-border) bg-(--card-hover) px-2.5 py-1 text-xs text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-50"
                        >
                            设为过期日期
                        </button>
                        <button
                            onClick={() => run(() => setExpiry(project.id, null), '已设为永久')}
                            className="rounded-md border border-(--card-border) bg-(--card-hover) px-2.5 py-1 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                        >
                            永久
                        </button>
                        <button
                            onClick={() => run(() => setExpiry(project.id, new Date().toISOString()), '已设为立即过期')}
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

            {showReplace && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowReplace(false)} />
                    <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-(--card-border) bg-(--card) p-5 shadow-2xl">
                        <div className="flex items-center gap-2">
                            <Icon icon="mdi:swap-horizontal" className="size-5 text-(--accent-text)" />
                            <h3 className="text-sm font-semibold">换源工程</h3>
                        </div>
                        <p className="mt-2 text-sm text-(--muted)">
                            「{project.title}」将替换为新的工程文件内容（保留分享码、简介、标签与有效期）。
                        </p>
                        <div className="mt-3 flex flex-col gap-2">
                            <button
                                onClick={() => replaceFileRef.current?.click()}
                                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-(--card-border) bg-(--card-hover) px-4 py-4 text-sm text-(--muted) transition-colors hover:border-(--accent)/50 hover:text-(--fg)"
                            >
                                <Icon icon="mdi:file-upload-outline" className="size-5" />
                                点击选择导出的 .json 文件
                            </button>
                            <input
                                ref={replaceFileRef}
                                type="file"
                                accept=".json,application/json"
                                className="hidden"
                                onChange={onReplaceFileChange}
                            />
                            <textarea
                                value={replaceText}
                                onChange={(e) => onReplaceTextChange(e.target.value)}
                                rows={5}
                                placeholder="……或直接粘贴工程 JSON 内容"
                                className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2 font-mono text-xs outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
                            />
                        </div>
                        {replacePreview && (
                            <p className="mt-2 text-xs text-(--muted)">将替换为：<span className="text-(--fg)">{replacePreview}</span></p>
                        )}
                        {replaceError && (
                            <p className="mt-2 text-xs text-red-400">{replaceError}</p>
                        )}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowReplace(false)
                                    setReplaceText('')
                                    setReplacePreview(null)
                                }}
                                className="rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) hover:text-(--fg)"
                            >
                                取消
                            </button>
                            <button
                                onClick={onReplaceSubmit}
                                disabled={pending || !replaceText.trim()}
                                className="inline-flex items-center gap-1 rounded-lg px-4 py-1.5 text-sm font-medium text-(--btn-text) disabled:opacity-50"
                                style={{ background: 'var(--btn-bg)' }}
                            >
                                <Icon icon={pending ? 'mdi:loading' : 'mdi:swap-horizontal'} className={`size-4 ${pending ? 'animate-spin' : ''}`} />
                                确认换源
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
                    <div className="relative w-full max-w-sm rounded-xl border border-(--card-border) bg-(--card) p-5 shadow-2xl">
                        <div className="flex items-center gap-2">
                            <Icon icon="mdi:alert-decagram-outline" className="size-5 text-red-400" />
                            <h3 className="text-sm font-semibold">确认删除工程？</h3>
                        </div>
                        <p className="mt-2 text-sm text-(--muted)">
                            「{project.title}」删除后无法恢复，分享链接将失效。
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmDelete(false)}
                                className="rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) hover:text-(--fg)"
                            >
                                取消
                            </button>
                            <button
                                onClick={() => run(() => deleteProject(project.id), '已删除')}
                                disabled={pending}
                                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:brightness-110 disabled:opacity-50"
                            >
                                <Icon icon={pending ? 'mdi:loading' : 'mdi:trash-can-outline'} className={`size-4 ${pending ? 'animate-spin' : ''}`} />
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
