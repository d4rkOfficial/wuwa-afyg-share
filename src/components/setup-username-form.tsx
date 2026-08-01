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
        <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-(--card-border) bg-(--card) p-6">
            {err && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
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
                className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
            />
            <button
                type="submit"
                disabled={pending || username.trim().length < 2}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-(--btn-text) disabled:opacity-50"
                style={{ background: 'var(--btn-bg)' }}
            >
                <Icon icon="mdi:check" className="size-4" />
                {pending ? '保存中...' : '确认'}
            </button>
        </form>
    )
}
