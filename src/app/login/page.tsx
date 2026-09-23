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
            <div className="border-b pb-5 text-center mg-hairline">
                <h1 className="mg-title-xl text-3xl md:text-4xl">登录</h1>
                <p className="mt-1 text-sm leading-relaxed text-(--muted)">登录后即可上传和分享你的拉表排轴工程</p>
            </div>
            <LoginForm redirect={redirect} error={error} />
        </div>
    )
}
