import AppLink from '@/components/ui/app-link'
import { Icon } from '@iconify/react'
import ThemeToggle from '@/components/theme-toggle'
import ToyHeaderAuth from '@/lib/bilibili-toy/components/toy-header-auth'
import ToyIdentityBadge from '@/lib/bilibili-toy/components/toy-identity-badge'
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
        <header className="site-header sticky top-0 z-20 border-b border-(--card-border) backdrop-blur-md">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-1 px-2 sm:px-4">
                <AppLink
                    href="/"
                    aria-label="椰果工坊首页"
                    title="椰果工坊首页"
                    className="inline-flex size-9 shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-transform duration-150 ease-out active:scale-[0.97] lg:w-auto lg:px-2"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/favicon.svg" alt="" className="size-7 shrink-0 rounded-md" />
                    <span className="hidden lg:inline">椰果工坊</span>
                </AppLink>

                <nav className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1" aria-label="主导航">
                    <AppLink
                        href="/buff-sets"
                        aria-label="Buff 集"
                        title="Buff 集"
                        className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm text-(--muted) transition-[background-color,color,transform] duration-150 ease-out hover:bg-(--card-hover) hover:text-(--fg) active:scale-[0.97] lg:w-auto lg:px-2.5"
                    >
                        <Icon icon="mdi:view-dashboard-outline" className="size-4" />
                        <span className="hidden lg:inline">Buff 集</span>
                    </AppLink>

                    {isAdmin && (
                        <AppLink
                            href="/admin/projects"
                            aria-label="工程管理"
                            title="工程管理"
                            className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm text-(--muted) transition-[background-color,color,transform] duration-150 ease-out hover:bg-(--card-hover) hover:text-(--fg) active:scale-[0.97] lg:w-auto lg:px-2.5"
                        >
                            <Icon icon="mdi:clipboard-account-outline" className="size-4" />
                            <span className="hidden lg:inline">工程管理</span>
                        </AppLink>
                    )}

                    {isAdmin && (
                        <AppLink
                            href="/admin/users"
                            aria-label="管理员管理"
                            title="管理员管理"
                            className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm text-(--muted) transition-[background-color,color,transform] duration-150 ease-out hover:bg-(--card-hover) hover:text-(--fg) active:scale-[0.97] lg:w-auto lg:px-2.5"
                        >
                            <Icon icon="mdi:account-group-outline" className="size-4" />
                            <span className="hidden lg:inline">管理员管理</span>
                        </AppLink>
                    )}

                    {user ? (
                        <>
                            <AppLink
                                href="/upload"
                                aria-label="上传工程"
                                title="上传工程"
                                className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium text-(--btn-text) transition-[filter,transform] duration-150 ease-out hover:brightness-110 active:scale-[0.97] md:w-auto md:px-3"
                                style={{ background: 'var(--btn-bg)' }}
                            >
                                <Icon icon="mdi:plus" className="size-4 shrink-0" />
                                <span className="hidden md:inline">上传工程</span>
                            </AppLink>
                            <AppLink
                                href="/me"
                                aria-label={displayName || '我的工程'}
                                title={displayName || '我的工程'}
                                className="inline-flex size-9 min-w-0 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-(--card-border) bg-(--card) text-sm transition-[background-color,transform] duration-150 ease-out hover:bg-(--card-hover) active:scale-[0.97] xl:w-auto xl:max-w-52 xl:px-3"
                            >
                                <Icon icon="mdi:account-circle-outline" className="size-4 shrink-0 text-(--muted)" />
                                <span className="hidden min-w-0 truncate xl:inline">{displayName || '我的工程'}</span>
                                {isAdmin && (
                                    <span className="hidden shrink-0 rounded bg-(--accent)/15 px-1.5 py-0.5 text-[10px] font-medium leading-none text-(--accent-text) 2xl:inline">
                                        管理员
                                    </span>
                                )}
                            </AppLink>
                            {/* 登录账号后仍显示 B站 头像（有身份时） */}
                            <ToyIdentityBadge />
                        </>
                    ) : (
                        // B站 Toy 身份感知：有身份 → 头像进入个人主页并隐藏登录入口；无身份 → 原登录按钮
                        <ToyHeaderAuth />
                    )}

                    <ThemeToggle />
                </nav>
            </div>
        </header>
    )
}
