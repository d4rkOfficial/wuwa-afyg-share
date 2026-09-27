/**
 * @desc Buff 集 v2 迁移纯函数层（与 `supabase/migrations/0005_buff_set_v2.sql` 同一套口径）。
 *
 * 为什么 TS 侧还要有一份：迁移正式执行在数据库里（单事务、幂等），但管理员需要**先看报告再决定**。
 * 用 `previewBuffSetMigration()` 在服务端对现有行做 dry-run，既能给出与 SQL 完全一致的预期结果，
 * 又不会在预览阶段写库。两侧任何一侧改了规则，另一侧的 `buffSetMigrateCase` 测试会暴露漂移。
 *
 * v1 → v2 的差异（迁移原因见 migration 文件头）：
 *   · buff_set[]：每条只有 { zoneId, value, ref?, override? }，一个乘区只能出现一次
 *                → 乘区贡献条目列表（同乘区可多条、带乘区级 condition、覆盖唯一）
 *   · condition：实例级单值 { chain? , refinement? } + 混挂的 elements/damageTypes
 *                → chains/refinements[{ charIdx, min }]（链阶互斥），属性/类型下放到每个乘区
 */

import type { BuffCondition, BuffSetRow, BuffZoneRef, BuffZoneValue } from '@/lib/types/db'
import { sanitizeCondition, resolveBuffZoneId, BUFF_ZONE_MAP, ZONE_NO_REF_IDS, ZONE_NO_OVERRIDE_IDS } from '@/lib/consts/buff-zones'

/** @desc 当前 Buff 集结构版本（v2 = 乘区贡献条目列表 + 条件分层挂载） */
export const BUFF_SET_STRUCT_VERSION = 2
export const BUFF_SET_MIGRATION_NAME = 'buff_set_v2：乘区贡献条目列表 + 条件分层挂载'

/** @desc 改动项文案（报告与界面共用；顺序即统计顺序） */
export const BUFF_SET_CHANGE_LABELS = {
    'buff_set[].zoneId(未知乘区已剔除)': '剔除未知乘区',
    'buff_set[].zoneId(旧 id 重映射)': '旧乘区 id 重映射',
    'buff_set[].condition(实例级条件下放)': '实例级条件下放到乘区',
    'buff_set[].override(覆盖唯一/该乘区不支持)': '覆盖标记规范化',
    'buff_set[].ref(层数类乘区不支持引用)': '剔除层数类乘区的引用',
    'buff_set[].ref(非法引用已剔除)': '剔除非法引用',
    condition: '实例级条件升级为数组',
    'scope(非法值兜底 team)': 'scope 非法值兜底',
    exclusive: 'exclusive 归一化'
} as const

export type BuffSetChangeKey = keyof typeof BUFF_SET_CHANGE_LABELS

export interface BuffSetMigrateResult {
    /** @desc 该行已是 v2，无需改动（幂等：对已是 v2 的行返回 already=true） */
    already: boolean
    row: BuffSetRow
    changes: BuffSetChangeKey[]
}

const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/**
 * @desc 实例级条件是否还是 v1 形态：存在旧单值 chain/refinement，或把属性/类型挂在了实例级。
 * 用"形态判断"而不是 JSON 字符串比较，避免把 `condition: null` 与 `{}`、键序差异误报成改动。
 */
const isLegacyInstanceCondition = (raw: unknown): boolean => {
    const c = asRecord(raw)
    if (typeof c.chain === 'number' || typeof c.refinement === 'number') return true
    if (Array.isArray(c.elements) && c.elements.length > 0) return true
    if (Array.isArray(c.damageTypes) && c.damageTypes.length > 0) return true
    return false
}

/** @desc 实例级条件里的属性/类型被下放后，清理成空对象 */
const compactCondition = (cond: BuffCondition): BuffCondition | null => {
    const out: BuffCondition = {}
    if (cond.chains?.length) out.chains = cond.chains
    if (!cond.chains?.length && cond.refinements?.length) out.refinements = cond.refinements
    if (cond.elements?.length) out.elements = cond.elements
    if (cond.damageTypes?.length) out.damageTypes = cond.damageTypes
    return Object.keys(out).length > 0 ? out : null
}

/** @desc 合并两段乘区级条件（属性/类型各自并集去重；与 SQL 的 union + distinct 等价） */
const mergeZoneConditions = (a: BuffCondition, b: BuffCondition): BuffCondition | null => {
    const elements = [...new Set([...(a.elements ?? []), ...(b.elements ?? [])])]
    const damageTypes = [...new Set([...(a.damageTypes ?? []), ...(b.damageTypes ?? [])])]
    const out: BuffCondition = {}
    if (elements.length) out.elements = elements
    if (damageTypes.length) out.damageTypes = damageTypes
    return Object.keys(out).length > 0 ? out : null
}

/** @desc 引用清洗：目标必须在引用白名单内、pct 必须是数字，且该乘区允许引用 */
function sanitizeRefV2(raw: unknown, zoneId: string): BuffZoneRef | undefined {
    if (ZONE_NO_REF_IDS.has(zoneId)) return undefined
    const r = asRecord(raw)
    const targetZoneId = typeof r.targetZoneId === 'string' ? r.targetZoneId : ''
    const pct = typeof r.pct === 'number' && Number.isFinite(r.pct) ? r.pct : NaN
    if (!targetZoneId || !Number.isFinite(pct)) return undefined
    const out: BuffZoneRef = { targetZoneId, pct }
    if (typeof r.threshold === 'number' && Number.isFinite(r.threshold)) out.threshold = r.threshold
    if (typeof r.lower === 'number' && Number.isFinite(r.lower)) out.lower = r.lower
    if (typeof r.upper === 'number' && Number.isFinite(r.upper)) out.upper = r.upper
    if (r.discrete === true) out.discrete = true
    if (typeof r.divisor === 'number' && Number.isFinite(r.divisor)) out.divisor = r.divisor
    if (typeof r.multiplier === 'number' && Number.isFinite(r.multiplier)) out.multiplier = r.multiplier
    if (r.refOwner === 'self' || r.refOwner === 'owner') out.refOwner = r.refOwner
    return out
}

