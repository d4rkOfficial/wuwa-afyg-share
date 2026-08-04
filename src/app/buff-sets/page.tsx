import Link from 'next/link'
import { Icon } from '@iconify/react'
import SetupNotice from '@/components/setup-notice'
import BuffSetsBrowser from '@/components/buff-sets-browser'
import { createClient, hasEnv } from '@/lib/supabase/server'
import type { BuffSetRow } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

export default async function BuffSetsPage() {
    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('buff_sets')
        .select('entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set')

    const rows = (data ?? []) as BuffSetRow[]

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl font-bold">Buff 集</h1>
                <p className="text-sm text-(--muted)">
                    游戏内角色 / 武器 / 首位声骸 / 套装的固定增益数值，供工具箱一键导入。左侧选实体，右侧看明细。
                </p>
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
                <BuffSetsBrowser rows={rows} />
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
