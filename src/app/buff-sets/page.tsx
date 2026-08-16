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

    // 底部管理入口：仅管理员可见
    const {
        data: { user }
    } = await supabase.auth.getUser()
    let isAdmin = false
    if (user) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_admin')
            .eq('id', user.id)
            .maybeSingle()
        isAdmin = !!profile?.is_admin
    }

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

            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-(--card-border) pt-4">
                <a
                    href="/api/buff-sets/export"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-(--card-border) bg-(--card) px-4 py-2 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                    title="下载最新快照（无快照时为当前数据）的全量 SQL，可在 PostgreSQL / Supabase 直接执行"
                >
                    <Icon icon="mdi:database-export-outline" className="size-4" />
                    导出 Buff 集全量 SQL
                </a>
                {isAdmin && (
                    <Link
                        href="/admin/buff-sets"
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-(--btn-text) transition-all hover:brightness-110"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon="mdi:shield-edit-outline" className="size-4" />
                        Buff 集管理
                    </Link>
                )}
            </div>
        </div>
    )
}
