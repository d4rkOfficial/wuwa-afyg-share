import type {
    BuffCondition,
    BuffEntityType,
    BuffEnemyTypeKind,
    BuffRule,
    BuffScope,
    BuffZoneCompareId,
    BuffZoneCompareOp
} from '@/lib/types/db'

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

/**
 * @desc 不支持 ref 引用/转模的乘区（对齐 wuwa-afyg-tool 的 ZONE_NO_REF_IDS）。
 *
 * 目前**只有集谐干涉层数**在名单里：它只允许直接填固定层数。同奏增益层数可以引用；
 * 新增乘区默认即可引用。
 */
export const ZONE_NO_REF_IDS = new Set<string>(['tuneStrainLayer'])

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
// 最后一项是**按角色独立**的层数来源：读被引用角色自己累计的同奏增益层数。
// 集谐干涉层数挂在目标身上、不属于角色，故不在列。
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
    { id: 'critDmg', label: '暴击伤害', unit: '%' },
    { id: 'unisonBoonLayer', label: '同奏增益层数', unit: 'flat' }
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
// - Buff 实例级：chains[] / refinements[]（硬性门槛，可并存）+ rules[]（规则列表，全部 AND，
//   见 BUFF_RULE_KINDS）+ elements[] / damageTypes[]（兼容读取）
// - 乘区级：只允许 elements[] / damageTypes[]（链阶与 rules 由实例级统一把关）
export const CHAIN_MAX = 6
export const REFINE_MAX = 5

// ── Buff 级规则（condition.rules）──
// 与 wuwa-afyg-tool 的 `calc/buff-library-condition` 同一套口径：
// - 只入库 5 种 kind（buffActive 引用工程内 buff id，工坊没有该 id 空间）；
// - 归属只有两档：0 = 本角色、-1 = 出伤者；
// - zoneCompare 的属性白名单排除「由 Buff 产出的面板值」（自封顶靠跨 Buff 聚合，模板里表达不出）。

/** @desc 工坊入库允许的规则种类（顺序即编辑器菜单顺序） */
export const BUFF_RULE_KINDS: BuffRule['kind'][] = [
    'chain',
    'refinement',
    'damageNameRegex',
    'zoneCompare',
    'enemyType'
]

export const BUFF_RULE_KIND_LABELS: Record<BuffRule['kind'], string> = {
    chain: '角色共鸣链',
    refinement: '武器精炼阶数',
    damageNameRegex: '伤害名包含正则',
    zoneCompare: '角色面板数值',
    enemyType: '敌人类型',
    buffActive: '其它 BUFF 生效'
}

/** @desc 「面板数值」可比较的属性：`label` 给下拉用全名，`short` 给卡片文案用短名 */
export const BUFF_ZONE_COMPARE_OPTIONS: {
    value: BuffZoneCompareId
    label: string
    short: string
    unit: '%' | 'flat'
}[] = [
    { value: 'atk', label: '攻击', short: '攻击', unit: 'flat' },
    { value: 'hp', label: '生命', short: '生命', unit: 'flat' },
    { value: 'def', label: '防御', short: '防御', unit: 'flat' },
    { value: 'recharge', label: '共鸣效率', short: '共鸣效率', unit: '%' },
    { value: 'offTuneBuildupRate', label: '偏谐值累积效率', short: '偏谐效率', unit: '%' },
    { value: 'critRate', label: '暴击率', short: '暴击', unit: '%' },
    { value: 'critDmg', label: '暴击伤害', short: '暴伤', unit: '%' }
]

/** @desc 入库允许的面板属性（与工具箱库口径一致） */
export const BUFF_ZONE_COMPARE_IDS: BuffZoneCompareId[] = BUFF_ZONE_COMPARE_OPTIONS.map((option) => option.value)

export const BUFF_ZONE_COMPARE_OPS: { value: BuffZoneCompareOp; label: string }[] = [
    { value: 'ge', label: '≥' },
    { value: 'gt', label: '>' },
    { value: 'eq', label: '=' },
    { value: 'le', label: '≤' },
    { value: 'lt', label: '<' }
]

