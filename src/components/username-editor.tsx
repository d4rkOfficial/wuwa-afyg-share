'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { updateUsername } from '@/lib/actions/profile'
import { toast } from '@/components/ui/toast'

interface Props {
    initial: string
}

export default function UsernameEditor({ initial }: Props) {
    const router = useRouter()
    const [username, setUsername] = useState(initial)
    const [editing, setEditing] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function onSave() {
        toast('正在保存用户名…', 'info')
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
        <div className="mg-card flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
                <span className="mg-title flex size-10 shrink-0 items-center justify-center rounded-none border border-(--card-border) bg-(--card-hover) text-lg">
                    {username.charAt(0)}
                </span>
                {editing ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            maxLength={20}
                            autoFocus
                            className="w-44 rounded-none border border-(--card-border) bg-(--input-bg) px-3 py-1.5 text-sm outline-none transition-colors focus:border-(--accent)"
                        />
                        <button
                            onClick={onSave}
                            disabled={pending || username.trim().length < 2}
                            className="inline-flex items-center gap-1 rounded-none border border-(--card-border) bg-(--btn-bg) px-3 py-1.5 text-xs font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) disabled:opacity-50"
                        >
                            保存
                        </button>
                        <button
                            onClick={() => {
                                setUsername(initial)
                                setErr(null)
                                setEditing(false)
                            }}
                            className="rounded-none border border-(--card-border) px-3 py-1.5 text-xs text-(--muted)"
                        >
                            取消
                        </button>
                    </div>
                ) : (
                    <div className="min-w-0">
                        <p className="mg-title truncate text-sm">{username}</p>
                        <p className="mg-note">用户名</p>
                    </div>
                )}
            </div>
            {!editing && (
                <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 rounded-none border border-(--card-border) px-3 py-1.5 text-xs text-(--muted) transition-colors hover:border-(--accent) hover:text-(--fg)"
                >
                    <Icon icon="mdi:pencil-outline" className="size-4" />
                    修改用户名
                </button>
            )}
            {err && <p className="text-xs text-(--danger)">{err}</p>}
        </div>
    )
}
