'use client'

// 登录表单（新系统）
// 与旧版的差别：主操作唯一（发送验证码 / 验证码登录为实心，GitHub 为描边）；
// 邮件发出后可「换一个邮箱」或「重新发送」（旧版是死路，只能刷新页面）；
// 错误内联显示在字段上方，不再是整块红条。
import { useState, useTransition } from 'react'
import { WkButton, WkField, WkInput, wkToast } from '@/design'
import { signInWithGithub, signInWithMagicLink, verifyEmailOtp } from '@/lib/actions/auth'

export default function LoginForm({ redirect, error }: { redirect: string; error: string }) {
    const [email, setEmail] = useState('')
    const [sent, setSent] = useState(false)
    const [code, setCode] = useState('')
    const [message, setMessage] = useState<string | null>(error === 'auth' ? '登录失败，请重试' : null)
    const [pending, startTransition] = useTransition()

    function onGithub() {
        setMessage(null)
        startTransition(async () => {
            const result = await signInWithGithub(redirect)
            if (result.error) setMessage(result.error)
        })
    }

    function onSendCode(nextEmail = email) {
        setMessage(null)
        startTransition(async () => {
            const result = await signInWithMagicLink(nextEmail, redirect)
            if (result.error) {
                setMessage(result.error)
                return
            }
            setCode('')
            setSent(true)
            wkToast('验证邮件已发送', 'ok')
        })
    }

    function onVerify() {
        setMessage(null)
        startTransition(async () => {
            const result = await verifyEmailOtp(email, code, redirect)
            if (result.error) setMessage(result.error)
        })
    }

    if (sent) {
        return (
            <div style={{ display: 'grid', gap: 16 }}>
                <div>
                    <p style={{ fontWeight: 600 }}>验证邮件已发送</p>
                    <p className="wk-meta" style={{ marginTop: 4 }}>
                        请到 <strong style={{ color: 'var(--wk-fg-2)' }}>{email}</strong> 查收并点击链接，或输入邮件里的验证码。
                    </p>
                </div>

                {message && <p style={{ color: 'var(--wk-danger)', fontSize: 'var(--wk-t-meta)' }}>{message}</p>}

                <form
                    onSubmit={(event) => {
                        event.preventDefault()
                        onVerify()
                    }}
                    style={{ display: 'grid', gap: 12 }}
                >
                    <WkField label="验证码" hint="邮件里 6–8 位的那种；不区分大小写">
                        <WkInput
                            value={code}
                            onChange={(event) => setCode(event.target.value.trim().slice(0, 64))}
                            placeholder="输入验证码"
                            autoComplete="one-time-code"
                            autoFocus
                            required
                            inputMode="text"
                            style={{ letterSpacing: '0.18em', textAlign: 'center' }}
                        />
                    </WkField>
                    <WkButton variant="primary" type="submit" disabled={pending || !code.trim()}>
                        {pending ? '验证中…' : '登录'}
                    </WkButton>
                </form>

                <div className="wk-toolbar">
                    <WkButton size="sm" variant="quiet" onClick={() => onSendCode()} disabled={pending}>
                        重新发送
                    </WkButton>
                    <WkButton size="sm" variant="quiet" onClick={() => setSent(false)} disabled={pending}>
                        换一个邮箱
                    </WkButton>
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            {message && <p style={{ color: 'var(--wk-danger)', fontSize: 'var(--wk-t-meta)' }}>{message}</p>}

            <WkButton onClick={onGithub} disabled={pending} style={{ width: '100%' }}>
                使用 GitHub 登录
            </WkButton>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ height: 1, flex: 1, background: 'var(--wk-line)' }} />
                <span className="wk-meta">或使用邮箱</span>
                <span style={{ height: 1, flex: 1, background: 'var(--wk-line)' }} />
            </div>

            <form
                onSubmit={(event) => {
                    event.preventDefault()
                    onSendCode()
                }}
                style={{ display: 'grid', gap: 12 }}
            >
                <WkField label="邮箱" hint="我们会发送一封登录邮件，链接或用验证码都能完成登录">
                    <WkInput
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="name@example.com"
                        autoComplete="email"
                        required
                    />
                </WkField>
                <WkButton variant="primary" type="submit" disabled={pending || !email}>
                    {pending ? '发送中…' : '发送登录邮件'}
                </WkButton>
            </form>
        </div>
    )
}