export const BUFF_ENEMY_TYPES: { value: BuffEnemyTypeKind; label: string }[] = [
    { value: 'BOSS', label: 'BOSS' },
    { value: '精英怪', label: '精英怪' },
    { value: '小怪', label: '小怪' }
]

/** @desc 伤害名正则的长度上限（社区共享数据，粗暴兜底） */
export const BUFF_REGEX_MAX = 120

/** @desc 引用归属的两选一：本角色（self/owner）/ 出伤者（active） */
export const BUFF_REF_OWNER_OPTIONS: { value: 'owner' | 'active'; label: string; hint: string }[] = [
    { value: 'owner', label: '本角色', hint: '引用该增益所属角色的面板（武器 / 声骸 / 套装 = 装备者）' },
    { value: 'active', label: '出伤者', hint: '引用本次伤害所属角色的面板' }
]

const ruleInt = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback

const ruleStr = (v: unknown): string => (typeof v === 'string' ? v : '')

/** @desc 单条规则的归一化（不合法返回 null） */
export function sanitizeRule(raw: unknown): BuffRule | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    switch (ruleStr(r.kind)) {
        case 'chain': {
            const min = ruleInt(r.min, 0)
            if (min < 0 || min > CHAIN_MAX) return null
            return { kind: 'chain', charIdx: 0, min }
        }
        case 'refinement': {
            const min = ruleInt(r.min, 1)
            if (min < 1 || min > REFINE_MAX) return null
            return { kind: 'refinement', charIdx: 0, min }
        }
        case 'damageNameRegex': {
            const pattern = ruleStr(r.pattern)
            if (pattern.length > BUFF_REGEX_MAX) return null
            return { kind: 'damageNameRegex', pattern }
        }
        case 'zoneCompare': {
            const zone = ruleStr(r.zone) as BuffZoneCompareId
            if (!BUFF_ZONE_COMPARE_IDS.includes(zone)) return null
            const op = ruleStr(r.op) as BuffZoneCompareOp
            if (!BUFF_ZONE_COMPARE_OPS.some((item) => item.value === op)) return null
            const value = typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : 0
            return { kind: 'zoneCompare', charIdx: ruleInt(r.charIdx, 0) < 0 ? -1 : 0, zone, op, value }
        }
        case 'enemyType': {
            // 多选存 `types`；单值 `type` 是旧数据的形状，归一化时并入
            const rawList = Array.isArray(r.types) ? r.types : typeof r.type === 'string' ? [r.type] : []
            const types = [
                ...new Set(
                    rawList.filter((item): item is BuffEnemyTypeKind =>
                        BUFF_ENEMY_TYPES.some((option) => option.value === item)
                    )
                )
            ]
            if (types.length === 0) return null
            return { kind: 'enemyType', types }
        }
        default:
            // buffActive：引用工程内 buff id，工坊不入库
            return null
    }
}

/** @desc 规则列表归一化（种类白名单 + 归属轴收敛 + **同类只保留一条**；空结果返回 undefined） */
export function sanitizeRules(raw: unknown): BuffRule[] | undefined {
    if (!Array.isArray(raw)) return undefined
    const out: BuffRule[] = []
    const seenKind = new Set<BuffRule['kind']>()
    for (const item of raw) {
        const rule = sanitizeRule(item)
        if (!rule) continue
        if (seenKind.has(rule.kind)) continue
        seenKind.add(rule.kind)
        out.push(rule)
    }
    return out.length > 0 ? out : undefined
}

/** @desc 空正则视为「未填写」草稿（导入工具箱后恒不满足，与工程侧口径一致） */
export function isRuleDraft(rule: BuffRule): boolean {
    return rule.kind === 'damageNameRegex' && !rule.pattern.trim()
}

export interface DescribeRuleOptions {
    /**
     * @desc 面板条件的「本人」称呼：角色实体传角色名，武器 / 声骸 / 套装传「装备者」。
     * 出伤者档恒为「出伤者」。
     */
    selfLabel?: string
}

