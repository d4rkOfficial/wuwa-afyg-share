// DeepSeek 工具调用：定义工具 schema + 执行器（server-only）
import { fetchToolList, fetchToolInfo } from '@/lib/ai/info'
import { BUFF_ENTITY_TYPES, BUFF_ZONES, BUFF_ZONE_MAP, BUFF_REF_ZONES, BUFF_REF_ZONE_MAP } from '@/lib/consts/buff-zones'
import {
    DEFAULT_SLANG_DICT,
    EFFECTS_TEXT,
    SCOPE_RULES_TEXT,
    NAMING_RULES_TEXT,
    EXAMPLES_TEXT
} from '@/lib/ai/prompts.config'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

export interface ToolDefinition {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: Record<string, unknown>
    }
}

const ENTITY_TYPES = BUFF_ENTITY_TYPES as readonly string[]

function validEntityType(v: unknown): v is BuffEntityType {
    return typeof v === 'string' && ENTITY_TYPES.includes(v)
}

// ── 默认工具 schema ──────────────────────────────────────────
const BASE_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'list_entities',
            description: '列出某个实体类型的全部实体名称（角色/武器/声骸/声骸套装）。返回实体名数组。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: {
                        type: 'string',
                        enum: ENTITY_TYPES,
                        description: '实体类型：character/weapon/echo/1set/2set/3set/4set/5set'
                    }
                },
                required: ['entityType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_entities',
            description:
                '按关键词模糊搜索实体名称（支持角色/武器/声骸/套装任意类型）。实体很多时用它定位准确名称，再调用 get_entity_info。',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: '搜索关键词（中文片段）' },
                    entityType: {
                        type: 'string',
                        enum: ENTITY_TYPES,
                        description: '实体类型（可选，不填则搜全部类型）'
                    }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_entity_info',
            description:
                '获取单个实体的官方信息（角色技能/武器效果/声骸技能/套装加成等），用于提取增益 Buff。返回精简后的 JSON。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: {
                        type: 'string',
                        enum: ENTITY_TYPES,
                        description: '实体类型：character/weapon/echo/1set/2set/3set/4set/5set'
                    },
                    entityName: { type: 'string', description: '实体名称（中文）' }
                },
                required: ['entityType', 'entityName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_buff_sets',
            description:
                '查询数据库中已收录的 Buff 集。可按实体类型/实体名精确过滤，或用 query 模糊搜索实体名或 buff 名。返回现有 buff 的 buff_name/scope/exclusive/乘区数值，用于对比、去重或核对。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: {
                        type: 'string',
                        enum: ENTITY_TYPES,
                        description: '实体类型（可选，不填则查全部）'
                    },
                    entityName: { type: 'string', description: '实体名称（可选，精确匹配，中文）' },
                    query: { type: 'string', description: '模糊搜索关键词（可选，匹配实体名或 buff 名）' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_editing_context',
            description:
                '获取当前正在编辑的实体：实体类型、实体名，以及该实体已收录的全部 Buff（用于追问时了解现状、避免重复）。',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'diff_buffs',
            description:
                '将你拟定的 buff 列表与数据库中该实体已收录的 buff 做差异对比，返回「新增/需修改/重复/可删除」清单。用于追问时精准增改、避免与已有内容冲突。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: {
                        type: 'string',
                        enum: ENTITY_TYPES,
                        description: '实体类型（可选，默认当前编辑实体）'
                    },
                    entityName: { type: 'string', description: '实体名称（可选，默认当前编辑实体）' },
                    buffs: {
                        type: 'array',
                        description: '拟定的 buff 列表',
                        items: {
                            type: 'object',
                            properties: {
                                buffName: { type: 'string' },
                                scope: { type: 'string', enum: ['self', 'self_except', 'team', 'effect_only'] },
                                exclusive: { type: 'boolean' },
                                zones: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            zoneId: { type: 'string' },
                                            value: { type: 'number' },
                                            override: { type: 'boolean' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                required: ['buffs']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_zone',
            description: '获取某个乘区（zoneId）的说明（含义/单位/判定提示），用于确认该增益应归入哪个乘区。',
            parameters: {
                type: 'object',
                properties: {
                    zoneId: { type: 'string', description: '乘区 id（乘区或引用乘区）' }
                },
                required: ['zoneId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_effects',
            description: '获取游戏内六种"效应"的说明（光噪/霜渐/聚爆/电磁/风蚀/虚湮），以及效应专属 buff 的映射规则。',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_scope_rules',
            description: '获取受影响者（scope）的取值与判定细则（self/self_except/team/effect_only）。',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_slang_dict',
            description: '获取黑话词典（官方/生僻叫法 → 玩家黑话），用于 buff 命名的变体⑥优化。',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_naming_rules',
            description: '获取 buff 命名规范（触发来源+触发手段+层数、叠层拆分、变体规则）。',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_examples',
            description: '获取 few-shot 示例（声骸套装/武器叠层/角色引用属性的输入输出对照），用于理解格式与判定。',
            parameters: { type: 'object', properties: {} }
        }
    }
]

// 按前端配置覆盖 description；未配置则用默认
export function buildTools(toolPrompts?: Record<string, string>): ToolDefinition[] {
    if (!toolPrompts) return BASE_TOOLS
    return BASE_TOOLS.map((t) => {
        const custom = toolPrompts[t.function.name]
        if (!custom || !custom.trim()) return t
        return {
            ...t,
            function: { ...t.function, description: custom.trim() }
        }
    })
}

export interface GetBuffSetsFn {
    (entityType?: string, entityName?: string, query?: string): Promise<unknown>
}

// 当前编辑上下文（由 route 注入）
export interface ToolContext {
    toolBase: string
    entityType: BuffEntityType
    entityName: string
    getBuffSets?: GetBuffSetsFn
    slangDict?: string
}

// ── 执行器 ───────────────────────────────────────────────────
export async function executeTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<string> {
    const { toolBase, entityType: curType, entityName: curName, getBuffSets, slangDict } = ctx

    switch (name) {
        case 'list_entities': {
            const entityType = args.entityType
            if (!validEntityType(entityType)) return JSON.stringify({ error: '无效的实体类型' })
            const list = await fetchToolList(toolBase, entityType)
            return JSON.stringify({
                entityType,
                count: list.length,
                names: list.map((e) => e.name)
            })
        }
        case 'search_entities': {
            const query = typeof args.query === 'string' ? args.query.trim() : ''
            if (!query) return JSON.stringify({ error: '缺少搜索关键词' })
            const types: BuffEntityType[] = validEntityType(args.entityType)
                ? [args.entityType as BuffEntityType]
                : (ENTITY_TYPES as BuffEntityType[])
            const results: Array<{ entityType: string; name: string }> = []
            for (const t of types) {
                const list = await fetchToolList(toolBase, t)
                for (const e of list) {
                    if (e.name.includes(query)) results.push({ entityType: t, name: e.name })
                }
            }
            return JSON.stringify({ query, count: results.length, matches: results.slice(0, 30) })
        }
        case 'get_entity_info': {
            const entityType = args.entityType
            const entityName = typeof args.entityName === 'string' ? args.entityName.trim() : ''
            if (!validEntityType(entityType)) return JSON.stringify({ error: '无效的实体类型' })
            if (!entityName) return JSON.stringify({ error: '缺少实体名' })
            const info = await fetchToolInfo(toolBase, entityType, entityName)
            if (info === null) return JSON.stringify({ error: `工具箱未找到「${entityName}」的信息` })
            return JSON.stringify(summarizeAiInfo(entityType, info))
        }
        case 'get_buff_sets': {
            if (!getBuffSets) return JSON.stringify({ error: '无法查询数据库' })
            const entityType = args.entityType
            const entityName = typeof args.entityName === 'string' ? args.entityName.trim() : ''
            const query = typeof args.query === 'string' ? args.query.trim() : ''
            const data = await getBuffSets(
                validEntityType(entityType) ? entityType : undefined,
                entityName || undefined,
                query || undefined
            )
            return JSON.stringify(data)
        }
        case 'get_editing_context': {
            if (!getBuffSets) return JSON.stringify({ error: '无法查询数据库' })
            const data = await getBuffSets(curType, curName)
            return JSON.stringify({
                entityType: curType,
                entityName: curName,
                ...(data as object)
            })
        }
        case 'diff_buffs': {
            if (!getBuffSets) return JSON.stringify({ error: '无法查询数据库' })
            const entityType = validEntityType(args.entityType) ? (args.entityType as BuffEntityType) : curType
            const entityName = typeof args.entityName === 'string' && args.entityName.trim()
                ? args.entityName.trim()
                : curName
            const proposed = Array.isArray(args.buffs) ? (args.buffs as ProposedBuff[]) : []
            const existingRaw = await getBuffSets(entityType, entityName)
            const existing = ((existingRaw as { buffSets?: BuffSetRow[] }).buffSets ?? []) as BuffSetRow[]

            return JSON.stringify(buildDiff(entityType, entityName, existing, proposed))
        }
        case 'get_zone': {
            const zoneId = typeof args.zoneId === 'string' ? args.zoneId.trim() : ''
            const def = BUFF_ZONE_MAP.get(zoneId) ?? BUFF_REF_ZONE_MAP.get(zoneId)
            if (!def) {
                const known = [...BUFF_ZONES.map((z) => z.id), ...BUFF_REF_ZONES.map((z) => z.id)]
                return JSON.stringify({ error: `未知乘区：${zoneId}`, knownZones: known })
            }
            return JSON.stringify({ zoneId: def.id, label: def.label, unit: def.unit })
        }
        case 'get_effects':
            return EFFECTS_TEXT
        case 'get_scope_rules':
            return SCOPE_RULES_TEXT
        case 'get_slang_dict':
            return slangDict?.trim() || DEFAULT_SLANG_DICT
        case 'get_naming_rules':
            return NAMING_RULES_TEXT
        case 'get_examples':
            return EXAMPLES_TEXT
        default:
            return JSON.stringify({ error: `未知工具：${name}` })
    }
}

interface ProposedBuff {
    buffName?: string
    scope?: string
    exclusive?: boolean
    zones?: Array<{ zoneId?: string; value?: number; override?: boolean }>
}

// 比对已存 buff 与拟定 buff，返回差异清单
function buildDiff(
    entityType: BuffEntityType,
    entityName: string,
    existing: BuffSetRow[],
    proposed: ProposedBuff[]
): unknown {
    const existingKeyed = new Map(existing.map((r) => [r.buff_name, r]))
    const proposedKeyed = new Map<string, ProposedBuff>()
    for (const p of proposed) {
        const name = p.buffName?.trim()
        if (name) proposedKeyed.set(name, p)
    }

    const toAdd: ProposedBuff[] = []
    const toModify: Array<{ buffName: string; old: BuffSetRow; next: ProposedBuff }> = []
    const duplicates: Array<{ buffName: string; existing: BuffSetRow }> = []
    const unchanged: string[] = []

    for (const [name, p] of proposedKeyed) {
        const e = existingKeyed.get(name)
        if (!e) {
            toAdd.push(p)
            continue
        }
        if (sameBuff(e, p)) {
            unchanged.push(name)
        } else {
            duplicates.push({ buffName: name, existing: e })
            toModify.push({ buffName: name, old: e, next: p })
        }
    }

    const toRemove: BuffSetRow[] = existing.filter((r) => !proposedKeyed.has(r.buff_name))

    return {
        entityType,
        entityName,
        summary: {
            totalExisting: existing.length,
            totalProposed: proposedKeyed.size,
            add: toAdd.length,
            modify: toModify.length,
            duplicate: duplicates.length,
            remove: toRemove.length,
            unchanged: unchanged.length
        },
        toAdd,
        toModify: toModify.map((m) => ({ buffName: m.buffName, old: m.old, next: m.next })),
        duplicates,
        toRemove: toRemove.map((r) => r.buff_name),
        unchanged
    }
}

function sameBuff(existing: BuffSetRow, p: ProposedBuff): boolean {
    if (existing.scope !== p.scope) return false
    if (!!existing.exclusive !== !!p.exclusive) return false
    const eZones = existing.buff_set ?? []
    const pZones = p.zones ?? []
    if (eZones.length !== pZones.length) return false
    const key = (z: { zoneId?: string; value?: number; override?: boolean }) =>
        `${z.zoneId}:${z.value}:${z.override ? 'o' : 'a'}`
    const eKeys = [...eZones].map(key).sort().join('|')
    const pKeys = pZones.map(key).sort().join('|')
    return eKeys === pKeys
}

// ── info 精简（供 AI 分析，只保留可量化增益相关）───────────
export function summarizeAiInfo(entityType: BuffEntityType, info: unknown): unknown {
    if (!info || typeof info !== 'object') return info
    const o = info as Record<string, unknown>

    switch (entityType) {
        case 'weapon':
            return { effect: o.effect }
        case 'echo':
            return { cost: o.cost, skill: o.skill, groups: o.groups }
        case 'character':
            return {
                element: o.element,
                weaponType: o.weaponType,
                skills: o.skills,
                statNodes: o.statNodes,
                chains: o.chains
            }
        case '1set':
        case '2set':
        case '3set':
        case '4set':
        case '5set':
            return { bonuses: o.bonuses }
        default:
            return o
    }
}
