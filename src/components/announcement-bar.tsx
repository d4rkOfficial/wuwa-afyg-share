'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/lib/actions/announcements'
import { toast } from '@/components/ui/toast'
import { formatDate } from '@/lib/utils/format'
import type { AnnouncementRow } from '@/lib/types/db'

interface Props {
    announcements: AnnouncementRow[]
    isAdmin: boolean
}

export default function AnnouncementBar({ announcements, isAdmin }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [draftTitle, setDraftTitle] = useState('')
    const [draftContent, setDraftContent] = useState('')
    const [busy, setBusy] = useState(false)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    const latest = announcements[0]

    function cancelEdit() {
        setEditingId(null)
        setCreating(false)
        setDraftTitle('')
        setDraftContent('')
        setDeleteConfirmId(null)
    }

    async function save() {
        const title = draftTitle.trim()
        const content = draftContent.trim()
        if (!title) {
            toast('公告标题不能为空', 'error')
            return
        }
        if (!content) {
            toast('公告详情不能为空', 'error')
            return
        }
        setBusy(true)
        const res = creating
            ? await createAnnouncement(title, content)
            : editingId
              ? await updateAnnouncement(editingId, title, content)
              : null
        setBusy(false)
        if (res?.error) {
            toast(res.error, 'error')
            return
        }
        toast(creating ? '公告已发布' : '公告已更新', 'success')
        cancelEdit()
        router.refresh()
    }

    async function remove(id: string) {
        const res = await deleteAnnouncement(id)
        if (res.error) {
            toast(res.error, 'error')
            return
        }
        toast('公告已删除', 'success')
        setDeleteConfirmId(null)
        router.refresh()
    }

    return (
        <>
            {/* 公告栏（替代标题/副标题位）：只显示最新一条公告的标题和时间 */}
            <button
                onClick={() => setOpen(true)}
                className="mg-card flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:border-(--accent) hover:bg-(--card-hover)"
                title="查看全部公告"
            >
                <Icon icon="mdi:bullhorn-outline" className="size-5 shrink-0 text-(--accent-text)" />
                <span className="mg-title min-w-0 flex-1 truncate text-sm">
                    {latest ? latest.title || latest.content : '暂无公告'}
                </span>
                {latest && (
                    <span className="mg-num shrink-0 text-xs text-(--muted)">{formatDate(latest.created_at)}</span>
                )}
                <Icon icon="mdi:chevron-right" className="size-4 shrink-0 text-(--muted)" />
            </button>

            {/* 公告弹窗（Portal 到 body，避免祖先容器/包含块影响遮罩全屏） */}
            {open &&
                createPortal(
                    <div className="fixed inset-0 z-[70]">
                        <div className="fixed inset-0 bg-(--overlay)" onClick={() => setOpen(false)} />
                        <div className="fixed inset-0 flex items-center justify-center p-4">
                            <div className="mg-card relative flex max-h-[80vh] w-[min(96vw,560px)] flex-col overflow-hidden">
                                <div className="flex items-center justify-between border-b px-4 py-3 mg-hairline">
                                    <span className="mg-title flex items-center gap-2 text-sm">
                                        <Icon icon="mdi:bullhorn-outline" className="size-4 text-(--accent-text)" />
                                        公告
                                        <span className="mg-num text-xs text-(--muted)">（{announcements.length}）</span>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {isAdmin && !creating && editingId === null && (
                                            <button
                                                onClick={() => {
                                                    setCreating(true)
                                                    setDraftTitle('')
                                                    setDraftContent('')
                                                }}
                                                className="inline-flex items-center gap-1 rounded-none border border-(--card-border) bg-(--btn-bg) px-2.5 py-1 text-xs font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg)"
                                            >
                                                <Icon icon="mdi:plus" className="size-3.5" />
                                                发布公告
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setOpen(false)}
                                            className="rounded-none p-1 text-(--muted) transition-colors hover:text-(--fg)"
                                        >
                                            <Icon icon="mdi:close" className="size-5" />
                                        </button>
                                    </div>
                                </div>

                                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                                    {(creating || editingId !== null) && (
                                        <div className="space-y-2 rounded-none border border-(--accent) bg-(--input-bg) p-3">
                                            <input
                                                type="text"
                                                value={draftTitle}
                                                onChange={(e) => setDraftTitle(e.target.value)}
                                                placeholder="公告标题…"
                                                autoFocus
                                                className="w-full rounded-none border border-(--card-border) bg-(--input-bg) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                                            />
                                            <textarea
                                                value={draftContent}
                                                onChange={(e) => setDraftContent(e.target.value)}
                                                placeholder="公告详情…"
                                                rows={4}
                                                className="w-full rounded-none border border-(--card-border) bg-(--input-bg) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                                            />
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={cancelEdit}
                                                    disabled={busy}
                                                    className="rounded-none px-3 py-1 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                                                >
                                                    取消
                                                </button>
                                                <button
                                                    onClick={save}
                                                    disabled={busy || !draftTitle.trim() || !draftContent.trim()}
                                                    className="rounded-none border border-(--card-border) bg-(--btn-bg) px-3 py-1 text-xs font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) disabled:opacity-50"
                                                >
                                                    {busy ? '保存中…' : '保存'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {announcements.length === 0 && !creating && (
                                        <div className="py-10 text-center text-sm text-(--muted)">暂无公告</div>
                                    )}

                                    {announcements.map((a) => {
                                        const editing = editingId === a.id
                                        return (
                                            <div
                                                key={a.id}
                                                className="rounded-none border border-(--card-border) bg-(--input-bg) p-3"
                                            >
                                                <div className="mb-1 flex items-center justify-between gap-2">
                                                    <span className="mg-num text-xs text-(--muted)">
                                                        {formatDate(a.created_at)}
                                                    </span>
                                                    {isAdmin && !creating && (
                                                        <div className="flex items-center gap-1">
                                                            {editing ? (
                                                                <>
                                                                    <button
                                                                        onClick={cancelEdit}
                                                                        className="rounded-none px-1.5 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--fg)"
                                                                    >
                                                                        取消
                                                                    </button>
                                                                    <button
                                                                        onClick={() => remove(a.id)}
                                                                        className="rounded-none px-1.5 py-0.5 text-[11px] text-(--danger) transition-colors hover:bg-(--card-hover)"
                                                                    >
                                                                        删除
                                                                    </button>
                                                                </>
                                                            ) : deleteConfirmId === a.id ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => setDeleteConfirmId(null)}
                                                                        className="rounded-none px-1.5 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--fg)"
                                                                    >
                                                                        取消
                                                                    </button>
                                                                    <button
                                                                        onClick={() => remove(a.id)}
                                                                        className="rounded-none border border-(--danger) px-1.5 py-0.5 text-[11px] font-black tracking-tight text-(--danger)"
                                                                    >
                                                                        确认删除
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingId(a.id)
                                                                            setCreating(false)
                                                                            setDraftTitle(a.title)
                                                                            setDraftContent(a.content)
                                                                            setDeleteConfirmId(null)
                                                                        }}
                                                                        className="rounded-none px-1.5 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--accent-text)"
                                                                    >
                                                                        编辑
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setDeleteConfirmId(a.id)}
                                                                        className="rounded-none px-1.5 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--danger)"
                                                                    >
                                                                        删除
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                {editing ? (
                                                    <>
                                                        <input
                                                            type="text"
                                                            value={draftTitle}
                                                            onChange={(e) => setDraftTitle(e.target.value)}
                                                            autoFocus
                                                            placeholder="公告标题"
                                                            className="mb-2 w-full rounded-none border border-(--card-border) bg-(--input-bg) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                                                        />
                                                        <textarea
                                                            value={draftContent}
                                                            onChange={(e) => setDraftContent(e.target.value)}
                                                            placeholder="公告详情"
                                                            rows={4}
                                                            className="w-full rounded-none border border-(--card-border) bg-(--input-bg) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                                                        />
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="mg-title text-sm">{a.title}</p>
                                                        <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-(--muted)">
                                                            {a.content}
                                                        </p>
                                                    </>
                                                )}
                                                {editing && (
                                                    <div className="mt-2 flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={cancelEdit}
                                                            disabled={busy}
                                                            className="rounded-none px-3 py-1 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                                                        >
                                                            取消
                                                        </button>
                                                        <button
                                                            onClick={save}
                                                            disabled={busy || !draftTitle.trim() || !draftContent.trim()}
                                                            className="rounded-none border border-(--card-border) bg-(--btn-bg) px-3 py-1 text-xs font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) disabled:opacity-50"
                                                        >
                                                            {busy ? '保存中…' : '保存'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    )
}
