// 「标准词条集」词条白名单与限额。
// 与 wuwa-afyg-tool 的 SUBSTAT_LABELS / MAIN_STAT_POOL / SECOND_MAIN_STAT 保持一致：
// 工具箱拉取本工坊保存的方案后，直接按同一套 type 字符串写入角色词条配置。

import type { EchoStatValue } from '@/lib/types/db'

// 副词条白名单（长度 13，对齐工具箱 SUBSTAT_LABELS）
export const SUBSTAT_TYPES = [
    '生命',
    '攻击',
    '防御',
    '生命%',
    '攻击%',
    '防御%',
    '暴击率',
    '暴击伤害',
    '共鸣效率',
    '普攻伤害加成',
    '重击伤害加成',
    '共鸣技能伤害加成',
    '共鸣解放伤害加成'
] as const

export type SubstatType = (typeof SUBSTAT_TYPES)[number]

export const SUBSTAT_TYPE_SET = new Set<string>(SUBSTAT_TYPES)

/** @desc 新增副词条的推荐顺序：前两条固定先给暴击率、暴击伤害，其余按白名单顺序 */
export const SUBSTAT_ADD_ORDER: string[] = [
    '暴击率',
    '暴击伤害',
    ...SUBSTAT_TYPES.filter((t) => t !== '暴击率' && t !== '暴击伤害')
]

