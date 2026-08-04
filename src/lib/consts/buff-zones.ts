import type { BuffEntityType, BuffCondition, BuffScope } from '@/lib/types/db'

export interface BuffZoneDef {
    id: string
    label: string
    unit: '%' | 'flat'
}

// 与 wuwa-afyg-tool 的 ZONE_DEFS 保持一致，作为 Buff 集 zoneId 白名单。
// 编辑器下拉、展示均以此为准，避免脏数据写入。
export const BUFF_ZONES: BuffZoneDef[] = [
    { id: 'atkFlat', label: '攻击固定值', unit: 'flat' },
    { id: 'atkPct', label: '攻击百分比', unit: '%' },
    { id: 'hpFlat', label: '生命固定值', unit: 'flat' },
    { id: 'hpPct', label: '生命百分比', unit: '%' },
    { id: 'defFlat', label: '防御固定值', unit: 'flat' },
    { id: 'defPct', label: '防御百分比', unit: '%' },
    { id: 'critRate', label: '暴击率', unit: '%' },
    { id: 'critDmg', label: '暴击伤害', unit: '%' },
    { id: 'recharge', label: '共鸣效率', unit: '%' },
    { id: 'tuneBreakBoost', label: '谐度破坏增幅', unit: 'flat' },
    { id: 'offTuneBuildupRate', label: '偏谐值累积效率', unit: '%' },
    { id: 'bonusDmg', label: '加成(增伤区)', unit: '%' },
    { id: 'deepenDmg', label: '加深(加深区)', unit: '%' },
    { id: 'resPen', label: '对目标属性抗性无视(穿抗)', unit: '%' },
    { id: 'defPen', label: '对目标防御无视(穿防)', unit: '%' },
    { id: 'defDown', label: '目标防御降低(减防)', unit: '%' },
    { id: 'dmgRedPen', label: '对目标免伤无视(穿免)', unit: '%' },
    { id: 'resDown', label: '目标抗性降低(减抗)', unit: '%' },
    { id: 'tuneStrainLayer', label: '集谐干涉层数', unit: 'flat' },
    { id: 'finalDmg', label: '最终伤害(终伤区)', unit: '%' },
    { id: 'dmgTakenInc', label: '伤害提升(易伤区)', unit: '%' },
    { id: 'customFinalDmg', label: '倍率/其它(特殊终伤)', unit: '%' },
    { id: 'extraRatio', label: '额外倍率', unit: '%' }
]

export const BUFF_ZONE_MAP = new Map(BUFF_ZONES.map((z) => [z.id, z]))

export const BUFF_ENTITY_TYPES = ['character', 'weapon', 'echo', '1set', '2set', '3set', '4set', '5set'] as const

export const BUFF_ENTITY_LABELS: Record<BuffEntityType, string> = {
    character: '角色',
    weapon: '武器',
    echo: '首位声骸',
    '1set': '套装 1件',
    '2set': '套装 2件',
    '3set': '套装 3件',
    '4set': '套装 4件',
    '5set': '套装 5件'
}

// 引用乘区白名单（对齐 wuwa-afyg-tool 的 ZONE_REF_DEFS）
export const BUFF_REF_ZONES: Array<{ id: string; label: string; unit: '%' | 'flat' }> = [
    { id: 'baseAtk', label: '攻击白值', unit: 'flat' },
    { id: 'totalAtk', label: '当前攻击', unit: 'flat' },
    { id: 'baseHp', label: '生命白值', unit: 'flat' },
    { id: 'totalHp', label: '生命上限', unit: 'flat' },
    { id: 'baseDef', label: '防御白值', unit: 'flat' },
    { id: 'totalDef', label: '当前防御', unit: 'flat' },
    { id: 'recharge', label: '共鸣效率', unit: '%' },
    { id: 'tuneBreakBoost', label: '谐度破坏增幅', unit: 'flat' },
    { id: 'offTuneBuildupRate', label: '偏谐值累积效率', unit: '%' },
    { id: 'critRate', label: '暴击率', unit: '%' },
    { id: 'critDmg', label: '暴击伤害', unit: '%' }
]

export const BUFF_REF_ZONE_MAP = new Map(BUFF_REF_ZONES.map((z) => [z.id, z]))

export const BUFF_SCOPES: BuffScope[] = ['self', 'self_except', 'team', 'effect_only']

export const BUFF_SCOPE_LABELS: Record<BuffScope, string> = {
    self: '对自己',
    self_except: '自己除外',
    team: '对全队',
    effect_only: '效应专属'
}

// ── 生效条件（condition）──
// 仅角色 / 武器实体使用：chain = 角色共鸣链（鸣潮 0-6 链）；refinement = 武器精炼（1-5 阶）
export const BUFF_CONDITION_TYPES = ['chain', 'refinement'] as const
export type BuffConditionType = (typeof BUFF_CONDITION_TYPES)[number]

export const CHAIN_MAX = 6
export const REFINE_MAX = 5

export const BUFF_CONDITION_LABELS: Record<BuffConditionType, string> = {
    chain: '角色共鸣链',
    refinement: '武器精炼'
}

// 清洗生效条件：类型白名单 + min 为正整数且在各自上限内；非法返回 undefined
export function sanitizeCondition(cond: unknown): BuffCondition | undefined {
    if (!cond || typeof cond !== 'object') return undefined
    const c = cond as Record<string, unknown>
    if (c.type !== 'chain' && c.type !== 'refinement') return undefined
    const type = c.type as BuffConditionType
    const min = typeof c.min === 'number' && Number.isFinite(c.min) ? Math.floor(c.min) : 0
    const max = type === 'chain' ? CHAIN_MAX : REFINE_MAX
    if (min <= 0 || min > max) return undefined
    return { type, min }
}