/**
 * @desc 升级一行 Buff 集到 v2（纯函数、幂等）。
 * 与 `public.buff_set_upgrade_row_v2(jsonb)` 逐步等价，改动项文案也保持一致。
 */
export function upgradeBuffSetRowV2(input: BuffSetRow): BuffSetMigrateResult {
    const raw = asRecord(input as unknown)
    const changes = new Set<BuffSetChangeKey>()

    const zoneInput = Array.isArray(raw.buff_set) ? (raw.buff_set as unknown[]) : []
    const instanceCondition = sanitizeCondition(raw.condition, 'buff') ?? {}

    // ── 乘区条目：倒序遍历（覆盖「同乘区只保留一个」时后出现者优先）──
    const overrideSeen = new Set<string>()
    const zones: BuffZoneValue[] = []
    for (let i = zoneInput.length - 1; i >= 0; i--) {
        const entry = asRecord(zoneInput[i])
        const rawZoneId = typeof entry.zoneId === 'string' ? entry.zoneId : ''
        if (!rawZoneId) continue
        const zoneId = resolveBuffZoneId(rawZoneId)
        if (!BUFF_ZONE_MAP.has(zoneId)) continue
        if (zoneId !== rawZoneId) changes.add('buff_set[].zoneId(旧 id 重映射)')

        const ref = sanitizeRefV2(entry.ref, zoneId)
        if (entry.ref && !ref) {
            changes.add(
                ZONE_NO_REF_IDS.has(zoneId)
                    ? 'buff_set[].ref(层数类乘区不支持引用)'
                    : 'buff_set[].ref(非法引用已剔除)'
            )
        }

        let override = entry.override === true
        if (override && (ref || ZONE_NO_OVERRIDE_IDS.has(zoneId))) override = false
        if (override && overrideSeen.has(zoneId)) override = false
        if (entry.override === true && !override) changes.add('buff_set[].override(覆盖唯一/该乘区不支持)')
        if (override) overrideSeen.add(zoneId)

        const own = sanitizeCondition(asRecord(entry.condition), 'zone') ?? {}
        const merged = mergeZoneConditions(own, instanceCondition)
        if (merged && (instanceCondition.elements?.length || instanceCondition.damageTypes?.length)) {
            changes.add('buff_set[].condition(实例级条件下放)')
        }

        const zone: BuffZoneValue = { zoneId, value: typeof entry.value === 'number' ? entry.value : 0 }
        if (override) zone.override = true
        if (ref) zone.ref = ref
        if (merged) zone.condition = merged
        zones.unshift(zone)
    }

    // ── 实例级条件：链/阶升级为数组 + 链阶互斥（属性/类型保留，仅作兼容读取）──
    const condition = compactCondition(instanceCondition)
    if (isLegacyInstanceCondition(raw.condition)) changes.add('condition')

    // ── scope / exclusive 兜底 ──
    const allowedScopes = ['self', 'self_except', 'team', 'effect_only']
    let scope = input.scope
    if (!scope || !allowedScopes.includes(scope)) {
        scope = 'team'
        changes.add('scope(非法值兜底 team)')
    }
    const exclusive = !!input.exclusive

    const row: BuffSetRow = {
        entity_type: input.entity_type,
        entity_name: input.entity_name,
        buff_name: input.buff_name,
        scope,
        exclusive,
        condition,
        buff_set: zones
    }

    return { already: changes.size === 0, row, changes: [...changes].slice(0, 3) }
}

export interface BuffSetMigrationReport {
    version: number
    total: number
    changed: number
    alreadyV2: number
    emptyZoneRows: number
    changeCounts: Partial<Record<BuffSetChangeKey, number>>
    sample: { entity: string; changes: BuffSetChangeKey[] }[]
}

/**
 * @desc 对现有 Buff 集做 dry-run：逐行升级、统计改动，不写库。
 * 返回结构与 `public.migrate_buff_sets_v2(true)` 的报告一致，便于界面直接复用同一套展示。
 */
export function previewBuffSetMigration(rows: BuffSetRow[], sampleLimit = 20): BuffSetMigrationReport {
    const changeCounts: Partial<Record<BuffSetChangeKey, number>> = {}
    const sample: { entity: string; changes: BuffSetChangeKey[] }[] = []
    let changed = 0
    let alreadyV2 = 0
    let emptyZoneRows = 0

    for (const row of rows) {
        const res = upgradeBuffSetRowV2(row)
        if (res.already) {
            alreadyV2++
            continue
        }
        changed++
        if (res.row.buff_set.length === 0) emptyZoneRows++
        for (const key of res.changes) changeCounts[key] = (changeCounts[key] ?? 0) + 1
        if (sample.length < sampleLimit) {
            sample.push({
                entity: `${row.entity_type}/${row.entity_name}/${row.buff_name}`,
                changes: res.changes
            })
        }
    }

    return { version: BUFF_SET_STRUCT_VERSION, total: rows.length, changed, alreadyV2, emptyZoneRows, changeCounts, sample }
}
