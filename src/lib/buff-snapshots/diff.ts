// Buff 集快照 diff 引擎（v2：state = { buffs, folders }，纯函数，无 IO）
// 根快照存全量基准；版本快照存相对前一状态的差异；任意版本 = 根 state + 按链顺序 applyDiff。

import type { BuffFolderRow, BuffSetRow, BuffSnapshotState } from '@/lib/types/db'

export interface SnapshotDiffModified {
    old: BuffSetRow
    new: BuffSetRow
}

export interface SnapshotDiffRemoved {
    old: BuffSetRow
}

export interface FolderDiffModified {
    old: BuffFolderRow
    new: BuffFolderRow
}

export interface FolderDiffRemoved {
    old: BuffFolderRow
}

export interface SnapshotDiff {
    added: BuffSetRow[]
    modified: SnapshotDiffModified[]
    removed: SnapshotDiffRemoved[]
    folders: {
        added: BuffFolderRow[]
        modified: FolderDiffModified[]
        removed: FolderDiffRemoved[]
    }
}

// 行键只作为内存 Map 去重键，不序列化进 PostgreSQL jsonb（\u0000 会被 PG 拒绝）
export function buffRowKey(row: Pick<BuffSetRow, 'entity_type' | 'entity_name' | 'buff_name'>): string {
    return `${row.entity_type}\u0000${row.entity_name}\u0000${row.buff_name}`
}

export function folderRowKey(row: Pick<BuffFolderRow, 'entity_type' | 'entity_name' | 'name'>): string {
    return `${row.entity_type}\u0000${row.entity_name}\u0000${row.name}`
}

// 深层稳定序列化（对象键排序），避免 jsonb/JSON.parse 键序差异产生假 diff
function stableStringify(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
    if (v && typeof v === 'object') {
        const obj = v as Record<string, unknown>
        const keys = Object.keys(obj).sort()
        return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
    }
    return JSON.stringify(v)
}

// 规范化行：buff_set 按 zoneId 排序，同 zoneId 的多条贡献条目再按内容排序
function canonicalRow(row: BuffSetRow): unknown {
    return {
        entity_type: row.entity_type,
        entity_name: row.entity_name,
        buff_name: row.buff_name,
        scope: row.scope,
        exclusive: !!row.exclusive,
        condition: row.condition ?? null,
        buff_set: [...row.buff_set].sort((a, b) => {
            if (a.zoneId !== b.zoneId) return a.zoneId < b.zoneId ? -1 : 1
            return stableStringify(a) < stableStringify(b) ? -1 : stableStringify(a) > stableStringify(b) ? 1 : 0
        })
    }
}

export function buffRowsEqual(a: BuffSetRow, b: BuffSetRow): boolean {
    return stableStringify(canonicalRow(a)) === stableStringify(canonicalRow(b))
}

export function folderRowsEqual(a: BuffFolderRow, b: BuffFolderRow): boolean {
    return a.name === b.name && (a.sort_order ?? 0) === (b.sort_order ?? 0)
}

// base = 基准状态（快照），current = 当前实时状态
export function diffBuffSets(base: BuffSnapshotState, current: BuffSnapshotState): SnapshotDiff {
    const baseMap = new Map(base.buffs.map((r) => [buffRowKey(r), r]))
    const currentMap = new Map(current.buffs.map((r) => [buffRowKey(r), r]))

    const added: BuffSetRow[] = []
    const modified: SnapshotDiffModified[] = []
    const removed: SnapshotDiffRemoved[] = []

    for (const [key, row] of currentMap) {
        const baseRow = baseMap.get(key)
        if (!baseRow) added.push(row)
        else if (!buffRowsEqual(baseRow, row)) modified.push({ old: baseRow, new: row })
    }
    for (const [key, row] of baseMap) {
        if (!currentMap.has(key)) removed.push({ old: row })
    }

    const baseFolders = new Map(base.folders.map((r) => [folderRowKey(r), r]))
    const currentFolders = new Map(current.folders.map((r) => [folderRowKey(r), r]))
    const folderDiff = {
        added: [] as BuffFolderRow[],
        modified: [] as FolderDiffModified[],
        removed: [] as FolderDiffRemoved[]
    }
    for (const [key, row] of currentFolders) {
        const baseRow = baseFolders.get(key)
        if (!baseRow) folderDiff.added.push(row)
        else if (!folderRowsEqual(baseRow, row)) folderDiff.modified.push({ old: baseRow, new: row })
    }
    for (const [key, row] of baseFolders) {
        if (!currentFolders.has(key)) folderDiff.removed.push({ old: row })
    }

    return { added, modified, removed, folders: folderDiff }
}

// 快照 state 序列化（JSON 可序列化，直接传给 RPC jsonb 参数）
export function serializeSnapshotState(state: BuffSnapshotState): unknown {
    return {
        buffs: state.buffs.map((r) => ({
            entity_type: r.entity_type,
            entity_name: r.entity_name,
            buff_name: r.buff_name,
            scope: r.scope,
            exclusive: !!r.exclusive,
            condition: r.condition ?? null,
            buff_set: r.buff_set,
            sort_order: r.sort_order ?? 0
        })),
        folders: state.folders.map((r) => ({
            entity_type: r.entity_type,
            entity_name: r.entity_name,
            name: r.name,
            sort_order: r.sort_order ?? 0
        }))
    }
}

// 应用 diff 到基准状态（链式重建用）
export function applyDiff(base: BuffSnapshotState, diff: SnapshotDiff): BuffSnapshotState {
    const buffs = new Map(base.buffs.map((r) => [buffRowKey(r), r]))
    for (const row of diff.added ?? []) buffs.set(buffRowKey(row), row)
    for (const m of diff.modified ?? []) buffs.set(buffRowKey(m.new), m.new)
    for (const r of diff.removed ?? []) buffs.delete(buffRowKey(r.old))

    const folders = new Map(base.folders.map((r) => [folderRowKey(r), r]))
    for (const row of diff.folders?.added ?? []) folders.set(folderRowKey(row), row)
    for (const m of diff.folders?.modified ?? []) folders.set(folderRowKey(m.new), m.new)
    for (const r of diff.folders?.removed ?? []) folders.delete(folderRowKey(r.old))

    return { buffs: [...buffs.values()], folders: [...folders.values()] }
}

// 由根 state 与版本链重建任意快照的完整状态
export function rebuildSnapshotState(
    chain: Array<{ id: string; is_root: boolean; state: BuffSnapshotState | null; diff: SnapshotDiff | null }>,
    targetId: string | null
): BuffSnapshotState | null {
    const root = chain.find((s) => s.is_root)
    if (!root) return null
    const empty: BuffSnapshotState = { buffs: [], folders: [] }
    const rootState = root.state ?? empty
    if (!targetId || targetId === root.id) {
        return { buffs: [...rootState.buffs], folders: [...rootState.folders] }
    }
    let state = { buffs: [...rootState.buffs], folders: [...rootState.folders] }
    for (const snap of chain) {
        if (snap.is_root || !snap.diff) continue
        state = applyDiff(state, snap.diff)
        if (snap.id === targetId) break
    }
    return state
}
