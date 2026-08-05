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
// 多字段可并存（全部满足才生效）：chain = 角色共鸣链（0-6 链，0 表示无门槛）；refinement = 武器精炼（1-5 阶）；
// elements = 伤害属性多选；damageTypes = 伤害类型多选
export const CHAIN_MAX = 6
export const REFINE_MAX = 5

// 伤害属性 / 伤害类型白名单（与工具箱 game-terms 一致）
export const BUFF_ELEMENTS = ['物理', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭'] as const
export const BUFF_DAMAGE_TYPES = [
    '普攻伤害',
    '重击伤害',
    '共鸣技能伤害',
    '共鸣解放伤害',
    '声骸技能伤害',
    '变奏技能伤害',
    '延奏技能伤害',
    '协同攻击伤害',
    '其它类型伤害'
] as const

// 伤害类型短名（与工具箱 DAMAGE_TYPE_SHORT 一致，用于摘要/按钮展示）
export const BUFF_DAMAGE_TYPE_SHORT: Record<string, string> = {
    普攻伤害: '普攻',
    重击伤害: '重击',
    共鸣技能伤害: '共技',
    共鸣解放伤害: '共解',
    声骸技能伤害: '声骸',
    变奏技能伤害: '变奏',
    延奏技能伤害: '延奏',
    协同攻击伤害: '协同',
    其它类型伤害: '其它'
}

// 清洗生效条件：白名单校验 + 数值/数组归一化；兼容旧格式 {type:"chain"|"refinement",min}；全空返回 undefined
export function sanitizeCondition(cond: unknown): BuffCondition | undefined {
    if (!cond || typeof cond !== 'object') return undefined
    const c = cond as Record<string, unknown>
    // 旧格式兼容：{ type: 'chain'|'refinement', min } → 多字段
    if (c.type === 'chain' || c.type === 'refinement') {
        const min = typeof c.min === 'number' && Number.isFinite(c.min) ? Math.floor(c.min) : 0
        const max = c.type === 'chain' ? CHAIN_MAX : REFINE_MAX
        const minOk = c.type === 'chain' ? min >= 0 : min >= 1
        return minOk && min <= max ? { [c.type]: min } : undefined
    }
    const out: BuffCondition = {}
    if (typeof c.chain === 'number' && Number.isFinite(c.chain)) {
        const min = Math.floor(c.chain)
        if (min >= 0 && min <= CHAIN_MAX) out.chain = min
    }
    if (typeof c.refinement === 'number' && Number.isFinite(c.refinement)) {
        const min = Math.floor(c.refinement)
        if (min >= 1 && min <= REFINE_MAX) out.refinement = min
    }
    if (Array.isArray(c.elements)) {
        const elements = c.elements.filter(
            (e): e is string => typeof e === 'string' && (BUFF_ELEMENTS as readonly string[]).includes(e)
        )
        if (elements.length > 0) out.elements = [...new Set(elements)]
    }
    if (Array.isArray(c.damageTypes)) {
        const damageTypes = c.damageTypes.filter(
            (d): d is string => typeof d === 'string' && (BUFF_DAMAGE_TYPES as readonly string[]).includes(d)
        )
        if (damageTypes.length > 0) out.damageTypes = [...new Set(damageTypes)]
    }
    return Object.keys(out).length > 0 ? out : undefined
}