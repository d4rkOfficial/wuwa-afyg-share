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

// 主词条白名单（对齐工具箱 MAIN_STAT_POOL 的并集 + 物理伤害加成）
export const MAIN_STAT_TYPES = [
    '暴击率',
    '暴击伤害',
    '攻击%',
    '生命%',
    '防御%',
    '共鸣效率',
    '物理伤害加成',
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

const ELEMENT_MAIN_STATS = ['物理', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭'].map((el) => `${el}伤害加成`)

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

// 副主词条固定值（对齐工具箱 SECOND_MAIN_STAT），按部位 cost 决定
export const SECOND_MAIN_STAT_DEFAULT: Record<number, EchoStatValue> = {
    4: { type: '攻击', value: 150, unit: '' },
    3: { type: '攻击', value: 100, unit: '' },
    1: { type: '生命', value: 2280, unit: '' }
}

// ── 限额（服务端与编辑页共用；与 0004 迁移的 plan 契约一致） ──
/** 每个角色的声骸部位数 */
export const ECHO_SLOT_COUNT = 5
/** cost 多重集合（顺序任意，合计 12） */
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

