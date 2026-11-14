// AI 控制台的 Buff 域工具（读 + 写）。
//
// 约定：
// - **读**不需要审批；**写**每一个动作都要一次人工审批，并带上 diff（agent/run.ts 负责弹卡）。
// - 锁：非管理员遇到「全局锁开」或「该实体被单独锁定」时，写工具直接拒绝并在结果里说明原因；
//   AI 没有任何改锁的工具（锁只有管理员在界面上能改）。
// - 服务端 server action 仍会再判一次权限（双保险），AI 这边只是提前拦住、把话说清楚。
import { fetchToolInfo, fetchToolList, prepareAiInfo } from '@/lib/ai/info'
import { queryBuffSets } from '@/lib/ai/buff-query'
import { sanitizeBuffs } from '@/lib/ai/client'
import { deleteBuffEntity, deleteBuffPreset, upsertBuffEntity, upsertBuffSet } from '@/lib/actions/buff-sets'
import { setBuffSetLock } from '@/lib/actions/edit-locks'
import { canNonAdminEditBuff, buffLockKey, type EditLocksSnapshot } from '@/lib/edit-locks.shared'
import { buffLeafName, joinBuffPath, sanitizeFolderName } from '@/lib/buff-names'
import {
    BUFF_ENTITY_TYPES,
    BUFF_ZONE_MAP,
    describeZoneConditionBadge,
    describeZoneRef
} from '@/lib/consts/buff-zones'
import type { AgentBuff, ApprovalDiffRow, ApprovalRequest, AgentRole } from '@/lib/agent/types'
import type { ToolDefinition } from '@/lib/ai/tools'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

export interface BuffToolContext {
    role: AgentRole
    locks: EditLocksSnapshot
    /** @desc apply_batch 内部批量执行时置 true：跳过逐条审批（外层已经审批过一次） */
    skipApproval?: boolean
    requestApproval: (req: Omit<ApprovalRequest, 'id' | 'createdAt'>) => Promise<boolean | { approved: boolean; comment?: string }>
}

const ENTITY_TYPES = BUFF_ENTITY_TYPES as readonly string[]

/** @desc 该实体在当前身份下是否可写（管理员恒可写；非管理员受锁限制） */
function assertWritable(ctx: BuffToolContext, entityType: string, entityName: string): string | null {
    if (ctx.role === 'admin') return null
    if (!canNonAdminEditBuff(ctx.locks, entityType, entityName)) {
        const locked = ctx.locks.buffLocks[buffLockKey(entityType, entityName)]
        return locked
            ? `「${entityName}」的 Buff 集已被管理员单独锁定，你无法修改（锁只有管理员能改）。`
            : 'Buff 集编辑当前处于锁定状态（仅管理员可编辑），你无法修改。'
    }
    return null
}

function validateEntityType(entityType: string): string | null {
    return ENTITY_TYPES.includes(entityType) ? null : `无效的实体类型：${entityType}`
}

/** @desc 全名：folder + 短名（与工坊的 `原文案 \ 效果` 一致） */
function fullNameOf(folder: string | undefined, buffName: string): string {
    const folderName = folder ? sanitizeFolderName(folder) : ''
    return folderName ? joinBuffPath(folderName, buffName) : buffName
}

/** @desc 乘区 → 「乘区名: 值/引用」映射，用于字段级 diff */
function zoneMap(zones: AgentBuff['zones']): Map<string, string> {
    const map = new Map<string, string>()
    for (const z of zones) {
        const label = BUFF_ZONE_MAP.get(z.zoneId)?.label ?? z.zoneId
        const badge = describeZoneConditionBadge(z.condition)
        const value = z.ref ? describeZoneRef(z.ref) : String(z.value)
        map.set(label, `${value}${badge ? `[${badge}]` : ''}`)
    }
    return map
}

