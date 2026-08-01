'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { updateUsername } from '@/lib/actions/profile'

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
        startTransition(async () => {
            const res = await updateUsername(username)
            if (res.error) {
                setErr(res.error)
                return
            }
            setErr(null)
            setEditing(false)
            router.refresh()
        })
    }

    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card) p-4">
            <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--card-hover) text-lg font-semibold">
                    {username.charAt(0)}
                </span>
                {editing ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            maxLength={20}
                            autoFocus
                            className="w-44 rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-1.5 text-sm outline-none transition-colors focus:border-(--accent)/60"
                        />
                        <button
                            onClick={onSave}
                            disabled={pending || username.trim().length < 2}
                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-(--btn-text) disabled:opacity-50"
                            style={{ background: 'var(--btn-bg)' }}
                        >
                            保存
                        </button>
                        <button
                            onClick={() => {
                                setUsername(initial)
                                setErr(null)
                                setEditing(false)
                            }}
                            className="rounded-lg border border-(--card-border) px-3 py-1.5 text-xs text-(--muted)"
                        >
                            取消
                        </button>
                    </div>
                ) : (
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{username}</p>
                        <p className="text-xs text-(--muted)">用户名</p>
                    </div>
                )}
            </div>
            {!editing && (
                <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-(--card-border) px-3 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                >
                    <Icon icon="mdi:pencil-outline" className="size-4" />
                    修改用户名
                </button>
            )}
            {err && <p className="text-xs text-red-400">{err}</p>}
        </div>
    )
}
