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
    { id: 'hpFlat', label: '生命固定值', unit: 'flat' },
    { id: 'defFlat', label: '防御固定值', unit: 'flat' },
    { id: 'tuneBreakBoost', label: '谐度破坏增幅', unit: 'flat' },

    { id: 'atkPct', label: '攻击百分比', unit: '%' },
    { id: 'hpPct', label: '生命百分比', unit: '%' },
    { id: 'defPct', label: '防御百分比', unit: '%' },
    { id: 'recharge', label: '共鸣效率', unit: '%' },
    { id: 'offTuneBuildupRate', label: '偏谐值累积效率', unit: '%' },

    { id: 'critRate', label: '暴击率', unit: '%' },
    { id: 'critDmg', label: '暴击伤害', unit: '%' },

    { id: 'bonusDmg', label: '加成(增伤区)', unit: '%' },
    { id: 'deepenDmg', label: '加深(加深区)', unit: '%' },
    { id: 'dmgTakenInc', label: '伤害提升(易伤区)', unit: '%' },
    { id: 'finalDmg', label: '最终伤害(终伤区)', unit: '%' },

    { id: 'specialFinal1', label: '特殊终伤(1)', unit: '%' },
    { id: 'specialFinal2', label: '特殊终伤(2)', unit: '%' },

    { id: 'extraRatio', label: '额外倍率', unit: '%' },

    { id: 'defDown', label: '防御降低(减防)', unit: '%' },
    { id: 'resDown', label: '抗性降低(减抗)', unit: '%' },

    { id: 'resPen', label: '属性抗性无视(穿抗)', unit: '%' },
    { id: 'defPen', label: '防御无视(穿防)', unit: '%' },
    { id: 'dmgRedPen', label: '免伤无视(穿免)', unit: '%' },

    { id: 'tuneStrainLayer', label: '集谐干涉层数', unit: 'flat' },
    { id: 'unisonBoonLayer', label: '同奏增益层数', unit: 'flat' }
]

export const BUFF_ZONE_MAP = new Map(BUFF_ZONES.map((z) => [z.id, z]))

// ── 乘区分区（与 wuwa-afyg-tool 的 ZONE_SECTIONS 一致：编辑器按此分区展示）──
export const BUFF_ZONE_SECTIONS: Array<{ title: string; ids: string[] }> = [
    { title: '基本固定值', ids: ['atkFlat', 'hpFlat', 'defFlat', 'tuneBreakBoost'] },
    { title: '基本百分比', ids: ['atkPct', 'hpPct', 'defPct', 'recharge', 'offTuneBuildupRate'] },
    { title: '双暴', ids: ['critRate', 'critDmg'] },
    { title: '常见增伤拐', ids: ['bonusDmg', 'deepenDmg', 'dmgTakenInc', 'finalDmg'] },
    { title: '特殊增伤拐或倍率提升', ids: ['specialFinal1', 'specialFinal2'] },
    { title: '倍率追加或锚定', ids: ['extraRatio'] },
    { title: '使目标', ids: ['defDown', 'resDown'] },
    { title: '对目标', ids: ['resPen', 'defPen', 'dmgRedPen'] },
    { title: '层数相关独立终伤', ids: ['tuneStrainLayer', 'unisonBoonLayer'] }
]

/** @desc 分区后的乘区清单（与工具箱「添加乘区」右栏同构；未列入分区的乘区兜底进「其它」） */
export const BUFF_ZONE_SECTION_VIEWS: Array<{ title: string; defs: BuffZoneDef[] }> = (() => {
    const listed = new Set(BUFF_ZONE_SECTIONS.flatMap((s) => s.ids))
    const views = BUFF_ZONE_SECTIONS.map((s) => ({
        title: s.title,
        defs: s.ids.map((id) => BUFF_ZONE_MAP.get(id)).filter((d): d is BuffZoneDef => Boolean(d))
    }))
    const rest = BUFF_ZONES.filter((z) => !listed.has(z.id))
    if (rest.length > 0) views.push({ title: '其它', defs: rest })
    return views
})()

