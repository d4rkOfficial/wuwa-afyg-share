import Link from 'next/link'
import { Icon } from '@iconify/react'
import SetupNotice from '@/components/setup-notice'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { BUFF_ENTITY_LABELS, BUFF_ZONE_MAP, BUFF_ENTITY_TYPES, BUFF_SCOPE_LABELS } from '@/lib/consts/buff-zones'
import type { BuffSetRow } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

export default async function BuffSetsPage() {
    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('buff_sets')
        .select('entity_type, entity_name, buff_name, scope, exclusive, buff_set')

    const rows = (data ?? []) as BuffSetRow[]

    const grouped = BUFF_ENTITY_TYPES.map((type) => ({
        type,
        label: BUFF_ENTITY_LABELS[type],
        items: rows
            .filter((r) => r.entity_type === type)
            .sort((a, b) => a.entity_name.localeCompare(b.entity_name, 'zh'))
    })).filter((g) => g.items.length > 0)

    const zoneLabel = (id: string) => BUFF_ZONE_MAP.get(id)?.label ?? id

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl font-bold">Buff 集</h1>
                <p className="text-sm text-(--muted)">游戏内角色 / 武器 / 首位声骸 / 套装的固定增益数值，供工具箱一键导入</p>
            </div>

            {error ? (
                <div className="rounded-xl border border-(--card-border) bg-(--card) p-8 text-center text-(--muted)">
                    加载失败：{error.message}
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-(--card-border) bg-(--card) p-12 text-center">
                    <Icon icon="mdi:view-dashboard-outline" className="mx-auto mb-3 size-10 text-(--muted)" />
                    <p className="text-(--muted)">暂时还没有收录任何 Buff 集</p>
                </div>
            ) : (
                grouped.map((group) => (
                    <section key={group.type} className="space-y-3">
                        <h2 className="text-base font-semibold">{group.label}</h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {group.items.map((item) => (
                                <div
                                    key={`${item.entity_type}/${item.entity_name}/${item.buff_name}`}
                                    className="rounded-xl border border-(--card-border) bg-(--card) p-4 transition-colors hover:border-(--accent)/40"
                                >
                                    <div className="mb-2 flex items-baseline justify-between gap-2">
                                        <span className="font-medium text-(--fg)">{item.entity_name}</span>
                                        <span className="text-xs text-(--muted)">{item.buff_name}</span>
                                    </div>
                                    <div className="mb-2 flex flex-wrap gap-1">
                                        <span className="rounded bg-(--accent)/10 px-1.5 py-0.5 text-[10px] text-(--accent-text)">
                                            {BUFF_SCOPE_LABELS[item.scope] ?? item.scope}
                                        </span>
                                        {item.exclusive && (
                                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                                                效应专属
                                            </span>
                                        )}
                                    </div>
                                    <ul className="space-y-1">
                                        {item.buff_set.map((zone, i) => (
                                            <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                                <span className="truncate text-(--muted)">
                                                    {zoneLabel(zone.zoneId)}
                                                    {zone.ref && (
                                                        <span className="ml-1 text-[10px] text-sky-400">
                                                            引用{zoneLabel(zone.ref.targetZoneId)}×{zone.ref.pct}%
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="shrink-0 text-(--fg)">
                                                    {zone.override ? '覆盖+ ' : '+ '}
                                                    {zone.ref ? '引用' : zone.value}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                ))
            )}

            <p className=" border-t border-(--card-border) pt-4 text-center text-xs text-(--muted)">
                数据由维护方统一收录更新
                <Link href="/" className="ml-2 text-(--accent) hover:underline">
                    返回工程广场
                </Link>
            </p>
        </div>
    )
}