/** @desc 单条规则文案（编辑器条件卡与公开页摘要共用；一行就是一条条件） */
export function describeRule(rule: BuffRule, options: DescribeRuleOptions = {}): string {
    const selfLabel = options.selfLabel ?? '本角色'
    switch (rule.kind) {
        case 'chain':
            return rule.min > 0 ? `${selfLabel} 共鸣链 ≥ ${rule.min}` : `${selfLabel} 本体（0 链）`
        case 'refinement':
            return `${selfLabel} 武器精炼 ≥ ${rule.min} 阶`
        case 'damageNameRegex':
            return `伤害名包含「${rule.pattern}」`
        case 'zoneCompare': {
            const option = BUFF_ZONE_COMPARE_OPTIONS.find((item) => item.value === rule.zone)
            const op = BUFF_ZONE_COMPARE_OPS.find((item) => item.value === rule.op)?.label ?? rule.op
            const who = rule.charIdx < 0 ? '出伤者' : selfLabel
            const unit = option?.unit === '%' ? '%' : ''
            return `${who} ${option?.short ?? rule.zone} ${op} ${rule.value}${unit}`
        }
        case 'enemyType':
            return `敌人 ${rule.types.join(' / ')}`
        default:
            return ''
    }
}

/** @desc 规则列表的紧凑摘要（空列表返回空串） */
export function describeRules(rules: BuffRule[] | null | undefined, options: DescribeRuleOptions = {}): string {
    return (rules ?? []).map((rule) => describeRule(rule, options)).join(' 且 ')
}

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
        (cond.damageTypes?.length ?? 0) === 0 &&
        (cond.rules?.length ?? 0) === 0
    )
}

/** @desc 按层级裁剪条件：乘区级强制剥离链/阶子句与 rules（它们只作为整条 Buff 的门槛） */
export function normalizeConditionForScope(cond: BuffCondition, scope: BuffConditionScope): BuffCondition {
    if (scopeAllowsChainRefinement(scope)) return cond
    const next: BuffCondition = { ...cond }
    delete next.chains
    delete next.refinements
    delete next.chain
    delete next.refinement
    delete next.rules
    return next
}

/**
 * @desc 清洗生效条件：白名单校验 + 数值/数组归一化。
 * - 兼容旧格式 `{ type:'chain'|'refinement', min }` → 升级为 chains / refinements 数组形式
 * - **链与阶可以并存**（与工具箱 v7 口径一致，两者都保留，规则之间 AND）
 * - `rules` 只在实例级保留（乘区级由 `normalizeConditionForScope` 剥离）；全空返回 undefined
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

    const rules = sanitizeRules(c.rules)
    if (rules) out.rules = rules

    const scoped = normalizeConditionForScope(out, scope)
    return isConditionEmpty(scoped) ? undefined : scoped
}

/** @desc 清洗乘区级条件：只保留伤害类型 / 伤害属性 */
export function sanitizeZoneCondition(cond: unknown): BuffCondition | undefined {
    return sanitizeCondition(cond, 'zone')
}

/**
 * @desc 条件摘要文案（与工具箱 describeCondition 同口径；实例级用链/阶，乘区级用类型/属性）。
 *
 * 角色槽位的说法按**实体类型**取（工坊没有配队上下文，不写「角色 1」这类槽位号）：
 * - 角色自身的 Buff → 「当前角色」
 * - 武器 / 首位声骸 / 套装 → 「装配角色」
 */
export function describeCondition(
    cond: BuffCondition | null | undefined,
    slotName: (i: number) => string = () => '当前角色'
): string {
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
    const rules = describeRules(cond.rules)
    if (rules) groups.push(rules)
    return groups.length ? groups.join(' 且 ') : '无条件'
}


/**
 * @desc 按实体类型取槽位称呼：角色 → 「当前角色」；武器 / 首位声骸 / 套装 → 「装配角色」。
 * 用法：`describeCondition(cond, slotNameFor(entityType))`。
 */
export function slotNameFor(entityType: string): (i: number) => string {
    const label = entityType === 'character' ? '当前角色' : '装配角色'
    return () => label
}

/**
 * @desc 引用 / 转模的一行摘要（Buff 集列表、AI 结果卡统一用这份）。
 *
 * 三种形态：
 * - 线性：「（超过 2000 攻击的部分）×2%」
 * - 离散档位：「（攻击）每 100 +5%」——这类转模 `pct` 通常是 0，换算在 divisor/multiplier 上，
 *   直接拿 pct 显示会出现「×0%」这种明显错误；
 * - 兜底：只写「引用某属性」，不再硬拼百分数。
 */