/** 副词条各档位固定值（对齐工具箱 SUBSTAT_TIERS）：编辑器只能从档位里选，不接受自由填写 */
export const SUBSTAT_TIERS: Record<SubstatType, number[]> = {
    生命: [320, 360, 390, 430, 470, 510, 540, 580],
    攻击: [30, 40, 50, 60],
    防御: [40, 50, 60, 70],
    '生命%': [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
    '攻击%': [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
    '防御%': [8.1, 9, 10, 10.9, 11.8, 12.8, 13.8, 14.7],
    暴击率: [6.3, 6.9, 7.5, 8.1, 8.7, 9.3, 9.9, 10.5],
    暴击伤害: [12.6, 13.8, 15, 16.2, 17.4, 18.6, 19.8, 21],
    共鸣效率: [6.8, 7.6, 8.4, 9.2, 10, 10.8, 11.6, 12.4],
    普攻伤害加成: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
    重击伤害加成: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
    共鸣技能伤害加成: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6],
    共鸣解放伤害加成: [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6]
}

/** @desc 某副词条的合法档位表（未知 type 返回空数组） */
export function substatTiers(type: string): number[] {
    return SUBSTAT_TIERS[type as SubstatType] ?? []
}

/** @desc 把任意数值吸附到最近的合法档位（兼容手写 JSON / 历史数据） */
export function snapSubstatValue(type: string, value: number): number {
    const tiers = substatTiers(type)
    if (tiers.length === 0) return Number.isFinite(value) ? value : 0
    if (!Number.isFinite(value)) return tiers[0]
    return tiers.reduce((best, t) => (Math.abs(t - value) < Math.abs(best - value) ? t : best), tiers[0])
}

/** @desc 副词条中位档（偏低位）：新增副词条时的默认数值 */
export function midSubstatValue(type: string): number {
    const tiers = substatTiers(type)
    return tiers.length > 0 ? tiers[Math.floor((tiers.length - 1) / 2)] : 0
}

// 主词条白名单（对齐工具箱 MAIN_STAT_POOL 的并集：cost 4/3/1 三张池子的 type 合集）
export const MAIN_STAT_TYPES = [
    '暴击率',
    '暴击伤害',
    '攻击%',
    '生命%',
    '防御%',
    '共鸣效率',
    '冷凝伤害加成',
    '热熔伤害加成',
    '导电伤害加成',
    '气动伤害加成',
    '衍射伤害加成',
    '湮灭伤害加成'
] as const

export type MainStatType = (typeof MAIN_STAT_TYPES)[number]

export const MAIN_STAT_TYPE_SET = new Set<string>(MAIN_STAT_TYPES)

export interface MainStatOption {
    type: string
    /** 满级上限（工具箱 MAIN_STAT_POOL 的 maxValue），仅用于编辑页提示 */
    maxValue: number
}

// 游戏内无「物理伤害加成」主词条，属性伤害加成只有这 6 种
const ELEMENT_MAIN_STATS = ['冷凝', '热熔', '导电', '气动', '衍射', '湮灭'].map((el) => `${el}伤害加成`)

// 按部位 cost 可用的主词条（对齐工具箱 MAIN_STAT_POOL）
export const MAIN_STAT_POOL: Record<number, MainStatOption[]> = {
    4: [
        { type: '暴击率', maxValue: 22 },
        { type: '暴击伤害', maxValue: 44 },
        { type: '攻击%', maxValue: 33 },
        { type: '生命%', maxValue: 33 },
        { type: '防御%', maxValue: 41.8 }
    ],
    3: [
        ...ELEMENT_MAIN_STATS.map((type) => ({ type, maxValue: 30 })),
        { type: '攻击%', maxValue: 30 },
        { type: '生命%', maxValue: 30 },
        { type: '防御%', maxValue: 38 },
        { type: '共鸣效率', maxValue: 32 }
    ],
    1: [
        { type: '攻击%', maxValue: 18 },
        { type: '生命%', maxValue: 22.8 },
        { type: '防御%', maxValue: 18 }
    ]
}

export const ECHO_COSTS = [4, 3, 1] as const

/** @desc 声骸总 cost 上限（与工具箱同口径：5 个部位合计 ≤ 12） */
export const ECHO_MAX_TOTAL_COST = 12

/** @desc 主词条满级值：主词条数值固定取满级上限、不允许自定义；池里没有该 type 时返回 null */
export function mainStatMaxValue(cost: number, type: string): number | null {
    return (MAIN_STAT_POOL[cost] ?? []).find((o) => o.type === type)?.maxValue ?? null
}

/** @desc 副主词条：完全由部位 cost 自动推导（4→攻击150 / 3→攻击100 / 1→生命2280） */
export function secondMainStatFor(cost: number): EchoStatValue | null {
    const sec = SECOND_MAIN_STAT_DEFAULT[cost]
    return sec ? { ...sec } : null
}

// 副主词条固定值（对齐工具箱 SECOND_MAIN_STAT），按部位 cost 决定
export const SECOND_MAIN_STAT_DEFAULT: Record<number, EchoStatValue> = {
    4: { type: '攻击', value: 150, unit: '' },
    3: { type: '攻击', value: 100, unit: '' },
    1: { type: '生命', value: 2280, unit: '' }
}

// ── 限额（服务端与编辑页共用；与 0004 迁移的 plan 契约一致） ──
/** 每个角色的声骸部位数 */
export const ECHO_SLOT_COUNT = 5
/** @desc cost 默认布局（新方案的初始值；**不强制**，编辑时可自由调整，只要 5 部位合计 ≤ 12） */
export const ECHO_COST_MULTISET = [4, 3, 3, 1, 1] as const
/** 每个部位的副词条条数上限 */
export const SUBSTAT_MAX_PER_SLOT = 5
/** 每个部位的副词条条数下限 */
export const SUBSTAT_MIN_PER_SLOT = 1
/** 每份方案（5 个部位）的副词条总数：工坊只保存标准 14 词条 */
export const SUBSTAT_TOTAL_COUNT = 14
/** 允许的数值单位 */
export const STAT_UNITS = ['%', ''] as const

export const ECHO_STAT_UNIT_SET = new Set<string>(STAT_UNITS)

/** 主词条 / 副主词条 / 副词条共用的 type 白名单（副主词条固定值来自副词条集合） */
export const SECOND_MAIN_STAT_TYPE_WHITELIST = new Set<string>([...MAIN_STAT_TYPES, ...SUBSTAT_TYPES])

/** 固定值副词条（生命 / 攻击 / 防御），其余副词条均为百分比 */
export const FLAT_SUBSTAT_TYPES = new Set<string>(['生命', '攻击', '防御'])

/** 按词条 type 推断默认单位（编辑页选 type 时自动带出，仍可手动改） */
export function defaultStatUnit(type: string): '' | '%' {
    if (FLAT_SUBSTAT_TYPES.has(type)) return ''
    return '%'
}

