// 「标准词条集」plan 的纯函数校验 / 归一化 / 构造。
// 服务端 actions、公开 API 与管理页编辑页共用同一份规则，保证校验口径一致。
// 校验失败一律以 { ok: false, error } 返回（调用方不要抛未捕获异常）。

import {
    defaultStatUnit,
    ECHO_COST_MULTISET,
    ECHO_COSTS,
    ECHO_MAX_TOTAL_COST,
    ECHO_SLOT_COUNT,
    mainStatMaxValue,
    secondMainStatFor,
    snapSubstatValue,
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

/**
 * 主词条：type 必须属于该 cost 的池子；**数值固定取满级上限、单位固定 '%'**（不接受自定义数值）。
 */
function sanitizeMainStat(raw: unknown, cost: number, where: string): EchoStatValue | null | string {
    if (raw === null || raw === undefined) return null
    if (!isPlainObject(raw)) return `${where} 必须是 { type, value, unit } 对象`
    const type = typeof raw.type === 'string' ? raw.type.trim() : ''
    if (!type) return `${where} 缺少 type`
    const max = mainStatMaxValue(cost, type)
    if (max === null) return `${where} 的 type「${type}」不适用于 cost ${cost}`
    return { type, value: max, unit: '%' }
}

/**
 * 副词条：type 必须在白名单内；**数值吸附到最近的合法档位**、单位按 type 自动（编辑页只允许选档位）。
 */
function sanitizeSubstat(raw: unknown, where: string): EchoStatValue | string {
    if (!isPlainObject(raw)) return `${where} 必须是 { type, value, unit } 对象`
    const type = typeof raw.type === 'string' ? raw.type.trim() : ''
    if (!type) return `${where} 缺少 type`
    if (!SUBSTAT_TYPE_SET.has(type)) return `${where} 的 type「${type}」不在白名单内`
    const value = raw.value
    if (typeof value !== 'number' || !Number.isFinite(value)) return `${where} 的 value 必须是有限数字`
    return { type, value: snapSubstatValue(type, value), unit: defaultStatUnit(type) }
}

function sanitizeSlot(raw: unknown, index: number): EchoPlanSlot | string {
    const at = `第 ${index + 1} 号位`
    if (!isPlainObject(raw)) return `${at} 必须是对象`

    const cost = raw.cost
    if (typeof cost !== 'number' || !Number.isFinite(cost) || !(ECHO_COSTS as readonly number[]).includes(cost)) {
        return `${at} 的 cost 只能是 ${ECHO_COSTS.join(' / ')}`
    }

    const mainStat = sanitizeMainStat(raw.mainStat, cost, `${at} 主词条`)
    if (typeof mainStat === 'string') return mainStat

    // 副主词条完全由 cost 自动推导（4→攻击150 / 3→攻击100 / 1→生命2280）
    const secondMainStat = secondMainStatFor(cost)

    if (!Array.isArray(raw.substats)) return `${at} 的 substats 必须是数组`
    if (raw.substats.length < SUBSTAT_MIN_PER_SLOT || raw.substats.length > SUBSTAT_MAX_PER_SLOT) {
        return `${at} 的副词条数量必须在 ${SUBSTAT_MIN_PER_SLOT}-${SUBSTAT_MAX_PER_SLOT} 条之间（当前 ${raw.substats.length} 条）`
    }
    const substats: EchoStatValue[] = []
    const seen = new Set<string>()
    for (let i = 0; i < raw.substats.length; i++) {
        const stat = sanitizeSubstat(raw.substats[i], `${at} 第 ${i + 1} 条副词条`)
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

    // cost 组合不限（不强制 43311），只要 5 个部位合计不超过上限
    const totalCost = slots.reduce((sum, s) => sum + s.cost, 0)
    if (totalCost > ECHO_MAX_TOTAL_COST) {
        return {
            ok: false,
            error: `5 个部位的 cost 合计不能超过 ${ECHO_MAX_TOTAL_COST}（当前 ${totalCost}）`
        }
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

/** 新建空方案：cost 用默认布局 4 / 3 / 3 / 1 / 1（可自由调整），副主词条按 cost 自动推导 */
export function createEmptyEchoPlan(): EchoPlan {
    const costs = [...ECHO_COST_MULTISET]
    const slots: EchoPlanSlot[] = costs.map((cost) => ({
        cost,
        mainStat: null,
        secondMainStat: secondMainStatFor(cost),
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
