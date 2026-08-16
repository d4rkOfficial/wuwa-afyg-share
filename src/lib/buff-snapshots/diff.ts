// Buff 集快照 diff 引擎（纯函数，无 IO）
// 根快照存全量基准；版本快照存相对前一状态的差异（{added, modified, removed}）。
// 任意版本状态 = 根 state + 按链顺序依次 applyDiff；差异只在对比/创建时现算，不落库。

import type { BuffSetRow } from '@/lib/types/db'

export interface SnapshotDiffModified {
    key: string
    old: BuffSetRow
    new: BuffSetRow
}

export interface SnapshotDiffRemoved {
    key: string
    old: BuffSetRow
}

export interface SnapshotDiff {
    added: BuffSetRow[]
    modified: SnapshotDiffModified[]
    removed: SnapshotDiffRemoved[]
}

// 行键：entity_type 为固定枚举不含分隔符；\u0000 不可能出现在合法输入中
export function buffRowKey(row: Pick<BuffSetRow, 'entity_type' | 'entity_name' | 'buff_name'>): string {
    return `${row.entity_type}\u0000${row.entity_name}\u0000${row.buff_name}`
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

// 规范化行：buff_set 按 zoneId 排序（编辑/生成顺序可能不同，比较前归一化）
function canonicalRow(row: BuffSetRow): unknown {
    return {
        entity_type: row.entity_type,
        entity_name: row.entity_name,
        buff_name: row.buff_name,
        scope: row.scope,
        exclusive: !!row.exclusive,
        condition: row.condition ?? null,
        buff_set: [...row.buff_set].sort((a, b) => (a.zoneId < b.zoneId ? -1 : a.zoneId > b.zoneId ? 1 : 0))
    }
}

export function buffRowsEqual(a: BuffSetRow, b: BuffSetRow): boolean {
    return stableStringify(canonicalRow(a)) === stableStringify(canonicalRow(b))
}

// base = 基准状态（快照），current = 当前实时状态
export function diffBuffSets(base: BuffSetRow[], current: BuffSetRow[]): SnapshotDiff {
    const baseMap = new Map(base.map((r) => [buffRowKey(r), r]))
    const currentMap = new Map(current.map((r) => [buffRowKey(r), r]))

    const added: BuffSetRow[] = []
    const modified: SnapshotDiffModified[] = []
    const removed: SnapshotDiffRemoved[] = []

    for (const [key, row] of currentMap) {
        const baseRow = baseMap.get(key)
        if (!baseRow) added.push(row)
        else if (!buffRowsEqual(baseRow, row)) modified.push({ key, old: baseRow, new: row })
    }
    for (const [key, row] of baseMap) {
        if (!currentMap.has(key)) removed.push({ key, old: row })
    }

    return { added, modified, removed }
}

// 快照 state 序列化：行数组（JSON 可序列化，直接传给 RPC jsonb 参数）
export function serializeSnapshotState(rows: BuffSetRow[]): unknown {
    return rows.map((r) => ({
        entity_type: r.entity_type,
        entity_name: r.entity_name,
        buff_name: r.buff_name,
        scope: r.scope,
        exclusive: !!r.exclusive,
        condition: r.condition ?? null,
        buff_set: r.buff_set
    }))
}

// 应用 diff 到基准状态（链式重建用）：added 加入 / modified 替换 / removed 删除
export function applyDiff(base: BuffSetRow[], diff: SnapshotDiff): BuffSetRow[] {
    const map = new Map(base.map((r) => [buffRowKey(r), r]))
    for (const row of diff.added ?? []) map.set(buffRowKey(row), row)
    for (const m of diff.modified ?? []) map.set(buffRowKey(m.new), m.new)
    for (const r of diff.removed ?? []) map.delete(buffRowKey(r.old))
    return [...map.values()]
}

// 由根 state 与版本链重建任意快照的完整状态
// chain：按创建时间升序（根在前、版本依次在后）；targetId 为根或 null 时返回根状态
export function rebuildSnapshotState(
    chain: Array<{ id: string; is_root: boolean; state: BuffSetRow[] | null; diff: SnapshotDiff | null }>,
    targetId: string | null
): BuffSetRow[] | null {
    const root = chain.find((s) => s.is_root)
    if (!root) return null
    if (!targetId || targetId === root.id) return [...(root.state ?? [])]
    let state = [...(root.state ?? [])]
    for (const snap of chain) {
        if (snap.is_root || !snap.diff) continue
        state = applyDiff(state, snap.diff)
        if (snap.id === targetId) break
    }
    return state
}
