import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import SetupUsernameForm from '@/components/setup-username-form'
import { createClient, hasEnv } from '@/lib/supabase/server'

export const metadata: Metadata = {
    title: '设置用户名'
}

export default async function SetupUsernamePage({
    searchParams
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const sp = await searchParams
    const redirectTo = typeof sp.redirect === 'string' && sp.redirect.startsWith('/') && !sp.redirect.startsWith('//')
        ? sp.redirect
        : '/'

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()

    if (profile?.username) redirect(redirectTo)

    return (
        <div className="mx-auto max-w-md space-y-8 py-12">
            <div className="text-center">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">设置用户名</h1>
                <p className="mt-1 text-sm text-(--muted)">这是你在广场上展示的名字，设置后即可开始分享</p>
            </div>
            <SetupUsernameForm redirectTo={redirectTo} />
        </div>
    )
}
