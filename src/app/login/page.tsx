import LoginForm from '@/components/login-form'

export default async function LoginPage({
    searchParams
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const sp = await searchParams
    const error = typeof sp.error === 'string' ? sp.error : ''
    const redirect = typeof sp.redirect === 'string' ? sp.redirect : '/'

    return (
        <div className="mx-auto max-w-md space-y-8 py-12">
            <div className="text-center">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">登录</h1>
                <p className="mt-1 text-sm text-(--muted)">登录后即可上传和分享你的拉表排轴工程</p>
            </div>
            <LoginForm redirect={redirect} error={error} />
        </div>
    )
}