/** @desc 同一乘区的旧值/新值对照（审批卡「字段明细」用） */
function zoneDiffFields(oldZones: AgentBuff['zones'], newZones: AgentBuff['zones']) {
    const before = zoneMap(oldZones)
    const after = zoneMap(newZones)
    const fields: Array<{ label: string; from?: string; to?: string }> = []
    for (const [label, to] of after) {
        const from = before.get(label)
        fields.push({ label, from: from && from !== to ? from : undefined, to })
    }
    for (const [label, from] of before) {
        if (!after.has(label)) fields.push({ label, from, to: '（删除）' })
    }
    return fields
}

function zoneSummary(zones: AgentBuff['zones']): string {
    return (
        zones
            .map((z) => {
                const label = BUFF_ZONE_MAP.get(z.zoneId)?.label ?? z.zoneId
                if (z.ref) return `${label}=引用${z.ref.targetZoneId}(${z.ref.pct}%)`
                return `${label}+${z.value}`
            })
            .join(' · ') || '无乘区'
    )
}

async function loadRows(entityType: string, entityName: string): Promise<BuffSetRow[]> {
    const res = (await queryBuffSets(entityType, entityName)) as { buffSets?: BuffSetRow[]; error?: string }
    return res.buffSets ?? []
}

/** @desc 审批包装：拒绝时返回给模型的提示文本 */
async function approve(
    ctx: BuffToolContext,
    req: Omit<ApprovalRequest, 'id' | 'createdAt'>
): Promise<{ ok: true } | { ok: false; text: string }> {
    const decision = await ctx.requestApproval(req)
    const approved = typeof decision === 'boolean' ? decision : decision.approved
    const comment = typeof decision === 'boolean' ? '' : (decision.comment ?? '')
    if (!approved) {
        return { ok: false, text: `人工拒绝了该操作${comment ? `：${comment}` : ''}。请调整方案后重新提议，不要重复提交相同操作。` }
    }
    return { ok: true }
}

// ── 工具 schema ────────────────────────────────────────────────

const ZONE_SCHEMA = {
    type: 'object',
    required: ['zoneId', 'value'],
    properties: {
        zoneId: { type: 'string', description: '乘区 id（见系统提示的乘区白名单）' },
        value: { type: 'number', description: '数值（引用/转模条目填 0）' },
        override: { type: 'boolean' },
        condition: { type: 'object', description: '乘区级条件：{"elements":[...]} / {"damageTypes":[...]}' },
        ref: {
            type: 'object',
            description: '引用 / 转模；离散转模写 discrete+divisor+multiplier，不写 pct',
            properties: {
                targetZoneId: { type: 'string' },
                pct: { type: 'number' },
                threshold: { type: 'number' },
                lower: { type: 'number' },
                upper: { type: 'number' },
                discrete: { type: 'boolean' },
                divisor: { type: 'number' },
                multiplier: { type: 'number' },
                refOwner: { type: 'string', enum: ['self', 'owner', 'active'] }
            }
        }
    }
} as const

const BUFF_SCHEMA = {
    type: 'object',
    required: ['buffName', 'zones'],
    properties: {
        folder: { type: 'string', description: '游戏原文案（全名的文件夹段，只去掉增益数值）' },
        buffName: { type: 'string', description: '效果短名，如 `暴击率15%` / `暴击伤害(1阶)`' },
        scope: { type: 'string', enum: ['self', 'self_except', 'team', 'effect_only'] },
        exclusive: { type: 'boolean' },
        condition: {
            type: 'object',
            description:
                '实例级条件：链/阶 {"chains":[{"charIdx":0,"min":3}]}；规则列表 {"rules":[{"kind":"enemyType","types":["BOSS"]}]}（kind 取 chain/refinement/damageNameRegex/zoneCompare/enemyType，规则之间全部 AND、同一 kind 只能有一条；zoneCompare 的 charIdx 只有 0=本角色 / -1=出伤者）'
        },
        zones: { type: 'array', items: ZONE_SCHEMA }
    }
} as const

