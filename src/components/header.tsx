import AppLink from '@/components/ui/app-link'
import { Icon } from '@iconify/react'
import ThemeToggle from '@/components/theme-toggle'
import ToyHeaderAuth from '@/lib/bilibili-toy/components/toy-header-auth'
import ToyIdentityBadge from '@/lib/bilibili-toy/components/toy-identity-badge'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'

// 导航项统一样式：图标 + 中文文字（无英文大写小标），小圆角，层次靠 hover 实色底
const navItemClass =
    'relative inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-sm text-sm text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg) lg:w-auto lg:px-2.5'

const NAV_ICON_CLASS = 'size-4'

/** @desc 窄屏只有图标时，用一个角标提示「这里可以编辑」 */
function EditableDot() {
    return (
        <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-1.5 rounded-full bg-(--accent) lg:hidden"
        />
    )
}

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

    // 编辑锁状态：全局锁关闭时，导航上直接标「（可编辑）」——告诉访客这里能改
    const viewer = await getViewerLocks()
    const buffSetsEditable = !viewer.locks.buffSetsLocked
    const substatSetsEditable = !viewer.locks.substatSetsLocked

    return (
        <header className="site-header sticky top-0 z-20 border-b mg-hairline">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-2 sm:px-4">
                <AppLink
                    href="/"
                    aria-label="椰果工坊首页"
                    title="椰果工坊首页"
                    className="mr-2 inline-flex size-9 shrink-0 items-center justify-center gap-2 rounded-sm text-sm transition-colors hover:bg-(--card-hover) lg:mr-3 lg:w-auto lg:border-r lg:border-(--card-border) lg:px-2"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/favicon.svg" alt="" className="size-7 shrink-0 rounded-sm" />
                    <span className="mg-title hidden text-sm lg:inline">椰果工坊</span>
                </AppLink>

                <nav className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1" aria-label="主导航">
                    <AppLink
                        href="/buff-sets"
                        aria-label={buffSetsEditable ? 'Buff 集（可编辑）' : 'Buff 集'}
                        title={buffSetsEditable ? 'Buff 集（可编辑）：点进去可直接编辑' : 'Buff 集'}
                        className={navItemClass}
                    >
                        <Icon icon="mdi:view-dashboard-outline" className={NAV_ICON_CLASS} />
                        <span className="hidden lg:inline">
                            Buff 集
                            {buffSetsEditable && <span className="text-(--accent-text)">（可编辑）</span>}
                        </span>
                        {buffSetsEditable && <EditableDot />}
                    </AppLink>

                    {/* 标准词条集：浏览页任何人可看。管理员入口**不在这里**——浏览页底部的
                        「标准词条集管理」直达 /admin/substat-sets，避免顶栏出现两个同名按钮。 */}
                    <AppLink
                        href="/substat-sets"
                        aria-label={substatSetsEditable ? '标准词条集（可编辑）' : '标准词条集'}
                        title={
                            substatSetsEditable ? '标准词条集（可编辑）：点进去可直接编辑' : '标准词条集'
                        }
                        className={navItemClass}
                    >
                        <Icon icon="mdi:format-list-checks" className={NAV_ICON_CLASS} />
                        <span className="hidden lg:inline">
                            标准词条集
                            {substatSetsEditable && <span className="text-(--accent-text)">（可编辑）</span>}
                        </span>
                        {substatSetsEditable && <EditableDot />}
                    </AppLink>

                    {isAdmin && (
                        <AppLink href="/admin/projects" aria-label="工程管理" title="工程管理" className={navItemClass}>
                            <Icon icon="mdi:clipboard-account-outline" className="size-4" />
                            <span className="hidden lg:inline">工程管理</span>
                        </AppLink>
                    )}

                    {isAdmin && (
                        <AppLink href="/admin/users" aria-label="管理员管理" title="管理员管理" className={navItemClass}>
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
                                className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-sm whitespace-nowrap border border-(--card-border) bg-(--btn-bg) text-sm font-black tracking-tight text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) md:w-auto md:px-3"
                            >
                                <Icon icon="mdi:plus" className="size-4 shrink-0" />
                                <span className="hidden md:inline">上传工程</span>
                            </AppLink>
                            <AppLink
                                href="/me"
                                aria-label={displayName || '我的工程'}
                                title={displayName || '我的工程'}
                                className="inline-flex size-9 min-w-0 shrink-0 items-center justify-center gap-2 rounded-sm whitespace-nowrap border border-(--card-border) bg-(--card) text-sm transition-colors hover:bg-(--fg) hover:text-(--bg) xl:w-auto xl:max-w-52 xl:px-3"
                            >
                                <Icon icon="mdi:account-circle-outline" className="size-4 shrink-0 text-(--muted)" />
                                <span className="mg-title hidden min-w-0 truncate text-sm xl:inline">
                                    {displayName || '我的工程'}
                                </span>
                                {isAdmin && (
                                    <span className="hidden shrink-0 rounded-sm border border-(--accent) bg-(--accent) px-1.5 py-0.5 text-[10px] leading-none font-black tracking-tight text-(--accent-fg) 2xl:inline">
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
