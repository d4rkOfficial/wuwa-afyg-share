'use client'

import { useState, useTransition } from 'react'
import { Icon } from '@iconify/react'
import { signInWithGithub, signInWithMagicLink, verifyEmailOtp } from '@/lib/actions/auth'

interface Props {
    redirect: string
    error: string
}

export default function LoginForm({ redirect, error }: Props) {
    const [email, setEmail] = useState('')
    const [sent, setSent] = useState(false)
    const [code, setCode] = useState('')
    const [codeErr, setCodeErr] = useState<string | null>(null)
    const [err, setErr] = useState<string | null>(error === 'auth' ? '登录失败，请重试' : null)
    const [pending, startTransition] = useTransition()

    function onGithub() {
        startTransition(async () => {
            const res = await signInWithGithub(redirect)
            if (res.error) setErr(res.error)
        })
    }

    function onMagicLink(e: React.FormEvent) {
        e.preventDefault()
        startTransition(async () => {
            const res = await signInWithMagicLink(email, redirect)
            if (res.error) {
                setErr(res.error)
                return
            }
            setCode('')
            setCodeErr(null)
            setSent(true)
        })
    }

    function onVerifyCode(e: React.FormEvent) {
        e.preventDefault()
        startTransition(async () => {
            const res = await verifyEmailOtp(email, code, redirect)
            if (res.error) setCodeErr(res.error)
        })
    }

    if (sent) {
        return (
            <div className="rounded-none border-2 border-(--card-border) bg-(--card) p-8 text-center">
                <Icon icon="mdi:email-check-outline" className="mx-auto mb-3 size-10 text-(--accent)" />
                <p className="font-medium">验证邮件已发送</p>
                <p className="mt-1 text-sm text-(--muted)">请前往 {email} 查收并点击链接完成登录，或输入邮件中的验证码：</p>
                <form onSubmit={onVerifyCode} className="mt-4 flex flex-col gap-2">
                    {codeErr && (
                        <div className="rounded-none border-2 border-(--danger) bg-(--danger) px-3 py-2 text-sm text-white">
                            {codeErr}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value.trim().slice(0, 64))}
                            placeholder="输入邮件中的验证码"
                            autoComplete="one-time-code"
                            autoFocus
                            required
                            className="flex-1 rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2.5 text-center text-lg tracking-widest outline-none transition-colors placeholder:text-sm placeholder:tracking-normal focus:border-(--accent)"
                        />
                        <button
                            type="submit"
                            disabled={pending || !code.trim()}
                            className="inline-flex items-center gap-1.5 rounded-none px-4 py-2.5 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) disabled:opacity-50"
                        >
                            <Icon icon="mdi:login" className="size-4" />
                            登录
                        </button>
                    </div>
                </form>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {err && (
                <div className="rounded-none border-2 border-(--danger) bg-(--danger) px-3 py-2 text-sm text-white">
                    {err}
                </div>
            )}

            <button
                onClick={onGithub}
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-none border-2 border-(--card-border) bg-(--card) px-4 py-2.5 text-sm font-medium transition-colors hover:bg-(--card-hover) disabled:opacity-50"
            >
                <Icon icon="mdi:github" className="size-5" />
                使用 GitHub 登录
            </button>

            <div className="flex items-center gap-3 text-xs text-(--muted)">
                <div className="h-px flex-1 bg-(--card-border)" />
                或使用邮箱
                <div className="h-px flex-1 bg-(--card-border)" />
            </div>

            <form onSubmit={onMagicLink} className="flex gap-2">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="flex-1 rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)"
                />
                <button
                    type="submit"
                    disabled={pending || !email}
                    className="inline-flex items-center gap-1.5 rounded-none px-4 py-2.5 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) disabled:opacity-50"
                >
                    <Icon icon="mdi:send-outline" className="size-4" />
                    发送
                </button>
            </form>
        </div>
    )
}
