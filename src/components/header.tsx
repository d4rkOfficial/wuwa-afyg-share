import Link from 'next/link'
import { Icon } from '@iconify/react'
import ThemeToggle from '@/components/theme-toggle'
import { createClient, hasEnv } from '@/lib/supabase/server'

export default async function Header() {
    let user: { id?: string; email?: string | null; user_metadata?: Record<string, unknown> } | null = null
    let profileName: string | null = null
    let isAdmin = false
    if (hasEnv()) {
        const supabase = await createClient()
        const {
            data: { user: u }
        } = await supabase.auth.getUser()
        user = u
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, is_admin')
                .eq('id', user.id)
                .maybeSingle()
            profileName = profile?.username ?? null
            isAdmin = !!profile?.is_admin
        }
    }

    const displayName = (profileName ??
        user?.user_metadata?.name ??
        user?.user_metadata?.full_name ??
        user?.email?.split('@')[0] ??
        '') as string

    return (
        <header className="sticky top-0 z-20 border-b border-(--card-border) backdrop-blur-md">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4">
                <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/favicon.svg" alt="椰果工坊" className="size-6 shrink-0 rounded-md" />
                    <span className="hidden sm:inline">椰果工坊</span>
                </Link>

                <div className="flex-1" />

                <Link
                    href="/buff-sets"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                >
                    <Icon icon="mdi:view-dashboard-outline" className="size-4" />
                    Buff 集
                </Link>

                {isAdmin && (
                    <Link
                        href="/admin/buff-sets"
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                    >
                        <Icon icon="mdi:shield-edit-outline" className="size-4" />
                        Buff 集管理
                    </Link>
                )}

                {user ? (
                    <>
                        <Link
                            href="/upload"
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-(--btn-text)"
                            style={{ background: 'var(--btn-bg)' }}
                        >
                            <Icon icon="mdi:plus" className="size-4" />
                            上传工程
                        </Link>
                        <Link
                            href="/me"
                            className="flex items-center gap-2 rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm transition-colors hover:bg-(--card-hover)"
                        >
                            <Icon icon="mdi:account-circle-outline" className="size-4 text-(--muted)" />
                            {displayName || '我的工程'}
                        </Link>
                    </>
                ) : (
                    <Link
                        href="/login"
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-(--btn-text)"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        登录
                    </Link>
                )}

                <ThemeToggle />
            </div>
        </header>
    )
}