/** @desc 旧乘区 id → 现乘区 id 别名表（与工具箱 LEGACY_ZONE_IDS 一致：历史数据入库时重映射） */
export const LEGACY_BUFF_ZONE_IDS: Record<string, string> = {
    customFinalDmg: 'specialFinal1',
    customFinalDmgMul: 'specialFinal2'
}

/** @desc 把历史乘区 id 归一化为当前 id（已是当前 id 或无法识别的 id 原样返回） */
export const resolveBuffZoneId = (id: string): string => LEGACY_BUFF_ZONE_IDS[id] ?? id

/** @desc 覆盖（override）白名单外的乘区：与工具箱一致，百分比类与额外倍率不支持覆盖 */
export const ZONE_NO_OVERRIDE_IDS = new Set<string>(['atkPct', 'hpPct', 'defPct', 'extraRatio'])

/** @desc 层数类乘区（集谐干涉/同奏增益等）：只支持直接填固定层数，不支持 ref 引用/转模（对齐 wuwa-afyg-tool） */
export const ZONE_NO_REF_IDS = new Set<string>(['tuneStrainLayer', 'unisonBoonLayer'])

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
// 按「挂载位置」分两层（与工具箱口径一致）：
// - Buff 实例级：chains[] / refinements[]（硬性门槛，二者互斥，只判定链）+ elements[] / damageTypes[]（兼容旧数据）
// - 乘区级：只允许 elements[] / damageTypes[]（链/阶由实例级统一把关）
export const CHAIN_MAX = 6
export const REFINE_MAX = 5

/** @desc 条件挂载层级：buff=实例级（可含链/阶硬性门槛）；zone=乘区级 */
export type BuffConditionScope = 'buff' | 'zone'

/** @desc 某层级是否允许出现链条件 / 阶条件（链阶只能挂在整条 Buff 上） */
export const scopeAllowsChainRefinement = (scope: BuffConditionScope): boolean => scope === 'buff'

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
    '效应伤害',
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
    效应伤害: '效应',
    其它类型伤害: '其它'
}

interface ChainClause {
    charIdx: number
    min: number
}

const normClauses = (value: unknown, max: number, minFloor: number): ChainClause[] | undefined => {
    if (!Array.isArray(value)) return undefined
    const out: ChainClause[] = []
    for (const item of value) {
        if (!item || typeof item !== 'object') continue
        const c = item as Record<string, unknown>
        const charIdx = typeof c.charIdx === 'number' && Number.isFinite(c.charIdx) ? Math.floor(c.charIdx) : 0
        const min = typeof c.min === 'number' && Number.isFinite(c.min) ? Math.floor(c.min) : NaN
        if (!Number.isFinite(min) || min < minFloor || min > max) continue
        if (charIdx < 0 || charIdx > 2) continue
        if (out.some((x) => x.charIdx === charIdx && x.min === min)) continue
        out.push({ charIdx, min })
    }
    return out.length > 0 ? out : undefined
}

/** @desc 条件是否为空（无任何有效子句） */
export function isConditionEmpty(cond: BuffCondition | null | undefined): boolean {
    if (!cond) return true
    return (
        (cond.chains?.length ?? 0) === 0 &&
        (cond.refinements?.length ?? 0) === 0 &&
        cond.chain === undefined &&
        cond.refinement === undefined &&
        (cond.elements?.length ?? 0) === 0 &&
        (cond.damageTypes?.length ?? 0) === 0
    )
}

/** @desc 按层级裁剪条件：乘区级强制剥离链/阶子句（它们只作为整条 Buff 的硬性门槛） */
export function normalizeConditionForScope(cond: BuffCondition, scope: BuffConditionScope): BuffCondition {
    if (scopeAllowsChainRefinement(scope)) return cond
    const next: BuffCondition = { ...cond }
    delete next.chains
    delete next.refinements
    delete next.chain
    delete next.refinement
    return next
}

/**
 * @desc 清洗生效条件：白名单校验 + 数值/数组归一化。
 * - 兼容旧格式 `{ type:'chain'|'refinement', min }` → 升级为 chains / refinements 数组形式
 * - 链与阶**互斥**：同时出现时只保留链（与工具箱运行时护栏一致，阶条件整体丢弃）
 * - 按层级裁剪；全空返回 undefined
 */
