// 顶栏（新系统）
// 一级常驻入口：广场 / Buff 集 / 标准词条集 / 我的。
// 右侧入口：管理员 → 「管理」图标菜单（图标按钮，不带文字）；普通登录用户 → 「AI 工作台」直达；
// 未登录 → 登录。编辑锁在顶栏右侧（仅管理员）。所有动作控件统一 32 高，避免"一大一小"。
// 「我的」是全站唯一的实心主操作（H6）；上传入口在广场页与「我的」页里，不在顶栏常驻。
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { getViewerLocks } from '@/lib/edit-locks'
import ToyHeaderAuth from '@/lib/bilibili-toy/components/toy-header-auth'
import WkLockPopover from './lock-popover'
import WkNavItem from './nav-item'
import WkThemeToggle from './theme-toggle'
import WkTopbarMenu from './topbar-menu'

const PRIMARY = [
    { key: 'home', label: '广场', href: '/', icon: 'mdi:compass-outline' },
    { key: 'buff', label: 'Buff 集', href: '/buff-sets', icon: 'mdi:view-dashboard-outline' },
    { key: 'substat', label: '标准词条集', href: '/substat-sets', icon: 'mdi:format-list-checks' }
]

export default async function WkTopbar() {
    const viewer = await getViewerLocks()

    const adminItems = [
        { key: 'projects', label: '工程管理', href: '/admin/projects', icon: 'mdi:clipboard-text-outline' },
        { key: 'users', label: '管理员管理', href: '/admin/users', icon: 'mdi:account-cog-outline' },
        { key: 'agent', label: 'AI 控制台', href: '/agent/admin', icon: 'mdi:robot-outline' }
    ]
    const narrowItems = viewer.isAdmin ? [...PRIMARY, ...adminItems] : PRIMARY

    return (
        <header className="wk wk-topbar">
            <div className="wk-topbar-in">
                <Link href="/" className="wk-brand">
                    椰果工坊
                </Link>

                <nav className="wk-nav wk-nav--wide" aria-label="主导航">
                    {PRIMARY.map((item) => (
                        <WkNavItem key={item.key} href={item.href} icon={item.icon} label={item.label} />
                    ))}
                </nav>

                <span className="wk-only-narrow">
                    <WkTopbarMenu label="菜单" icon="mdi:menu" items={narrowItems} size="sm" />
                </span>

                <span className="wk-spacer" />

                {viewer.isAdmin ? (
                    /* 窄屏隐藏：三个管理入口已经在左侧「菜单」下拉里了，外面再放一个图标就是重复 */
                    <span className="wk-only-wide">
                        <WkTopbarMenu label="管理" icon="mdi:cog-outline" items={adminItems} size="sm" iconOnly />
                    </span>
                ) : viewer.signedIn ? (
                    <Link href="/agent/user" className="wk-btn wk-btn--sm wk-btn--quiet" title="进入 AI 工作台">
                        <Icon icon="mdi:robot-outline" className="wk-nav-icon" aria-hidden="true" />
                        AI 工作台
                    </Link>
                ) : null}

                {viewer.isAdmin && (
                    <WkLockPopover
                        buffSetsLocked={viewer.locks.buffSetsLocked}
                        substatSetsLocked={viewer.locks.substatSetsLocked}
                    />
                )}
                <WkThemeToggle />

                {viewer.signedIn ? (
                    <Link href="/me" className="wk-btn wk-btn--primary wk-btn--sm" title="我的工程">
                        <Icon icon="mdi:account-circle-outline" className="wk-nav-icon" aria-hidden="true" />
                        我的
                    </Link>
                ) : (
                    <ToyHeaderAuth />
                )}
            </div>
        </header>
    )
}
