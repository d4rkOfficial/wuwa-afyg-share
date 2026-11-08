'use client'

// 我的工程 · 账号区（新系统）
// 合并了旧的三块（UsernameEditor / 四格统计 / ClearMyContent）：
// 账号、统计、退出、危险区在同一列里，全部走新令牌；清空内容改成
// 「统一确认弹窗 + 输入确认文字」，替代旧的失焦计时撤回。
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { WkButton, WkDialog, WkField, WkInput, wkToast } from '@/design'
import { updateUsername } from '@/lib/actions/profile'
import { deleteMyContent } from '@/lib/actions/project-protection'
import { signOut } from '@/lib/actions/auth'

const CONFIRM_TEXT = '确认删除'

export default function AccountPanel({
    username,
    avatarUrl,
    stats
}: {
    username: string
    avatarUrl?: string
    stats: { label: string; value: number; danger?: boolean }[]
}) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(username)
    const [clearing, setClearing] = useState(false)
    const [confirmInput, setConfirmInput] = useState('')

    function saveUsername() {
        const next = draft.trim()
        if (!next) {
            wkToast('用户名不能为空', 'error')
            return
        }
        startTransition(async () => {
            const result = await updateUsername(next)
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast('用户名已更新', 'ok')
            setEditing(false)
            router.refresh()
        })
    }

    function clearContent() {
        startTransition(async () => {
            const result = await deleteMyContent()
            if (result.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(`已清空 ${result.data?.deletedProjects ?? 0} 个工程`, 'ok')
            setClearing(false)
            setConfirmInput('')
            router.refresh()
        })
    }

    return (
        <aside style={{ display: 'grid', gap: 16 }}>
            {/* 身份 */}
            <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="wk-pcard-avatar" style={{ width: 36, height: 36 }}>
                        {avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={avatarUrl} alt="" />
                        ) : null}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {username}
                        </div>
                        <div className="wk-meta">已登录</div>
                    </div>
                    {!editing && (
                        <WkButton size="sm" variant="quiet" onClick={() => setEditing(true)}>
                            改名
                        </WkButton>
                    )}
                </div>

                {editing && (
                    <div style={{ display: 'grid', gap: 8 }}>
                        <WkField label="用户名" hint="改名后旧名字的工程仍然属于你">
                            <WkInput
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                maxLength={32}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') saveUsername()
                                    if (event.key === 'Escape') setEditing(false)
                                }}
                            />
                        </WkField>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <WkButton size="sm" variant="primary" onClick={saveUsername} disabled={pending}>
                                {pending ? '保存中…' : '保存'}
                            </WkButton>
                            <WkButton size="sm" variant="quiet" onClick={() => setEditing(false)} disabled={pending}>
                                取消
                            </WkButton>
                        </div>
                    </div>
                )}
            </div>

            {/* 统计：四格一行，整数等宽靠列宽对齐 */}
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        style={{
                            border: '1px solid var(--wk-line)',
                            borderRadius: 'var(--wk-r-2)',
                            padding: '8px 6px',
                            textAlign: 'center'
                        }}
                    >
                        <div
                            style={{
                                fontSize: 'var(--wk-t-lead)',
                                fontWeight: 600,
                                color: stat.danger ? 'var(--wk-danger)' : 'var(--wk-fg)'
                            }}
                        >
                            {stat.value.toLocaleString()}
                        </div>
                        <div className="wk-meta">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* 操作 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Link href="/upload" className="wk-btn wk-btn--sm wk-btn--primary">
                    上传工程
                </Link>
                <form action={signOut} style={{ display: 'inline-flex' }}>
                    <WkButton size="sm" variant="quiet" type="submit">
                        退出登录
                    </WkButton>
                </form>
            </div>

            {/* 危险区 */}
            <div style={{ paddingTop: 12, borderTop: '1px solid var(--wk-line)' }}>
                <div className="wk-label" style={{ marginBottom: 6 }}>
                    危险操作
                </div>
                <p className="wk-meta" style={{ marginBottom: 8 }}>
                    清空会删除你名下全部工程（受保护的工程除外），分享链接立即失效。
                </p>
                <WkButton size="sm" variant="danger" onClick={() => setClearing(true)}>
                    清空我的全部工程
                </WkButton>
            </div>

            <WkDialog
                open={clearing}
                onClose={() => {
                    setClearing(false)
                    setConfirmInput('')
                }}
                title="清空我的全部工程？"
                footer={
                    <>
                        <WkButton variant="quiet" onClick={() => setClearing(false)} disabled={pending}>
                            取消
                        </WkButton>
                        <WkButton
                            variant="danger"
                            onClick={clearContent}
                            disabled={pending || confirmInput !== CONFIRM_TEXT}
                        >
                            {pending ? '清空中…' : '永久删除'}
                        </WkButton>
                    </>
                }
            >
                <p>此操作不可撤销。受保护的工程不会被删除，需要先解除保护。</p>
                <WkField label={`输入「${CONFIRM_TEXT}」以确认`}>
                    <WkInput
                        value={confirmInput}
                        onChange={(event) => setConfirmInput(event.target.value)}
                        placeholder={CONFIRM_TEXT}
                        aria-label="确认删除文字"
                    />
                </WkField>
            </WkDialog>
        </aside>
    )
}