export function describeZoneRef(
    ref:
        | {
              targetZoneId?: string
              pct?: number
              threshold?: number
              lower?: number
              upper?: number
              discrete?: boolean
              divisor?: number
              multiplier?: number
          }
        | null
        | undefined
): string {
    if (!ref) return ''
    const def = BUFF_REF_ZONE_MAP.get(String(ref.targetZoneId ?? ''))
    const label = def?.label ?? String(ref.targetZoneId ?? '')
    const unit = def?.unit === '%' ? '%' : ''
    const th = Number(ref.threshold ?? 0)
    const base =
        th !== 0 ? `${label}${th < 0 ? '+' : '−'}${Math.abs(th)}${unit}的部分` : label
    const clamp =
        ref.lower !== undefined && ref.upper !== undefined
            ? `，上下限 ${ref.lower}~${ref.upper}`
            : ref.lower !== undefined
              ? `，至少 ${ref.lower}`
              : ref.upper !== undefined
                ? `，最多 ${ref.upper}`
                : ''
    const divisor = Number(ref.divisor ?? 0)
    const multiplier = Number(ref.multiplier ?? 0)
    // 离散档位（每 X 转 Y）：真正的换算在 divisor/multiplier，不是 pct
    if (ref.discrete && divisor > 0 && multiplier > 0) {
        return `${base}：每 ${divisor}${unit} +${multiplier}%${clamp}`
    }
    const pct = Number(ref.pct ?? 0)
    if (pct > 0) return `${base}×${pct}%${clamp}`
    return `引用${base}${clamp}`
}

/** @desc 乘区条件徽标短摘要（伤害类型在前、属性在后，类内 `/`、类间 `·`） */
export function describeZoneConditionBadge(cond: BuffCondition | null | undefined): string {
    if (!cond || isConditionEmpty(cond)) return ''
    const types = (cond.damageTypes ?? []).map((dt) => BUFF_DAMAGE_TYPE_SHORT[dt] ?? dt)
    const elements = cond.elements ?? []
    return [types.join('/'), elements.join('/')].filter((part) => part.length > 0).join('·')
}

// ══════════════════════════════════════════════════════════════════════════
// Buff 集小卡的文案（公开页 / 只读浏览用）：乘区名、数值单位、转模整句
// 目标是给不熟悉这套系统的用户看：不缩写、百分比与平值分开写、条件一条一行
// ══════════════════════════════════════════════════════════════════════════

/**
 * @desc 乘区在卡片上的显示名。
 *
 * 口径：
 * - 单位就是乘区名本身（`攻击` / `生命` / `防御`），**百分号只跟在数字后面**：
 *   `攻击 +1560` 是平值、`攻击 +12%` 是百分比 —— 名称不承担单位差异，避免 `攻击％` 这种怪写法；
 * - 层数类说「集谐 / 同奏」，单位是「层」；
 * - 元素 / 伤害类型**不进**名字，统一以括号跟在名字后面（`加成(热熔)(共解)`）。
 */
export const BUFF_ZONE_CARD_LABELS: Record<string, string> = {
    atkFlat: '攻击',
    atkPct: '攻击',
    hpFlat: '生命',
    hpPct: '生命',
    defFlat: '防御',
    defPct: '防御',
    tuneBreakBoost: '谐度增幅',
    recharge: '共鸣效率',
    offTuneBuildupRate: '偏谐效率',
    critRate: '暴击',
    critDmg: '暴伤',
    bonusDmg: '加成',
    deepenDmg: '加深',
    dmgTakenInc: '易伤',
    finalDmg: '终伤',
    specialFinal1: '特殊终伤1',
    specialFinal2: '特殊终伤2',
    extraRatio: '额外倍率',
    defDown: '减防',
    resDown: '减抗',
    resPen: '穿抗',
    defPen: '穿防',
    dmgRedPen: '穿免',
    tuneStrainLayer: '集谐',
    unisonBoonLayer: '同奏'
}

