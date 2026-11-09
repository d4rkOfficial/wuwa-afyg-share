import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import SetupUsernameForm from '@/components/wk/setup-username-form'
import { WkContainer, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { sampleUsername } from '@/lib/data/sample-username'

export const metadata: Metadata = {
    title: '设置用户名'
}

export default async function SetupUsernamePage({
    searchParams
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    if (!hasEnv()) {
        return (
            <WkRoot>
                <WkContainer>
                    <p className="wk-meta">服务未配置</p>
                </WkContainer>
            </WkRoot>
        )
    }

    const sp = await searchParams
    const redirectTo =
        typeof sp.redirect === 'string' && sp.redirect.startsWith('/') && !sp.redirect.startsWith('//') ? sp.redirect : '/'

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
    if (profile?.username) redirect(redirectTo)

    return (
        <WkRoot>
            <WkContainer>
                <div style={{ maxWidth: 420, margin: '0 auto', paddingTop: 24, display: 'grid', gap: 24 }}>
                    <header style={{ textAlign: 'center' }}>
                        <h1 style={{ fontSize: 'var(--wk-t-page)' }}>设置用户名</h1>
                        <p className="wk-meta" style={{ marginTop: 6 }}>
                            这是你在广场上展示的名字，设置后即可开始分享
                        </p>
                    </header>
                    <div className="wk-card wk-card-pad">
                        <SetupUsernameForm redirectTo={redirectTo} exampleUsername={sampleUsername()} />
                    </div>
                </div>
            </WkContainer>
        </WkRoot>
    )
}
