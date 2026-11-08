'use client'

// 设置用户名（新系统）：登录后首次进入的引导页
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { WkButton, WkField, WkInput } from '@/design'
import { updateUsername } from '@/lib/actions/profile'

export default function SetupUsernameForm({ redirectTo }: { redirectTo: string }) {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [message, setMessage] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function onSubmit(event: React.FormEvent) {
        event.preventDefault()
        setMessage(null)
        startTransition(async () => {
            const result = await updateUsername(username)
            if (result.error) {
                setMessage(result.error)
                return
            }
            router.replace(redirectTo)
            router.refresh()
        })
    }

    return (
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
            {message && <p style={{ color: 'var(--wk-danger)', fontSize: 'var(--wk-t-meta)' }}>{message}</p>}
            <WkField label="用户名" hint="2–20 个字符；会显示在你分享的工程上，之后也能在「我的工程」里改">
                <WkInput
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="例：阿散"
                    autoFocus
                    required
                    maxLength={20}
                />
            </WkField>
            <WkButton variant="primary" type="submit" disabled={pending || username.trim().length < 2}>
                {pending ? '保存中…' : '确认'}
            </WkButton>
        </form>
    )
}
