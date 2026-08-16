'use server'

// Buff 集快照（根 + 版本链）：创建根/追加版本、列表、按目标对比、按目标恢复、删除最新版本。
// 快照只存基准与差异：根 = 全量（state），版本 = 相对前一状态的 diff，链式重建状态。

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/admin'
import {
    diffBuffSets,
    rebuildSnapshotState,
    serializeSnapshotState,
    type SnapshotDiff
} from '@/lib/buff-snapshots/diff'
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
const SNAPSHOT_COLUMNS = 'id, created_by, created_at, note, is_root, state, diff, prev_id'

async function fetchAllBuffSets(supabase: Awaited<ReturnType<typeof withAdmin>>['supabase']): Promise<BuffSetRow[]> {
    const { data } = await supabase
        .from('buff_sets')
        .select(BUFF_COLUMNS)
        .order('entity_type', { ascending: true })
        .order('entity_name', { ascending: true })
    return (data ?? []) as BuffSetRow[]
}

interface ChainSnapshot {
    id: string
    created_by: string | null
    created_at: string
    note: string
    is_root: boolean
    state: BuffSetRow[] | null
    diff: SnapshotDiff | null
}

// 读取快照链（按创建时间升序：根在前、版本依次在后）
async function loadChain(supabase: Awaited<ReturnType<typeof withAdmin>>['supabase']): Promise<ChainSnapshot[]> {
    const { data } = await supabase.from('buff_set_snapshot').select(SNAPSHOT_COLUMNS).order('created_at', { ascending: true })
    return (data ?? []) as ChainSnapshot[]
}

export interface BuffSnapshotView {
    id: string
    isRoot: boolean
    note: string
    createdBy: string | null
    createdAt: string
    isLatest: boolean // 链尾（无后继）
    canDelete: boolean // 最新版本且非根
}

export async function listBuffSnapshots(): Promise<ActionResult<{ snapshots: BuffSnapshotView[] }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const chain = await loadChain(supabase)
    const creatorIds = [...new Set(chain.map((s) => s.created_by).filter((v): v is string => !!v))]
    const nameById = new Map<string, string>()
    if (creatorIds.length > 0) {
        const { data: creators } = await supabase.from('profiles').select('id, username').in('id', creatorIds)
        for (const c of (creators ?? []) as Array<{ id: string; username: string }>) nameById.set(c.id, c.username)
    }

    const latestId = chain.length > 0 ? chain[chain.length - 1].id : null
    const snapshots = chain.map((s) => ({
        id: s.id,
        isRoot: s.is_root,
        note: s.note,
        createdBy: s.created_by ? (nameById.get(s.created_by) ?? null) : null,
        createdAt: s.created_at,
        isLatest: s.id === latestId,
        canDelete: !s.is_root && s.id === latestId
    }))

    return { data: { snapshots } }
}

// 创建 / 更新快照：无根 → 创建根（全量复制）；有根 → 追加版本（diff = 相对最新状态）
export async function saveBuffSnapshot(noteRaw: string): Promise<ActionResult<{ rows: number; mode: 'root' | 'version' }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const chain = await loadChain(supabase)
    const note = noteRaw.trim().slice(0, 100)
    const root = chain.find((s) => s.is_root)

    if (!root) {
        // 无根：原原本本复制整个 Buff 集
        const rows = await fetchAllBuffSets(supabase)
        const { error } = await supabase.rpc('save_buff_set_snapshot', {
            p_state: serializeSnapshotState(rows),
            p_diff: null,
            p_note: note
        })
        if (error) return { error: error.message }
        revalidatePath('/admin/buff-sets')
        return { data: { rows: rows.length, mode: 'root' } }
    }

    // 有根：重建最新版本状态 → 计算差异 → 追加版本
    const latestId = chain[chain.length - 1].id
    const prevState = rebuildSnapshotState(chain, latestId) ?? []
    const current = await fetchAllBuffSets(supabase)
    const diff = diffBuffSets(prevState, current)
    const diffCount = diff.added.length + diff.modified.length + diff.removed.length
    if (diffCount === 0) return { error: '当前 Buff 集与最新快照无差异，无需创建新版本' }

    const { error } = await supabase.rpc('save_buff_set_snapshot', {
        p_state: null,
        p_diff: diff,
        p_note: note
    })
    if (error) return { error: error.message }
    revalidatePath('/admin/buff-sets')
    return { data: { rows: diffCount, mode: 'version' } }
}

// 对比当前 Buff 集与指定快照（根或版本）的差异（现算）
export async function getBuffSnapshotDiff(
    targetId: string
): Promise<ActionResult<{ target: { isRoot: boolean; note: string; createdAt: string }; diff: SnapshotDiff; currentCount: number }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const chain = await loadChain(supabase)
    const target = chain.find((s) => s.id === targetId)
    if (!target) return { error: '快照不存在' }

    const targetState = rebuildSnapshotState(chain, targetId)
    if (!targetState) return { error: '暂无根快照' }

    const current = await fetchAllBuffSets(supabase)
    return {
        data: {
            target: { isRoot: target.is_root, note: target.note, createdAt: target.created_at },
            diff: diffBuffSets(targetState, current),
            currentCount: current.length
        }
    }
}

// 恢复到指定快照（目标状态由服务端重建；RPC 内级联删除比目标新的版本）
export async function restoreBuffSnapshot(targetId: string): Promise<ActionResult<{ restored: number }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const chain = await loadChain(supabase)
    const targetState = rebuildSnapshotState(chain, targetId)
    if (!targetState) return { error: '快照不存在或缺少根快照' }

    const { data, error } = await supabase.rpc('restore_buff_set_snapshot', {
        p_target: targetId,
        p_state: serializeSnapshotState(targetState)
    })
    if (error) return { error: error.message }
    const restored = ((data as [{ restored?: number }] | null)?.[0]?.restored) ?? 0

    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return { data: { restored } }
}

// 删除版本快照（仅最新版本；根与中间版本由 RPC 拒绝）
export async function deleteBuffSnapshot(id: string): Promise<ActionResult<{ message: string }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }

    const { data, error } = await auth.supabase.rpc('delete_buff_set_snapshot', { p_id: id })
    if (error) return { error: error.message }
    revalidatePath('/admin/buff-sets')
    return { data: { message: String(data ?? '') } }
}
