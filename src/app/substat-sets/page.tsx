import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import SetupNotice from '@/components/setup-notice'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import type { EchoStatValue, StandardSubstatSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: '标准词条集'
}

export const dynamic = 'force-dynamic'

/** @desc 单条词条的展示文案（与工具箱口径一致：类型 + 数值 + 单位） */
function statText(stat: EchoStatValue | null | undefined): string {
    if (!stat) return '—'
    return `${stat.type}${stat.value}${stat.unit ?? ''}`
}

/**
 * @desc 标准词条集浏览页（任何访客都可查看，无需登录）。
 * 编辑锁关闭时，登录用户也可以从这里进编辑页；被管理员单独锁定的角色仍只读。
 */
export default async function SubstatSetsPage() {
    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('standard_substat_sets')
        .select('id, character_name, plan, note, updated_at')
        .order('character_name', { ascending: true })
    const rows = (data ?? []) as StandardSubstatSetRow[]

    const {
        data: { user }
    } = await supabase.auth.getUser()
    const viewer = await getViewerLocks()
    const isAdmin = viewer.isAdmin
    const editable = !viewer.locks.substatSetsLocked

    return (
        <div className="space-y-8 md:space-y-10">
            <header className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span
                        className="flex items-center gap-1.5 text-[11px] tracking-[0.28em] text-(--muted)"
                        aria-hidden="true"
                    >
                        <Icon icon="mdi:clipboard-text-outline" className="size-3.5" />
                        标准词条集
                    </span>
                    <span className="text-[11px] tracking-[0.18em] text-(--muted)">
                        共 <span className="mg-num text-(--fg)">{rows.length}</span> 个角色
                    </span>
                </div>

                <div className="flex flex-col gap-2 border-y py-4 mg-hairline md:flex-row md:items-end md:gap-8">
                    <h1 className="mg-title text-3xl md:text-4xl">
                        标准 14 词条
                        {editable && (
                            <span className="ml-2 align-middle text-sm text-(--accent-text)">（可编辑）</span>
                        )}
                    </h1>
                    <p className="max-w-xl text-xs leading-relaxed text-(--muted) md:ml-auto md:text-right">
                        每个角色一套 5 部位声骸配置（主词条 + 副词条合计 14 条）。绝大多数角色由工具箱按角色数据本地生成，
                        此处只收录「特殊角色」的整份方案；工具箱会经 <code className="text-(--fg)">/api/substat-sets</code> 拉取后
                        一键套用。
                        {editable && ' 当前已开放编辑：登录后可直接修改（带锁的角色仍仅管理员可改）。'}
                    </p>
                </div>
            </header>

            {error ? (
                <div className="mg-card p-8 text-center text-(--muted)">加载失败：{error.message}</div>
            ) : rows.length === 0 ? (
                <div className="mg-card p-12 text-center">
                    <Icon icon="mdi:clipboard-text-outline" className="mx-auto mb-3 size-10 text-(--muted)" />
                    <p className="text-(--muted)">暂时还没有收录任何特殊角色的标准词条集</p>
                </div>
            ) : (
                <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {rows.map((row) => {
                        const slots = row.plan?.slots ?? []
                        const substatTotal = slots.reduce((n, s) => n + (s.substats?.length ?? 0), 0)
                        return (
                            <li key={row.id} className="mg-card overflow-hidden">
                                <div className="flex items-center gap-2.5 border-b px-4 py-2.5 mg-hairline">
                                    <Icon
                                        icon="mdi:account-outline"
                                        className="size-4 shrink-0 text-(--accent-text)"
                                    />
                                    <span className="mg-title min-w-0 flex-1 truncate text-base">
                                        {row.character_name}
                                    </span>
                                    {viewer.locks.substatLocks[row.character_name] && (
                                        <span
                                            className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-(--warning) px-1.5 py-0.5 text-[10px] text-(--warning)"
                                            title="该角色已被管理员锁定，仅管理员可编辑"
                                        >
                                            <Icon icon="mdi:lock" className="size-3" />
                                            已锁定
                                        </span>
                                    )}
                                    <span className="shrink-0 text-[11px] tracking-[0.18em] text-(--muted)">
                                        {slots.map((s) => s.cost).join('')} · {substatTotal} 条
                                    </span>
                                </div>

                                <div className="space-y-1.5 px-4 py-3">
                                    {slots.map((slot, i) => (
                                        <div key={i} className="flex items-baseline gap-3 text-[11px]">
                                            <span className="w-14 shrink-0 mg-num text-(--accent-text)">
                                                {slot.cost}C
                                            </span>
                                            <span className="w-32 shrink-0 truncate text-(--fg)" title={statText(slot.mainStat)}>
                                                {statText(slot.mainStat)}
                                                {slot.secondMainStat ? (
                                                    <span className="text-(--muted)">
                                                        {' '}
                                                        +{slot.secondMainStat.value}
                                                    </span>
                                                ) : null}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-(--muted)">
                                                {slot.substats?.map((s) => statText(s)).join(' / ') || '无副词条'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {row.note ? (
                                    <p className="border-t px-4 py-2 text-[11px] text-(--muted) mg-hairline">
                                        {row.note}
                                    </p>
                                ) : null}
                            </li>
                        )
                    })}
                </ul>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 border-t pt-4 mg-hairline">
                <span className="text-[11px] text-(--muted)">
                    {editable
                        ? '编辑锁已关闭：登录后即可修改；带锁的角色仍仅管理员可编辑'
                        : '本页为只读浏览；编辑锁开启中，内容的增删改由管理员维护'}
                </span>
                {/* 编辑入口只留一个：编辑锁关闭时是「编辑 / 登录后编辑」，锁着时管理员看到「标准词条集管理」 */}
                {(editable || isAdmin) && (
                    <Link
                        href={user ? '/admin/substat-sets' : '/login?redirect=/admin/substat-sets'}
                        className="inline-flex items-center gap-1.5 rounded-sm border px-4 py-2 text-sm font-black tracking-tight transition-colors hover:border-(--accent) mg-hairline"
                        style={
                            editable
                                ? { background: 'var(--accent)', color: 'var(--accent-fg)' }
                                : { background: 'var(--btn-bg)', color: 'var(--btn-text)' }
                        }
                        title={
                            editable
                                ? '编辑锁已关闭：登录后即可编辑（被单独锁定的角色仍仅管理员可改）'
                                : '标准词条集编辑锁开启中：仅管理员可编辑'
                        }
                    >
                        <Icon icon={editable ? 'mdi:pencil-outline' : 'mdi:shield-edit-outline'} className="size-4" />
                        {editable ? (user ? '编辑标准词条集' : '登录后编辑') : '标准词条集管理'}
                    </Link>
                )}
            </div>
        </div>
    )
}
