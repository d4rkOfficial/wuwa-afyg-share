'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { updateUsername } from '@/lib/actions/profile'

interface Props {
    redirectTo: string
}

export default function SetupUsernameForm({ redirectTo }: Props) {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [err, setErr] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function onSubmit(e: React.FormEvent) {
        e.preventDefault()
        startTransition(async () => {
            const res = await updateUsername(username)
            if (res.error) {
                setErr(res.error)
                return
            }
            router.replace(redirectTo)
            router.refresh()
        })
    }

    return (
        <form onSubmit={onSubmit} className="space-y-3 rounded-none border-2 border-(--card-border) bg-(--card) p-6">
            {err && (
                <div className="rounded-none border-2 border-(--danger) bg-(--danger) px-3 py-2 text-sm text-white">
                    {err}
                </div>
            )}
            <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名（2-20 个字符）"
                autoFocus
                required
                maxLength={20}
                className="w-full rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)"
            />
            <button
                type="submit"
                disabled={pending || username.trim().length < 2}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-none px-4 py-2.5 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) disabled:opacity-50"
            >
                <Icon icon="mdi:check" className="size-4" />
                {pending ? '保存中...' : '确认'}
            </button>
        </form>
    )
}
