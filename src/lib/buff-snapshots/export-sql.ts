// Buff 集全量 SQL 导出（纯函数）
// 生成可直接在 PostgreSQL / Supabase SQL Editor 执行的 INSERT 语句，
// 供任何用户备份或迁移快照/实时数据。

import type { BuffSetRow } from '@/lib/types/db'

function sqlEscape(s: string): string {
    return s.replace(/'/g, "''")
}

export interface ExportMeta {
    source: string // 数据来源说明（最新快照 / 实时数据）
    exportedAt: string // ISO 时间
}

// 生成 INSERT SQL；行数 > 0 时批量 VALUES，空数据时仅输出说明注释
export function buffSetsToSql(rows: BuffSetRow[], meta: ExportMeta): string {
    const header = [
        '-- ═══════════════════════════════════════════════════════════',
        '-- 椰果工坊 · Buff 集全量导出',
        `-- 来源：${meta.source}`,
        `-- 导出时间：${meta.exportedAt}`,
        '-- 目标表：public.buff_sets (entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set)',
        '-- 可在 PostgreSQL / Supabase SQL Editor 直接执行',
        '-- ═══════════════════════════════════════════════════════════',
        ''
    ]

    if (rows.length === 0) {
        return [...header, '-- （当前无任何 Buff 集数据）', ''].join('\n')
    }

    const lines = rows.map((r) => {
        const condition = r.condition == null ? 'NULL' : `'${sqlEscape(JSON.stringify(r.condition))}'::jsonb`
        const buffSet = `'${sqlEscape(JSON.stringify(r.buff_set))}'::jsonb`
        return `('${sqlEscape(r.entity_type)}','${sqlEscape(r.entity_name)}','${sqlEscape(r.buff_name)}','${sqlEscape(r.scope)}',${r.exclusive ? 'true' : 'false'},${condition},${buffSet})`
    })

    return [
        ...header,
        'BEGIN;',
        `INSERT INTO public.buff_sets (entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set) VALUES`,
        lines.join(',\n') + ';',
        'COMMIT;',
        ''
    ].join('\n')
}
