'use client'

// 公告（新系统）
// 旧版是「一整行卡片 + 手写弹窗」，空态时仍占掉首屏一行写「暂无公告」。
// 现在：没有公告且非管理员 → 整块不渲染；有公告 → 一行摘要；管理员可以在此增删改。
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { WkBadge, WkButton, WkConfirm, WkDialog, WkField, WkInput, WkSpacer, WkTextarea, wkToast } from '@/design'
import { createAnnouncement, deleteAnnouncement, updateAnnouncement } from '@/lib/actions/announcements'
import { formatDate } from '@/lib/utils/format'
import type { AnnouncementRow } from '@/lib/types/db'

export default function AnnouncementBar({
    announcements,
    isAdmin
}: {
    announcements: AnnouncementRow[]
    isAdmin: boolean
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [pending, startTransition] = useTransition()

    const [editingId, setEditingId] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [draftTitle, setDraftTitle] = useState('')
    const [draftContent, setDraftContent] = useState('')
    const [confirmDelete, setConfirmDelete] = useState<AnnouncementRow | null>(null)

    const latest = announcements[0]

    function resetDraft() {
        setEditingId(null)
        setCreating(false)
        setDraftTitle('')
        setDraftContent('')
    }

    function startCreate() {
        setCreating(true)
        setEditingId(null)
        setDraftTitle('')
        setDraftContent('')
    }

    function startEdit(row: AnnouncementRow) {
        setCreating(false)
        setEditingId(row.id)
        setDraftTitle(row.title)
        setDraftContent(row.content)
    }

    function save() {
        const title = draftTitle.trim()
        const content = draftContent.trim()
        if (!title || !content) {
            wkToast('标题和详情都不能为空', 'error')
            return
        }
        startTransition(async () => {
            const result = creating
                ? await createAnnouncement(title, content)
                : editingId
                  ? await updateAnnouncement(editingId, title, content)
                  : null
            if (result?.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(creating ? '公告已发布' : '公告已更新', 'ok')
            resetDraft()
            router.refresh()
        })
    }

    function remove(row: AnnouncementRow) {
        startTransition(async () => {
            const result = await deleteAnnouncement(row.id)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast('公告已删除', 'ok')
            setConfirmDelete(null)
            if (editingId === row.id) resetDraft()
            router.refresh()
        })
    }

    // 访客 + 没有公告：整块不占位
    if (announcements.length === 0 && !isAdmin) return null

    return (
        <>
            <div
                className="wk-card"
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}
            >
                <WkBadge tone="accent">公告</WkBadge>
                <span
                    style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 'var(--wk-t-body)'
                    }}
                >
                    {latest ? latest.title || latest.content : '暂无公告'}
                </span>
                {latest && <span className="wk-meta">{formatDate(latest.created_at)}</span>}
                <WkButton size="sm" variant="quiet" onClick={() => setOpen(true)}>
                    {announcements.length > 1 ? `全部 ${announcements.length} 条` : '查看'}
                </WkButton>
            </div>

            <WkDialog
                open={open}
                onClose={() => {
                    setOpen(false)
                    resetDraft()
                }}
                width={560}
                title={creating ? '发布公告' : editingId ? '编辑公告' : '公告'}
                footer={
                    <>
                        {isAdmin && !creating && !editingId && (
                            <WkButton size="sm" onClick={startCreate}>
                                发布公告
                            </WkButton>
                        )}
                        <WkSpacer />
                        {creating || editingId ? (
                            <>
                                <WkButton variant="quiet" onClick={resetDraft} disabled={pending}>
                                    取消
                                </WkButton>
                                <WkButton variant="primary" onClick={save} disabled={pending}>
                                    {pending ? '保存中…' : '保存'}
                                </WkButton>
                            </>
                        ) : (
                            <WkButton variant="quiet" onClick={() => setOpen(false)}>
                                关闭
                            </WkButton>
                        )}
                    </>
                }
            >
                {creating || editingId ? (
                    <>
                        <WkField label="标题">
                            <WkInput
                                value={draftTitle}
                                onChange={(event) => setDraftTitle(event.target.value)}
                                maxLength={80}
                                autoFocus
                            />
                        </WkField>
                        <WkField label="详情" hint="支持换行">
                            <WkTextarea
                                value={draftContent}
                                onChange={(event) => setDraftContent(event.target.value)}
                                rows={6}
                                maxLength={2000}
                            />
                        </WkField>
                    </>
                ) : announcements.length === 0 ? (
                    <p className="wk-meta">还没有公告。管理员可以点下面的「发布公告」。</p>
                ) : (
                    announcements.map((row) => (
                        <div key={row.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--wk-line)' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{row.title}</span>
                                <span className="wk-meta">{formatDate(row.created_at)}</span>
                            </div>
                            <p style={{ marginTop: 4, whiteSpace: 'pre-wrap', color: 'var(--wk-fg-2)' }}>{row.content}</p>
                            {isAdmin && (
                                <div className="wk-toolbar" style={{ marginTop: 8 }}>
                                    <WkButton size="sm" variant="quiet" onClick={() => startEdit(row)}>
                                        编辑
                                    </WkButton>
                                    <WkButton size="sm" variant="quiet" onClick={() => setConfirmDelete(row)}>
                                        删除
                                    </WkButton>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </WkDialog>

            <WkConfirm
                open={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                title="删除这条公告？"
                description={confirmDelete?.title ? `「${confirmDelete.title}」将被永久删除。` : undefined}
                confirmLabel="删除"
                busy={pending}
                onConfirm={() => confirmDelete && remove(confirmDelete)}
            />
        </>
    )
}