export const BUFF_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'list_buff_entities',
            description: '列出某类实体（character/weapon/echo/1set…5set）的名称，用于定位要处理的实体。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    query: { type: 'string', description: '可选：名称包含的关键词' }
                },
                required: ['entityType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_entity_info',
            description: '读取实体的原始游戏数据（角色的固有属性/技能/共鸣链，武器的效果描述，声骸/套装加成），buff 必须从这些原文推导。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    entityName: { type: 'string' }
                },
                required: ['entityType', 'entityName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_buff_sets',
            description: '查询数据库里已收录的 Buff 集（可按实体类型/实体名/关键词过滤），返回 buff 全名、scope、条件与乘区。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    entityName: { type: 'string' },
                    query: { type: 'string', description: '关键词（实体名或 buff 名）' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_edit_locks',
            description: '查看当前编辑锁状态：哪些 Buff 实体被管理员锁定、全局 buff 锁是否开启。写之前用它确认目标是否可改。',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'upsert_buff',
            description:
                '新增或修改一条 Buff（按全名匹配：存在则整体替换该条）。写库前会弹人工审批并给出 diff。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    entityName: { type: 'string' },
                    folder: { type: 'string', description: '游戏原文案（文件夹段）' },
                    buffName: { type: 'string', description: '效果短名' },
                    scope: { type: 'string', enum: ['self', 'self_except', 'team', 'effect_only'] },
                    exclusive: { type: 'boolean' },
                    condition: { type: 'object' },
                    zones: { type: 'array', items: ZONE_SCHEMA }
                },
                required: ['entityType', 'entityName', 'buffName', 'zones']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'rename_buff',
            description: '把一条 Buff 改名（可同时改文件夹），数值/条件保持不变。需要人工审批。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    entityName: { type: 'string' },
                    fromName: { type: 'string', description: '现有全名（精确匹配）' },
                    folder: { type: 'string', description: '新文件夹（游戏原文案）；留空表示根目录' },
                    buffName: { type: 'string', description: '新短名' }
                },
                required: ['entityType', 'entityName', 'fromName', 'buffName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_buff',
            description: '删除一条 Buff。需要人工审批。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    entityName: { type: 'string' },
                    buffName: { type: 'string', description: '要删除的 buff 全名' }
                },
                required: ['entityType', 'entityName', 'buffName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'replace_entity_buffs',
            description:
                '整份替换某个实体的 Buff 集（先清空该实体全部条目与文件夹，再写入这批）。用于「按新命名风格整体重做」。需要人工审批并给出差异统计。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    entityName: { type: 'string' },
                    buffs: { type: 'array', items: BUFF_SCHEMA }
                },
                required: ['entityType', 'entityName', 'buffs']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'apply_batch',
            description:
                '一次审批执行多条 buff 改动（快速审批）：ops 按顺序执行，审批卡会逐项列出都改了什么。适合批量改名、批量补条目、批量删条目；整份重写请仍用 replace_entity_buffs。',
            parameters: {
                type: 'object',
                properties: {
                    ops: {
                        type: 'array',
                        description: '按顺序执行的操作列表',
                        items: {
                            type: 'object',
                            required: ['op', 'entityType', 'entityName'],
                            properties: {
                                op: { type: 'string', enum: ['upsert', 'rename', 'delete'] },
                                entityType: { type: 'string', enum: ENTITY_TYPES },
                                entityName: { type: 'string' },
                                folder: { type: 'string' },
                                buffName: { type: 'string', description: 'upsert/rename 的目标短名；delete 时为全名' },
                                fromName: { type: 'string', description: 'rename 的现有全名' },
                                scope: { type: 'string', enum: ['self', 'self_except', 'team', 'effect_only'] },
                                exclusive: { type: 'boolean' },
                                condition: { type: 'object' },
                                zones: { type: 'array', items: ZONE_SCHEMA }
                            }
                        }
                    }
                },
                required: ['ops']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_entity_buffs',
            description: '删除某个实体的整份 Buff 集（含文件夹）。仅管理员可用，需要人工审批。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    entityName: { type: 'string' }
                },
                required: ['entityType', 'entityName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_buff_entity_lock',
            description:
                '给某个 Buff 实体上锁/解锁（条目级编辑锁）。上锁后该实体只有管理员能改，登录用户保存会被拒；解锁后恢复「登录用户可改」。仅管理员可用，需要人工审批。',
            parameters: {
                type: 'object',
                properties: {
                    entityType: { type: 'string', enum: ENTITY_TYPES },
                    entityName: { type: 'string' },
                    locked: { type: 'boolean', description: 'true = 上锁（仅管理员可改），false = 解锁' }
                },
                required: ['entityType', 'entityName', 'locked']
            }
        }
    }
]

