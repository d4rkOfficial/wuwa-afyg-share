import '@/design/wk-rows.css'
import '@/design/wk-data.css'
import Link from 'next/link'
import SetupNotice from '@/components/setup-notice'
import BuffSetsBrowser from '@/components/wk/buff-sets-browser'
import { WkContainer, WkPageHead, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import { getEntityIcons } from '@/lib/data/avatar-icons'
import { upgradeBuffSetRowV2 } from '@/lib/buff-snapshots/migrate-v2'
import type { BuffSetRow } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

export default async function BuffSetsPage() {
    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    // 只读 buff_sets：分组名（folder）是"游戏原文案"级别的一长串，本页不再展示，也就不必再查
    const { data, error } = await supabase
        .from('buff_sets')
        .select('id, entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set, sort_order')
        .order('sort_order', { ascending: true })

    // 读取边界归一化：v1 形状仍可能出现在这里（刚用旧快照还原过），按 v2 规则就地归一化后再渲染
    const rows = ((data ?? []) as BuffSetRow[]).map((row) => upgradeBuffSetRowV2(row).row)

    const {
        data: { user }
    } = await supabase.auth.getUser()
    const viewer = await getViewerLocks()
    const editable = !viewer.locks.buffSetsLocked
    const canEdit = editable || viewer.isAdmin
    const entityIcons = await getEntityIcons()
    const entityCount = new Set(rows.map((row) => `${row.entity_type}/${row.entity_name}`)).size

    return (
        <WkRoot>
            <WkContainer>
                <WkPageHead
                    title="Buff 集"
                    sub={`角色 / 武器 / 首位声骸 / 套装的固定增益数值，供工具箱一键导入 · ${entityCount} 个实体 · ${rows.length} 条 Buff`}
                    actions={
                        <>
                            <a
                                href="/api/buff-sets/export"
                                className="wk-btn"
                                title="下载最新快照（无快照时为当前数据）的全量 SQL，可在 PostgreSQL / Supabase 直接执行"
                            >
                                导出 SQL
                            </a>
                            {canEdit && (
                                <Link
                                    href={user ? '/edit/buff-sets' : '/login?redirect=/edit/buff-sets'}
                                    className={editable ? 'wk-btn wk-btn--primary' : 'wk-btn'}
                                    title={
                                        editable
                                            ? '编辑锁已关闭：登录后即可编辑（被单独锁定的条目仍仅管理员可改）'
                                            : 'Buff 集编辑锁开启中：仅管理员可编辑'
                                    }
                                >
                                    {editable ? (user ? '编辑 Buff 集' : '登录后编辑') : 'Buff 集管理'}
                                </Link>
                            )}
                        </>
                    }
                />

                <div style={{ marginTop: 16 }}>
                    {error ? (
                        <p className="wk-meta">加载失败：{error.message}</p>
                    ) : rows.length === 0 ? (
                        <p className="wk-meta" style={{ padding: '24px 0' }}>
                            暂时还没有收录任何 Buff 集
                        </p>
                    ) : (
                        <BuffSetsBrowser rows={rows} entityIcons={entityIcons} />
                    )}
                </div>
            </WkContainer>
        </WkRoot>
    )
}
