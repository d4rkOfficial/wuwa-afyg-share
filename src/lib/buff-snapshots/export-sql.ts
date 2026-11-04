// Buff 集全量 SQL 导出（纯函数）
// 生成可直接在 PostgreSQL / Supabase SQL Editor 执行的 INSERT 语句，
// 供任何用户备份或迁移快照/实时数据（v2：buff_sets + buff_folders）。

import type { BuffFolderRow, BuffSetRow } from '@/lib/types/db'

function sqlEscape(s: string): string {
    return s.replace(/'/g, "''")
}

export interface ExportMeta {
    source: string // 数据来源说明（最新快照 / 实时数据）
    exportedAt: string // ISO 时间
}

// 生成 INSERT SQL；行数 > 0 时批量 VALUES，空数据时仅输出说明注释
export function buffSetsToSql(rows: BuffSetRow[], folders: BuffFolderRow[], meta: ExportMeta): string {
    const header = [
        '-- ═══════════════════════════════════════════════════════════',
        '-- 椰果工坊 · Buff 集全量导出（v2）',
        `-- 来源：${meta.source}`,
        `-- 导出时间：${meta.exportedAt}`,
        '-- 目标表：public.buff_folders / public.buff_sets',
        '-- 可在 PostgreSQL / Supabase SQL Editor 直接执行',
        '-- ═══════════════════════════════════════════════════════════',
        ''
    ]

    if (rows.length === 0 && folders.length === 0) {
        return [...header, '-- （当前无任何 Buff 集数据）', ''].join('\n')
    }

    const folderLines = folders.map((folder) => {
        const id = folder.id ? `'${sqlEscape(folder.id)}'::uuid` : 'gen_random_uuid ()'
        return `(${id},'${sqlEscape(folder.entity_type)}','${sqlEscape(folder.entity_name)}','${sqlEscape(folder.name)}',${folder.sort_order ?? 0})`
    })
    const lines = rows.map((r) => {
        const id = r.id ? `'${sqlEscape(r.id)}'::uuid` : 'gen_random_uuid ()'
        const condition = r.condition == null ? 'NULL' : `'${sqlEscape(JSON.stringify(r.condition))}'::jsonb`
        const buffSet = `'${sqlEscape(JSON.stringify(r.buff_set))}'::jsonb`
        return `(${id},'${sqlEscape(r.entity_type)}','${sqlEscape(r.entity_name)}','${sqlEscape(r.buff_name)}','${sqlEscape(r.scope)}',${r.exclusive ? 'true' : 'false'},${condition},${buffSet},${r.sort_order ?? 0})`
    })

    const parts = [...header, 'BEGIN;']
    if (folderLines.length > 0) {
        parts.push(
            'INSERT INTO public.buff_folders (id, entity_type, entity_name, name, sort_order) VALUES',
            folderLines.join(',\n') + ';'
        )
    }
    if (lines.length > 0) {
        parts.push(
            'INSERT INTO public.buff_sets (id, entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set, sort_order) VALUES',
            lines.join(',\n') + ';'
        )
    }
    parts.push('COMMIT;', '')
    return parts.join('\n')
}
