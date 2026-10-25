'use client'

// 用户名编辑（sidebar 卡片）：头像按「用户名哈希 → 游戏角色」实时变化，改完名字立刻能看到新头像。
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { updateUsername } from '@/lib/actions/profile'
import { toast } from '@/components/ui/toast'
import CharacterAvatar from '@/components/ui/character-avatar'

interface Props {
    initial: string
    /** @desc 角色名 → 头像地址；改名时头像跟着变 */
    icons?: Record<string, string>
    /** @desc 已上传工程数（展示用） */
    projectCount?: number
}

export default function UsernameEditor({ initial, icons = {}, projectCount }: Props) {
    const router = useRouter()
    const [username, setUsername] = useState(initial)
    const [editing, setEditing] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function onSave() {
        startTransition(async () => {
            const res = await updateUsername(username)
            if (res.error) {
                setErr(res.error)
                toast(res.error, 'error')
                return
            }
            setErr(null)
            setEditing(false)
            toast('已保存用户名', 'success')
            router.refresh()
        })
    }

    return (
        <div className="mg-card p-4">
            <div className="flex items-center gap-3">
                <CharacterAvatar username={username} icons={icons} className="size-12" />
                <div className="min-w-0 flex-1">
                    {editing ? (
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            maxLength={20}
                            autoFocus
                            className="w-full rounded-sm border border-(--card-border) bg-(--input-bg) px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-(--accent)"
                        />
                    ) : (
                        <>
                            <p className="mg-title truncate text-base">{username || '未设置用户名'}</p>
                            <p className="text-[11px] text-(--muted)">
                                {typeof projectCount === 'number' ? `${projectCount} 个工程 · ` : ''}
                                头像由用户名映射到游戏角色
                            </p>
                        </>
                    )}
                </div>
                {!editing && (
                    <button
                        onClick={() => setEditing(true)}
                        className="shrink-0 rounded-sm border border-(--card-border) p-1.5 text-(--muted) transition-colors hover:border-(--accent) hover:text-(--fg)"
                        title="修改用户名"
                    >
                        <Icon icon="mdi:pencil-outline" className="size-3.5" />
                    </button>
                )}
            </div>

            {editing && (
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-(--card-border) pt-3">
                    <span className="mr-auto text-[10px] text-(--muted)">2–20 字，改完头像会跟着变</span>
                    <button
                        onClick={() => {
                            setUsername(initial)
                            setErr(null)
                            setEditing(false)
                        }}
                        className="rounded-sm border border-(--card-border) px-2.5 py-1 text-xs text-(--muted)"
                    >
                        取消
                    </button>
                    <button
                        onClick={onSave}
                        disabled={pending || username.trim().length < 2}
                        className="inline-flex items-center gap-1 rounded-sm border border-(--card-border) bg-(--btn-bg) px-3 py-1 text-xs font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) disabled:opacity-50"
                    >
                        <Icon
                            icon={pending ? 'mdi:loading' : 'mdi:check'}
                            className={`size-3.5 ${pending ? 'animate-spin' : ''}`}
                        />
                        保存
                    </button>
                </div>
            )}
            {err && <p className="mt-2 text-xs text-(--danger)">{err}</p>}
        </div>
    )
}