// ── 执行器 ────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** @desc 把模型给的 buff 清洗成工坊口径（白名单乘区、两段式全名、去重） */
function cleanBuff(raw: unknown): AgentBuff | null {
    const b = asRecord(raw)
    const cleaned = sanitizeBuffs(
        [
            {
                folder: str(b.folder) || undefined,
                buffName: str(b.buffName),
                scope: b.scope as never,
                exclusive: !!b.exclusive,
                condition: (b.condition ?? undefined) as never,
                zones: (Array.isArray(b.zones) ? b.zones : []) as never
            }
        ],
        { leafOnly: true }
    )[0]
    return (cleaned as AgentBuff | undefined) ?? null
}

export async function executeBuffTool(
    ctx: BuffToolContext,
    name: string,
    args: Record<string, unknown>
): Promise<{ text: string; raw?: unknown }> {
    switch (name) {
        case 'list_buff_entities': {
            const entityType = str(args.entityType)
            const typeErr = validateEntityType(entityType)
            if (typeErr) return { text: JSON.stringify({ error: typeErr }) }
            const list = await fetchToolList(entityType as BuffEntityType)
            const q = str(args.query)
            const names = [...new Set(list.map((e) => e.name))].filter((n) => (q ? n.includes(q) : true))
            return { text: JSON.stringify({ total: names.length, names }) }
        }
        case 'get_entity_info': {
            const entityType = str(args.entityType)
            const entityName = str(args.entityName)
            const typeErr = validateEntityType(entityType)
            if (typeErr) return { text: JSON.stringify({ error: typeErr }) }
            if (!entityName) return { text: JSON.stringify({ error: 'entityName 不能为空' }) }
            const info = await fetchToolInfo(entityType as BuffEntityType, entityName)
            return { text: JSON.stringify(prepareAiInfo(entityType as BuffEntityType, info)) }
        }
        case 'get_buff_sets': {
            const res = await queryBuffSets(str(args.entityType) || undefined, str(args.entityName) || undefined, str(args.query) || undefined)
            return { text: JSON.stringify(res) }
        }
        case 'get_edit_locks': {
            const lockedEntities = Object.keys(ctx.locks.buffLocks)
            return {
                text: JSON.stringify({
                    role: ctx.role,
                    buffSetsLocked: ctx.locks.buffSetsLocked,
                    lockedEntities,
                    note:
                        ctx.role === 'admin'
                            ? '你是管理员，锁定不影响你的写入；但锁本身只能由管理员在界面上改，你没有改锁的工具。'
                            : '非管理员：全局锁开启或被单独锁定的实体一律不可写。'
                })
            }
        }
        case 'upsert_buff': {
            const entityType = str(args.entityType)
            const entityName = str(args.entityName)
            const typeErr = validateEntityType(entityType)
            if (typeErr) return { text: JSON.stringify({ error: typeErr }) }
            if (!entityName) return { text: JSON.stringify({ error: 'entityName 不能为空' }) }
            const lockErr = assertWritable(ctx, entityType, entityName)
            if (lockErr) return { text: JSON.stringify({ error: lockErr }) }
            const buff = cleanBuff(args)
            if (!buff) return { text: JSON.stringify({ error: 'Buff 不合法：需要白名单乘区与合法数值' }) }

            const rows = await loadRows(entityType, entityName)
            const old = rows.find((r) => r.buff_name === buff.buffName)
            const oldZones = (old?.buff_set ?? []) as AgentBuff['zones']
            const folderBefore = old?.buff_name.includes('\\') ? old.buff_name.slice(0, old.buff_name.indexOf('\\')) : '（根）'
            const folderAfter = buff.buffName.includes('\\') ? buff.buffName.slice(0, buff.buffName.indexOf('\\')) : '（根）'
            const diff: ApprovalDiffRow[] = [
                {
                    kind: old ? 'update' : 'add',
                    name: buff.buffName,
                    detail: old ? '修改现有条目' : zoneSummary(buff.zones),
                    fields: old
                        ? [
                              ...(folderBefore !== folderAfter
                                  ? [{ label: 'folder', from: folderBefore, to: folderAfter }]
                                  : []),
                              ...zoneDiffFields(oldZones, buff.zones)
                          ]
                        : undefined
                }
            ]
            const gate = ctx.skipApproval ? ({ ok: true } as const) : await approve(ctx, {
                toolName: name,
                title: old ? '修改 1 条 Buff' : '新增 1 条 Buff',
                target: `${entityType} / ${entityName}`,
                diff,
                payload: { ...args, cleaned: buff }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await upsertBuffSet({
                entityType: entityType as BuffEntityType,
                entityName,
                buffName: buff.buffName,
                scope: buff.scope,
                exclusive: buff.exclusive,
                condition: buff.condition,
                zones: buff.zones as never
            })
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, entityType, entityName, buffName: buff.buffName }) }
        }
        case 'rename_buff': {
            const entityType = str(args.entityType)
            const entityName = str(args.entityName)
            const typeErr = validateEntityType(entityType)
            if (typeErr) return { text: JSON.stringify({ error: typeErr }) }
            const lockErr = assertWritable(ctx, entityType, entityName)
            if (lockErr) return { text: JSON.stringify({ error: lockErr }) }
            const fromName = str(args.fromName)
            const rows = await loadRows(entityType, entityName)
            const src = rows.find((r) => r.buff_name === fromName)
            if (!src) return { text: JSON.stringify({ error: `没有找到 Buff：${fromName}` }) }
            const toName = fullNameOf(str(args.folder) || undefined, str(args.buffName))
            if (rows.some((r) => r.buff_name === toName && r.buff_name !== fromName)) {
                return { text: JSON.stringify({ error: `目标名已存在：${toName}` }) }
            }
            const gate = ctx.skipApproval ? ({ ok: true } as const) : await approve(ctx, {
                toolName: name,
                title: '重命名 1 条 Buff',
                target: `${entityType} / ${entityName}`,
                diff: [{ kind: 'update', name: fromName, detail: `→ ${toName}` }],
                payload: args
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const write = await upsertBuffSet({
                entityType: entityType as BuffEntityType,
                entityName,
                buffName: toName,
                scope: src.scope as never,
                exclusive: src.exclusive,
                condition: src.condition,
                zones: (src.buff_set ?? []) as never
            })
            if (write.error) return { text: JSON.stringify({ error: write.error }) }
            const del = await deleteBuffPreset(entityType as BuffEntityType, entityName, fromName)
            if (del.error) return { text: JSON.stringify({ error: `新名已写入，但删除旧名失败：${del.error}` }) }
            return { text: JSON.stringify({ ok: true, from: fromName, to: toName }) }
        }
        case 'delete_buff': {
            const entityType = str(args.entityType)
            const entityName = str(args.entityName)
            const typeErr = validateEntityType(entityType)
            if (typeErr) return { text: JSON.stringify({ error: typeErr }) }
            const lockErr = assertWritable(ctx, entityType, entityName)
            if (lockErr) return { text: JSON.stringify({ error: lockErr }) }
            const buffName = str(args.buffName)
            const gate = ctx.skipApproval ? ({ ok: true } as const) : await approve(ctx, {
                toolName: name,
                title: '删除 1 条 Buff',
                target: `${entityType} / ${entityName}`,
                diff: [{ kind: 'delete', name: buffName }],
                payload: args
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }
            const res = await deleteBuffPreset(entityType as BuffEntityType, entityName, buffName)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, deleted: buffName }) }
        }
        case 'replace_entity_buffs': {
            const entityType = str(args.entityType)
            const entityName = str(args.entityName)
            const typeErr = validateEntityType(entityType)
            if (typeErr) return { text: JSON.stringify({ error: typeErr }) }
            if (!entityName) return { text: JSON.stringify({ error: 'entityName 不能为空' }) }
            const lockErr = assertWritable(ctx, entityType, entityName)
            if (lockErr) return { text: JSON.stringify({ error: lockErr }) }
            const rawList = Array.isArray(args.buffs) ? args.buffs : []
            const cleaned = rawList.map(cleanBuff).filter((b): b is AgentBuff => !!b)
            if (cleaned.length === 0) return { text: JSON.stringify({ error: '这批 buff 全部不合法（白名单乘区/数值校验失败）' }) }

            const rows = await loadRows(entityType, entityName)
            const oldNames = new Set(rows.map((r) => r.buff_name))
            const newNames = new Set(cleaned.map((b) => b.buffName))
            const added = cleaned.filter((b) => !oldNames.has(b.buffName)).map((b) => b.buffName)
            const removed = [...oldNames].filter((n) => !newNames.has(n))
            const diff: ApprovalDiffRow[] = [
                { kind: 'info', name: `${entityType} / ${entityName}`, detail: `现有 ${rows.length} 条 → 新 ${cleaned.length} 条` },
                ...added.slice(0, 40).map((n) => ({ kind: 'add' as const, name: n })),
                ...removed.slice(0, 40).map((n) => ({ kind: 'delete' as const, name: n })),
                ...(added.length > 40 ? [{ kind: 'info' as const, name: `…还有 ${added.length - 40} 条新增` }] : []),
                ...(removed.length > 40 ? [{ kind: 'info' as const, name: `…还有 ${removed.length - 40} 条删除` }] : [])
            ]
            const gate = ctx.skipApproval ? ({ ok: true } as const) : await approve(ctx, {
                toolName: name,
                title: `整份替换 Buff 集（${cleaned.length} 条）`,
                target: `${entityType} / ${entityName}`,
                diff,
                payload: { entityType, entityName, buffs: cleaned }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await upsertBuffEntity({
                entityType: entityType as BuffEntityType,
                entityName,
                buffs: cleaned.map((b) => ({
                    buffName: b.buffName,
                    scope: b.scope,
                    exclusive: b.exclusive,
                    condition: b.condition,
                    zones: b.zones as never
                }))
            })
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, saved: res.data?.saved ?? cleaned.length, entityName }) }
        }
        case 'apply_batch': {
            const rawOps = Array.isArray(args.ops) ? args.ops : []
            if (rawOps.length === 0) return { text: JSON.stringify({ error: 'ops 不能为空' }) }
            if (rawOps.length > 60) return { text: JSON.stringify({ error: '一次最多 60 条操作，请分批' }) }

            const diffs: ApprovalDiffRow[] = []
            for (const raw of rawOps) {
                const op = asRecord(raw)
                const kind = str(op.op)
                const entityType = str(op.entityType)
                const entityName = str(op.entityName)
                const lockErr = assertWritable(ctx, entityType, entityName)
                if (lockErr) return { text: JSON.stringify({ error: lockErr }) }
                const label =
                    kind === 'upsert'
                        ? fullNameOf(str(op.folder) || undefined, str(op.buffName))
                        : kind === 'rename'
                          ? `${str(op.fromName)} → ${fullNameOf(str(op.folder) || undefined, str(op.buffName))}`
                          : str(op.buffName)
                diffs.push({
                    kind: kind === 'delete' ? 'delete' : kind === 'rename' ? 'update' : 'update',
                    name: `[${entityName}] ${label}`,
                    detail: kind
                })
            }
            const gate = await approve(ctx, {
                toolName: name,
                title: `批量操作 ${rawOps.length} 项`,
                target: `${new Set(rawOps.map((o) => str(asRecord(o).entityName))).size} 个实体`,
                diff: diffs,
                payload: { ops: rawOps }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const results: Array<{ op: string; ok: boolean; detail?: string }> = []
            for (const raw of rawOps) {
                const op = asRecord(raw)
                const name2 = str(op.op)
                const sub =
                    name2 === 'upsert'
                        ? await executeBuffTool({ ...ctx, skipApproval: true }, 'upsert_buff', op)
                        : name2 === 'rename'
                          ? await executeBuffTool({ ...ctx, skipApproval: true }, 'rename_buff', op)
                          : name2 === 'delete'
                            ? await executeBuffTool({ ...ctx, skipApproval: true }, 'delete_buff', op)
                            : { text: JSON.stringify({ error: `未知 op：${name2}` }) }
                let ok = true
                let detail: string | undefined
                try {
                    const parsed = JSON.parse(sub.text) as { error?: string; rejected?: boolean }
                    if (parsed.error || parsed.rejected) {
                        ok = false
                        detail = parsed.error
                    }
                } catch {
                    ok = false
                    detail = sub.text.slice(0, 200)
                }
                results.push({ op: name2, ok, detail })
            }
            const failed = results.filter((r) => !r.ok).length
            return {
                text: JSON.stringify({
                    ok: failed === 0,
                    total: results.length,
                    failed,
                    results
                })
            }
        }
        case 'delete_entity_buffs': {
            if (ctx.role !== 'admin') return { text: JSON.stringify({ error: '删除整个实体仅管理员可用' }) }
            const entityType = str(args.entityType)
            const entityName = str(args.entityName)
            const typeErr = validateEntityType(entityType)
            if (typeErr) return { text: JSON.stringify({ error: typeErr }) }
            const rows = await loadRows(entityType, entityName)
            const gate = ctx.skipApproval ? ({ ok: true } as const) : await approve(ctx, {
                toolName: name,
                title: '删除整个实体的 Buff 集',
                target: `${entityType} / ${entityName}`,
                diff: [
                    { kind: 'delete', name: `${entityName}（${rows.length} 条）` },
                    ...rows.slice(0, 40).map((r) => ({ kind: 'delete' as const, name: `  ${r.buff_name}` }))
                ],
                payload: args
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }
            const res = await deleteBuffEntity(entityType as BuffEntityType, entityName)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, deletedEntity: `${entityType}/${entityName}` }) }
        }
        case 'set_buff_entity_lock': {
            if (ctx.role !== 'admin') return { text: JSON.stringify({ error: '编辑锁仅管理员可用' }) }
            const entityType = str(args.entityType)
            const entityName = str(args.entityName)
            const typeErr = validateEntityType(entityType)
            if (typeErr) return { text: JSON.stringify({ error: typeErr }) }
            if (!entityName) return { text: JSON.stringify({ error: 'entityName 不能为空' }) }
            const locked = !!args.locked
            const wasLocked = !!ctx.locks.buffLocks[buffLockKey(entityType, entityName)]
            const gate = ctx.skipApproval
                ? ({ ok: true } as const)
                : await approve(ctx, {
                      toolName: name,
                      title: locked ? '锁定该实体的编辑权限' : '解锁该实体的编辑权限',
                      target: `${entityType} / ${entityName}`,
                      diff: [
                          {
                              kind: 'update',
                              name: entityName,
                              fields: [
                                  {
                                      label: '编辑权限',
                                      from: wasLocked ? '仅管理员' : '登录用户',
                                      to: locked ? '仅管理员' : '登录用户'
                                  }
                              ]
                          }
                      ],
                      payload: args
                  })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }
            const res = await setBuffSetLock(entityType as BuffEntityType, entityName, locked)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return {
                text: JSON.stringify({
                    ok: true,
                    entity: `${entityType}/${entityName}`,
                    locked,
                    effect: locked ? '该实体现在仅管理员可改' : '该实体恢复为登录用户可改'
                })
            }
        }
        default:
            return { text: JSON.stringify({ error: `未知工具：${name}` }) }
    }
}

export const BUFF_TOOL_NAMES = new Set(BUFF_TOOLS.map((t) => t.function.name))
export { buffLeafName }