/** @desc 层数类乘区：单位是「层」，不是百分比也不是平值 */
const LAYER_ZONES = new Set(['tuneStrainLayer', 'unisonBoonLayer'])

/** @desc 乘区的显示名（元素 / 伤害类型由调用方以括号追加） */
export function zoneCardLabel(zoneId: string): string {
    return BUFF_ZONE_CARD_LABELS[zoneId] ?? BUFF_ZONE_MAP.get(zoneId)?.label ?? zoneId
}

/** @desc 数值行的右侧文案：百分比带 %，平值只带符号，层数带「层」；带引用的条目由转模行负责 */
export function formatZoneValue(zone: {
    zoneId: string
    value: number
    ref?: unknown
    condition?: BuffCondition | null
}): string {
    if (zone.ref) return ''
    const value = zone.value
    const sign = value >= 0 ? '+' : ''
    if (LAYER_ZONES.has(zone.zoneId)) return `${sign}${value}层`
    const def = BUFF_ZONE_MAP.get(zone.zoneId)
    if (def?.unit === '%') return `${sign}${value}%`
    return `${sign}${value}`
}

/**
 * @desc 转模的**每档增益**（未做上下限裁剪）：与工具箱 `compute.ts` 的 `resolveRefValue` 同一套公式。
 *
 * - 离散（`discrete` 且 `divisor > 0`）：每 `divisor` 点换 `multiplier`；
 * - 线性：超出部分 × `pct`%，所以每 1 点换 `pct / 100`。
 *
 * 卡片文案用它的返回值，保证「显示的每档数值」就是引擎真正加上去的数值。
 */
export function refStepGain(ref: {
    pct?: number
    discrete?: boolean
    divisor?: number
    multiplier?: number
}): { step: number; gain: number } {
    const divisor = Number(ref.divisor ?? 0)
    const multiplier = Number(ref.multiplier ?? 0)
    if (ref.discrete && divisor > 0) return { step: divisor, gain: multiplier }
    return { step: 1, gain: Number(ref.pct ?? 0) / 100 }
}

/** @desc 去掉浮点噪声后打印（60/100 不写成 0.6000000000000001，也不四舍五入丢有效数字） */
const trimNumber = (value: number): string => String(Number(value.toPrecision(12)))

/** @desc 转模行的一句话：`源 超过 N，每 X，目标 +Y，下限 …，上限 …` */
export function describeRefLine(
    ref:
        | {
              targetZoneId?: string
              pct?: number
              threshold?: number
              lower?: number
              upper?: number
              discrete?: boolean
              divisor?: number
              multiplier?: number
          }
        | null
        | undefined,
    targetZoneId: string
): string {
    if (!ref) return ''
    const source = BUFF_REF_ZONE_MAP.get(String(ref.targetZoneId ?? ''))
    const sourceLabel = source?.label ?? String(ref.targetZoneId ?? '')
    // 平值来源的「每 1」要说「每 1 点」，否则「每 1，暴伤 +0.5%」读不通
    const sourceUnit = source?.unit === '%' ? '%' : ' 点'
    const targetDef = BUFF_ZONE_MAP.get(targetZoneId)
    const targetLabel = BUFF_ZONE_CARD_LABELS[targetZoneId] ?? targetDef?.label ?? targetZoneId
    const targetUnit = LAYER_ZONES.has(targetZoneId) ? '层' : targetDef?.unit === '%' ? '%' : ''

    const threshold = Number(ref.threshold ?? 0)
    const head =
        threshold > 0
            ? `${sourceLabel}超过 ${trimNumber(threshold)}${sourceUnit}，`
            : threshold < 0
              ? `${sourceLabel}按 ${trimNumber(threshold)}${sourceUnit} 起算，`
              : ''
    const { step, gain } = refStepGain(ref)
    const lower = ref.lower !== undefined ? `，下限 ${trimNumber(ref.lower)}${targetUnit}` : ''
    const upper = ref.upper !== undefined ? `，上限 ${trimNumber(ref.upper)}${targetUnit}` : ''
    return `${head}每 ${trimNumber(step)}${sourceUnit}，${targetLabel} +${trimNumber(gain)}${targetUnit}${lower}${upper}`
}
