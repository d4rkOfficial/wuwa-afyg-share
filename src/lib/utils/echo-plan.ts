// 「标准词条集」plan 的纯函数校验 / 归一化 / 构造。
// 服务端 actions、公开 API 与管理页编辑页共用同一份规则，保证校验口径一致。
// 校验失败一律以 { ok: false, error } 返回（调用方不要抛未捕获异常）。

import {
    ECHO_COST_MULTISET,
    ECHO_COSTS,
    ECHO_SLOT_COUNT,
    ECHO_STAT_UNIT_SET,
    MAIN_STAT_TYPE_SET,
    SECOND_MAIN_STAT_DEFAULT,
    SECOND_MAIN_STAT_TYPE_WHITELIST,
    SUBSTAT_MAX_PER_SLOT,
    SUBSTAT_MIN_PER_SLOT,
    SUBSTAT_TOTAL_COUNT,
    SUBSTAT_TYPE_SET
} from '@/lib/consts/echo-stats'
import type { EchoPlan, EchoPlanSlot, EchoStatValue } from '@/lib/types/db'

export type EchoPlanValidation = { ok: true; plan: EchoPlan } | { ok: false; error: string }

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 归一化单条词条：type 去空白 + 白名单校验，value 必须为有限数字，unit 仅 '%' | '' */
function sanitizeStat(raw: unknown, allowedTypes: Set<string>, where: string): EchoStatValue | string {
    if (!isPlainObject(raw)) return `${where} 必须是 { type, value, unit } 对象`
    const type = typeof raw.type === 'string' ? raw.type.trim() : ''
    if (!type) return `${where} 缺少 type`
    if (!allowedTypes.has(type)) return `${where} 的 type「${type}」不在白名单内`
    const value = raw.value
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${where} 的 value 必须是有限数字`
    const unit = raw.unit ?? ''
    if (typeof unit !== 'string' || !ECHO_STAT_UNIT_SET.has(unit)) return `${where} 的 unit 只能是 "%" 或 ""`
    return { type, value, unit: unit as EchoStatValue['unit'] }
}

function sanitizeStatOrNull(
    raw: unknown,
    allowedTypes: Set<string>,
    where: string
): EchoStatValue | null | string {
    if (raw === null || raw === undefined) return null
    return sanitizeStat(raw, allowedTypes, where)
}

function sanitizeSlot(raw: unknown, index: number): EchoPlanSlot | string {
    const at = `第 ${index + 1} 号位`
    if (!isPlainObject(raw)) return `${at} 必须是对象`

    const cost = raw.cost
    if (typeof cost !== 'number' || !Number.isFinite(cost) || !(ECHO_COSTS as readonly number[]).includes(cost)) {
        return `${at} 的 cost 只能是 ${ECHO_COSTS.join(' / ')}`
    }

    const mainStat = sanitizeStatOrNull(raw.mainStat, MAIN_STAT_TYPE_SET, `${at} 主词条`)
    if (typeof mainStat === 'string') return mainStat

    const secondMainStat = sanitizeStatOrNull(
        raw.secondMainStat,
        SECOND_MAIN_STAT_TYPE_WHITELIST,
        `${at} 副主词条`
    )
    if (typeof secondMainStat === 'string') return secondMainStat

    if (!Array.isArray(raw.substats)) return `${at} 的 substats 必须是数组`
    if (raw.substats.length < SUBSTAT_MIN_PER_SLOT || raw.substats.length > SUBSTAT_MAX_PER_SLOT) {
        return `${at} 的副词条数量必须在 ${SUBSTAT_MIN_PER_SLOT}-${SUBSTAT_MAX_PER_SLOT} 条之间（当前 ${raw.substats.length} 条）`
    }
    const substats: EchoStatValue[] = []
    const seen = new Set<string>()
    for (let i = 0; i < raw.substats.length; i++) {
        const stat = sanitizeStat(raw.substats[i], SUBSTAT_TYPE_SET, `${at} 第 ${i + 1} 条副词条`)
        if (typeof stat === 'string') return stat
        if (seen.has(stat.type)) return `${at} 的副词条 type「${stat.type}」重复`
        seen.add(stat.type)
        substats.push(stat)
    }

    return { cost, mainStat, secondMainStat, substats }
}

/** 强校验并归一化整份 plan；返回只含白名单字段的干净对象 */
export function validateEchoPlan(raw: unknown): EchoPlanValidation {
    if (!isPlainObject(raw)) return { ok: false, error: 'plan 必须是 JSON 对象' }
    if (!Array.isArray(raw.slots)) return { ok: false, error: 'plan.slots 必须是数组' }
    if (raw.slots.length !== ECHO_SLOT_COUNT) {
        return { ok: false, error: `plan.slots 长度必须恰好为 ${ECHO_SLOT_COUNT}（当前 ${raw.slots.length}）` }
    }

    const slots: EchoPlanSlot[] = []
    for (let i = 0; i < raw.slots.length; i++) {
        const slot = sanitizeSlot(raw.slots[i], i)
        if (typeof slot === 'string') return { ok: false, error: slot }
        slots.push(slot)
    }

    // cost 多重集合必须恰好是 {4,3,3,1,1}（顺序任意，合计 12）
    const costs = slots
        .map((s) => s.cost)
        .sort((a, b) => a - b)
        .join(',')
    if (costs !== [...ECHO_COST_MULTISET].sort((a, b) => a - b).join(',')) {
        return { ok: false, error: `5 个部位的 cost 必须恰好是 ${ECHO_COST_MULTISET.join(' + ')}（顺序任意）` }
    }

    // 副词条总数必须恰好 14 条（工坊只保存标准 14 词条）
    const total = countPlanSubstats({ slots })
    if (total !== SUBSTAT_TOTAL_COUNT) {
        return { ok: false, error: `副词条总数必须恰好为 ${SUBSTAT_TOTAL_COUNT} 条（当前 ${total} 条）` }
    }

    return { ok: true, plan: { slots } }
}

/** 副词条总数（列表展示与服务端校验共用；对脏数据宽容，仅统计合法数组长度） */
export function countPlanSubstats(plan: EchoPlan | null | undefined): number {
    if (!plan || !Array.isArray(plan.slots)) return 0
    return plan.slots.reduce((sum, slot) => sum + (Array.isArray(slot?.substats) ? slot.substats.length : 0), 0)
}

/** 新建空方案：cost 依次 4 / 3 / 3 / 1 / 1，副主词条按 cost 填工具箱默认固定值 */
export function createEmptyEchoPlan(): EchoPlan {
    const costs = [...ECHO_COST_MULTISET]
    const slots: EchoPlanSlot[] = costs.map((cost) => ({
        cost,
        mainStat: null,
        secondMainStat: SECOND_MAIN_STAT_DEFAULT[cost] ? { ...SECOND_MAIN_STAT_DEFAULT[cost] } : null,
        substats: []
    }))
    return { slots }
}

/** 深拷贝（编辑页载入已有方案时避免直接引用服务端数据） */
export function cloneEchoPlan(plan: EchoPlan): EchoPlan {
    return {
        slots: plan.slots.map((slot) => ({
            cost: slot.cost,
            mainStat: slot.mainStat ? { ...slot.mainStat } : null,
            secondMainStat: slot.secondMainStat ? { ...slot.secondMainStat } : null,
            substats: slot.substats.map((s) => ({ ...s }))
        }))
    }
}
