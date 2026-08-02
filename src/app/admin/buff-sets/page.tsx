import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Icon } from '@iconify/react'
import BuffSetEditor from '@/components/admin/buff-set-editor'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { BUFF_ENTITY_TYPES, BUFF_ENTITY_LABELS } from '@/lib/consts/buff-zones'
import type { BuffSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: 'Buff 集管理'
}

export const dynamic = 'force-dynamic'

export default async function AdminBuffSetsPage() {
    if (!hasEnv()) return <p className="text-(--muted)">服务未配置</p>

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/admin/buff-sets')

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
    if (!profile?.is_admin) {
        return (
            <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
                <Icon icon="mdi:shield-lock-outline" className="mx-auto size-12 text-(--muted)" />
                <h1 className="text-xl font-bold">无权限</h1>
                <p className="text-(--muted)">仅管理员可编辑 Buff 集内容。请确认你的账号已启用管理员权限。</p>
            </div>
        )
    }

    const { data } = await supabase
        .from('buff_sets')
        .select('entity_type, entity_name, buff_name, buff_set')
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
    const rows = (data ?? []) as BuffSetRow[]

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold">Buff 集管理</h1>
                <p className="mt-1 text-sm text-(--muted)">
                    管理员维护区，编辑即时发布。工具端下载与工坊读页自动同步。
                </p>
            </div>

            {/* 新增 */}
            <section className="space-y-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-(--accent-text)">
                    <Icon icon="mdi:plus-circle-outline" className="size-4" />
                    新增 Buff 集
                </h2>
                <BuffSetEditor initial={null} key="new" />
            </section>

            {/* 列表按实体类型分组 */}
            {BUFF_ENTITY_TYPES.map((type) => {
                const items = rows.filter((r) => r.entity_type === type)
                if (items.length === 0) return null
                return (
                    <section key={type} className="space-y-2">
                        <h2 className="text-sm font-semibold">
                            {BUFF_ENTITY_LABELS[type]}
                            <span className="ml-1.5 text-xs font-normal text-(--muted)">共 {items.length} 条</span>
                        </h2>
                        <div className="space-y-3">
                            {items.map((row) => (
                                <div key={`${row.entity_type}/${row.entity_name}/${row.buff_name}`} className="space-y-1.5">
                                    <div className="flex items-center gap-2 px-1">
                                        <span className="truncate text-sm font-medium">{row.entity_name}</span>
                                        <span className="shrink-0 rounded bg-(--accent)/10 px-1.5 py-0.5 text-[10px] text-(--accent-text)">
                                            {row.buff_name}
                                        </span>
                                    </div>
                                    <BuffSetEditor initial={row} />
                                </div>
                            ))}
                        </div>
                    </section>
                )
            })}

            {rows.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-(--muted)">
                    <Icon icon="mdi:package-variant-closed" className="size-5" />
                    还没有任何 Buff 集，先从上方新增一条吧。
                </p>
            )}
        </div>
    )
}