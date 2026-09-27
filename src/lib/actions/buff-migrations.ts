'use server'

// Buff 集结构迁移（v1 → v2：乘区贡献条目列表 + 条件分层挂载）。
//
// 正式执行在数据库里完成（`0005_buff_set_v2.sql` 的 migrate_buff_sets_v2 / migrate_buff_set_snapshots_v2，
// 单事务、幂等），本文件只做三件事：
//   1. 读迁移记账表，告诉管理页「是否已迁移、当时的报告」；
//   2. dry-run：把现有行读出来在 Node 侧按同一套规则算一遍（不写库），供管理员确认；
//   3. 执行迁移（幂等，可重复跑：用于补跑新增行或还原旧快照后的残留）。

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/admin'
import {
    BUFF_SET_MIGRATION_NAME,
    BUFF_SET_STRUCT_VERSION,
    previewBuffSetMigration,
    type BuffSetMigrationReport
} from '@/lib/buff-snapshots/migrate-v2'
import type { BuffSetRow } from '@/lib/types/db'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
}

async function withAdmin() {
    const r = await requireAdmin()
    if (!r.ok || !r.supabase) return { supabase: null as never, error: r.error ?? '无权限' }
    return { supabase: r.supabase, error: null as string | null }
}

const BUFF_COLUMNS = 'entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set'

export interface BuffMigrationStatus {
    version: number
    applied: boolean
    appliedAt: string | null
    /** @desc 迁移时的报告（buff_sets + 快照统计） */
    report: Record<string, unknown> | null
}

/** @desc 读取结构版本迁移状态（表可能尚未创建 → 视为未迁移，不报错） */
export async function getBuffMigrationStatus(): Promise<ActionResult<BuffMigrationStatus>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }

    const { data, error } = await auth.supabase
        .from('buff_set_migrations')
        .select('version, applied_at, report')
        .eq('version', BUFF_SET_STRUCT_VERSION)
        .maybeSingle()

    if (error) {
        // 42P01 = 表不存在（migration 还没跑）
        if (error.code === '42P01') {
            return { data: { version: BUFF_SET_STRUCT_VERSION, applied: false, appliedAt: null, report: null } }
        }
        return { error: error.message }
    }

    const row = (data ?? null) as { version: number; applied_at: string; report: Record<string, unknown> } | null
    return {
        data: {
            version: BUFF_SET_STRUCT_VERSION,
            applied: !!row,
            appliedAt: row?.applied_at ?? null,
            report: row?.report ?? null
        }
    }
}

export interface BuffMigrationPreview {
    name: string
    runtime: BuffSetMigrationReport
}

/** @desc dry-run：按 v2 规则在 Node 侧对现有行算一遍改动（不写库） */
export async function previewBuffMigration(): Promise<ActionResult<BuffMigrationPreview>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }

    const { data, error } = await auth.supabase
        .from('buff_sets')
        .select(BUFF_COLUMNS)
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
    if (error) return { error: error.message }

    return {
        data: {
            name: BUFF_SET_MIGRATION_NAME,
            runtime: previewBuffSetMigration((data ?? []) as BuffSetRow[])
        }
    }
}

/**
 * @desc 执行迁移（幂等）：线上 buff_sets + 全部快照 state。
 * 数据库函数会先校验管理员身份（security definer），这里只负责选管理员会话并刷新页面。
 */
export async function runBuffMigration(): Promise<ActionResult<{ buffs: unknown; snapshots: unknown }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }

    const buffs = await auth.supabase.rpc('migrate_buff_sets_v2', { p_dry_run: false })
    if (buffs.error) return { error: `迁移 Buff 集失败：${buffs.error.message}` }

    const snapshots = await auth.supabase.rpc('migrate_buff_set_snapshots_v2', { p_dry_run: false })
    if (snapshots.error) return { error: `迁移快照失败：${snapshots.error.message}` }

    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')

    return { data: { buffs: buffs.data, snapshots: snapshots.data } }
}
