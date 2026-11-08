import LoginForm from '@/components/wk/login-form'
import { WkContainer, WkRoot } from '@/design'

export default async function LoginPage({
    searchParams
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const sp = await searchParams
    const error = typeof sp.error === 'string' ? sp.error : ''
    const redirect = typeof sp.redirect === 'string' ? sp.redirect : '/'

    return (
        <WkRoot>
            <WkContainer>
                <div style={{ maxWidth: 420, margin: '0 auto', paddingTop: 24, display: 'grid', gap: 24 }}>
                    <header style={{ textAlign: 'center' }}>
                        <h1 style={{ fontSize: 'var(--wk-t-page)' }}>登录</h1>
                        <p className="wk-meta" style={{ marginTop: 6 }}>
                            登录后即可上传和分享你的拉表排轴工程
                        </p>
                    </header>
                    <div className="wk-card wk-card-pad">
                        <LoginForm redirect={redirect} error={error} />
                    </div>
                </div>
            </WkContainer>
        </WkRoot>
    )
}
