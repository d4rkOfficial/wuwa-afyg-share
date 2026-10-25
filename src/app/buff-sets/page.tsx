import Link from 'next/link'
import { Icon } from '@iconify/react'
import SetupNotice from '@/components/setup-notice'
import BuffSetsBrowser from '@/components/buff-sets-browser'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import { getAvatarIcons } from '@/lib/data/avatar-icons'
import { upgradeBuffSetRowV2 } from '@/lib/buff-snapshots/migrate-v2'
import type { BuffSetRow } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

export default async function BuffSetsPage() {
    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('buff_sets')
        .select('entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set')

    // 读取边界归一化：v1 形状仍可能出现在这里（刚用旧快照还原过），按 v2 规则就地归一化后再渲染。
    // 纯函数、不写库，页面永远按 v2 展示。
    const rows = ((data ?? []) as BuffSetRow[]).map((r) => upgradeBuffSetRowV2(r).row)

    const {
        data: { user }
    } = await supabase.auth.getUser()
    const viewer = await getViewerLocks()
    const isAdmin = viewer.isAdmin
    const editable = !viewer.locks.buffSetsLocked
    // 角色头像（与首页 ProjectCard 同源）：sidebar / 实体头都按角色名取图
    const icons = await getAvatarIcons()

    const entityCount = new Set(rows.map((r) => `${r.entity_type}/${r.entity_name}`)).size

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4 mg-hairline">
                <div className="min-w-0">
                    <h1 className="mg-title-xl text-2xl md:text-3xl">
                        Buff 集
                        {editable && (
                            <span className="ml-2 align-middle text-xs font-normal text-(--accent-text)">（可编辑）</span>
                        )}
                    </h1>
                    <p className="mt-1 text-sm leading-relaxed text-(--muted)">
                        游戏内角色 / 武器 / 首位声骸 / 套装的固定增益数值，供工具箱一键导入。
                        <span className="ml-1">
                            <span className="mg-num text-(--fg)">{entityCount}</span> 个实体 ·{' '}
                            <span className="mg-num text-(--fg)">{rows.length}</span> 条 Buff
                        </span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <a
                        href="/api/buff-sets/export"
                        className="inline-flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--card) px-3 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                        title="下载最新快照（无快照时为当前数据）的全量 SQL，可在 PostgreSQL / Supabase 直接执行"
                    >
                        <Icon icon="mdi:database-export-outline" className="size-4" />
                        导出 SQL
                    </a>
                    {(editable || isAdmin) && (
                        <Link
                            href={user ? '/admin/buff-sets' : '/login?redirect=/admin/buff-sets'}
                            className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                                editable
                                    ? 'border-(--accent) bg-(--accent) text-(--accent-fg) hover:brightness-110'
                                    : 'border-(--card-border) bg-(--btn-bg) text-(--btn-text) hover:bg-(--card) hover:text-(--fg)'
                            }`}
                            title={
                                editable
                                    ? '编辑锁已关闭：登录后即可编辑（被单独锁定的条目仍仅管理员可改）'
                                    : 'Buff 集编辑锁开启中：仅管理员可编辑'
                            }
                        >
                            <Icon
                                icon={editable ? 'mdi:pencil-outline' : 'mdi:shield-edit-outline'}
                                className="size-4"
                            />
                            {editable ? (user ? '编辑 Buff 集' : '登录后编辑') : 'Buff 集管理'}
                        </Link>
                    )}
                </div>
            </div>

            {error ? (
                <div className="mg-card p-8 text-center text-(--muted)">加载失败：{error.message}</div>
            ) : rows.length === 0 ? (
                <div className="mg-card p-12 text-center">
                    <Icon icon="mdi:view-dashboard-outline" className="mx-auto mb-3 size-10 text-(--muted)" />
                    <p className="text-(--muted)">暂时还没有收录任何 Buff 集</p>
                </div>
            ) : (
                <BuffSetsBrowser rows={rows} icons={icons} />
            )}
        </div>
    )
}