export function sanitizeCondition(cond: unknown, scope: BuffConditionScope = 'buff'): BuffCondition | undefined {
    if (!cond || typeof cond !== 'object') return undefined
    const c = cond as Record<string, unknown>
    const out: BuffCondition = {}

    const chains = normClauses(c.chains, CHAIN_MAX, 0)
    const refinements = normClauses(c.refinements, REFINE_MAX, 1)
    if (chains) out.chains = chains
    if (refinements) out.refinements = refinements

    // 旧格式兼容：{ type:'chain'|'refinement', min } → 数组形式
    if (c.type === 'chain' || c.type === 'refinement') {
        const min = typeof c.min === 'number' && Number.isFinite(c.min) ? Math.floor(c.min) : NaN
        if (c.type === 'chain' && !out.chains && Number.isFinite(min) && min >= 0 && min <= CHAIN_MAX) {
            out.chains = [{ charIdx: 0, min }]
        }
        if (c.type === 'refinement' && !out.refinements && Number.isFinite(min) && min >= 1 && min <= REFINE_MAX) {
            out.refinements = [{ charIdx: 0, min }]
        }
    }

    // 旧单值字段：升级为数组形式（未标注 refCharIdx，按工具箱口径取 0 号位）
    if (!out.chains && typeof c.chain === 'number' && Number.isFinite(c.chain)) {
        const min = Math.floor(c.chain)
        if (min >= 0 && min <= CHAIN_MAX) out.chains = [{ charIdx: 0, min }]
    }
    if (!out.refinements && typeof c.refinement === 'number' && Number.isFinite(c.refinement)) {
        const min = Math.floor(c.refinement)
        if (min >= 1 && min <= REFINE_MAX) out.refinements = [{ charIdx: 0, min }]
    }

    // 链 / 阶互斥：只判定链条件
    if (out.chains?.length) delete out.refinements

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

    const scoped = normalizeConditionForScope(out, scope)
    return isConditionEmpty(scoped) ? undefined : scoped
}

/** @desc 清洗乘区级条件：只保留伤害类型 / 伤害属性 */
export function sanitizeZoneCondition(cond: unknown): BuffCondition | undefined {
    return sanitizeCondition(cond, 'zone')
}

/** @desc 条件摘要文案（与工具箱 describeCondition 同口径；实例级用链/阶，乘区级用类型/属性） */
export function describeCondition(cond: BuffCondition | null | undefined, slotName = (i: number) => `角色 ${i + 1}`): string {
    if (!cond || isConditionEmpty(cond)) return '无条件'
    const groups: string[] = []
    const gate: string[] = []
    for (const c of cond.chains ?? [])
        gate.push(c.min > 0 ? `${slotName(c.charIdx)} ≥ ${c.min}链` : `${slotName(c.charIdx)}本体`)
    for (const c of cond.refinements ?? []) gate.push(`${slotName(c.charIdx)}武器 ≥ ${c.min}阶`)
    if (cond.chain !== undefined) gate.push(`共鸣链 ≥ ${cond.chain}`)
    if (cond.refinement !== undefined) gate.push(`武器精炼 ≥ ${cond.refinement}`)
    if (gate.length) groups.push(gate.join(' 且 '))
    if (cond.elements?.length) groups.push(cond.elements.join(' 或 '))
    if (cond.damageTypes?.length) groups.push(cond.damageTypes.join(' 或 '))
    return groups.length ? groups.join(' 且 ') : '无条件'
}

/** @desc 乘区条件徽标短摘要（伤害类型在前、属性在后，类内 `/`、类间 `·`） */
export function describeZoneConditionBadge(cond: BuffCondition | null | undefined): string {
    if (!cond || isConditionEmpty(cond)) return ''
    const types = (cond.damageTypes ?? []).map((dt) => BUFF_DAMAGE_TYPE_SHORT[dt] ?? dt)
    const elements = cond.elements ?? []
    return [types.join('/'), elements.join('/')].filter((part) => part.length > 0).join('·')
}
