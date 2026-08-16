// 公开 API：Buff 集全量 SQL 导出（任何用户可下载，无需登录）
// 数据源优先取最新快照状态（根 + 版本链重建）；无快照时回退为当前实时数据。

import { createClient, hasEnv } from '@/lib/supabase/server'
import { rebuildSnapshotState, type SnapshotDiff } from '@/lib/buff-snapshots/diff'
import { buffSetsToSql } from '@/lib/buff-snapshots/export-sql'
import type { BuffSetRow } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

const BUFF_COLUMNS = 'entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set'
const SNAPSHOT_COLUMNS = 'id, created_at, note, is_root, state, diff'

export async function GET() {
    if (!hasEnv()) return Response.json({ error: '服务未配置' }, { status: 503 })

    const supabase = await createClient()

    // 优先：最新快照状态（根 + 版本链重建，null = 重建到最新）
    let rows: BuffSetRow[] | null = null
    let source = '最新快照'
    const { data: chainData } = await supabase
        .from('buff_set_snapshot')
        .select(SNAPSHOT_COLUMNS)
        .order('created_at', { ascending: true })
    const chain = (chainData ?? []) as Array<{
        id: string
        is_root: boolean
        state: BuffSetRow[] | null
        diff: SnapshotDiff | null
    }>
    if (chain.length > 0 && chain.some((s) => s.is_root)) {
        rows = rebuildSnapshotState(chain, null)
    }

    // 兜底：无快照时导出当前实时数据
    if (!rows) {
        source = '实时数据（暂无快照）'
        const { data } = await supabase.from('buff_sets').select(BUFF_COLUMNS)
        rows = (data ?? []) as BuffSetRow[]
    }

    const sql = buffSetsToSql(rows, { source, exportedAt: new Date().toISOString() })

    const d = new Date()
    const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

    return new Response(sql, {
        headers: {
            'Content-Type': 'application/sql; charset=utf-8',
            'Content-Disposition': `attachment; filename="buff-sets-${date}.sql"`
        }
    })
}
