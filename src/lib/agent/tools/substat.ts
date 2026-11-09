// AI 控制台的标准词条集（/edit/substat-sets）域工具。
//
// 口径与编辑器 / 公开 API 完全一致：plan 必须过 `validateEchoPlan`（5 部位、cost 合计 ≤12、
// 副词条合计恰好 14、副词条吸附档位、主词条取满级上限、副主词条按 cost 自动）。
// AI 写之前先调 get_substat_spec 拿到白名单与档位，避免拼出不合法 plan 被服务端拒绝。
import { createClient } from '@/lib/supabase/client'
import { deleteSubstatSet, upsertSubstatSet } from '@/lib/actions/substat-sets'
import { setSubstatSetLock } from '@/lib/actions/edit-locks'
import { canNonAdminEditSubstat, type EditLocksSnapshot } from '@/lib/edit-locks.shared'
import {
    ECHO_COST_MULTISET,
    ECHO_MAX_TOTAL_COST,
    ECHO_SLOT_COUNT,
    MAIN_STAT_POOL,
    SECOND_MAIN_STAT_DEFAULT,
    SUBSTAT_MAX_PER_SLOT,
    SUBSTAT_MIN_PER_SLOT,
    SUBSTAT_TIERS,
    SUBSTAT_TOTAL_COUNT,
    SUBSTAT_TYPES
} from '@/lib/consts/echo-stats'
import type { AgentRole, ApprovalDiffField, ApprovalRequest } from '@/lib/agent/types'
import type { ToolDefinition } from '@/lib/ai/tools'
import type { EchoPlan } from '@/lib/types/db'

export interface SubstatToolContext {
    role: AgentRole
    locks: EditLocksSnapshot
    requestApproval: (req: Omit<ApprovalRequest, 'id' | 'createdAt'>) => Promise<boolean | { approved: boolean; comment?: string }>
    skipApproval?: boolean
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

function assertWritable(ctx: SubstatToolContext, characterName: string): string | null {
    if (ctx.role === 'admin') return null
    if (!canNonAdminEditSubstat(ctx.locks, characterName)) {
        const locked = ctx.locks.substatLocks[characterName]
        return locked
            ? `「${characterName}」的标准词条集已被管理员单独锁定，你无法修改（锁只有管理员能改）。`
            : '标准词条集编辑当前处于锁定状态（仅管理员可编辑），你无法修改。'
    }
    return null
}

async function approve(
    ctx: SubstatToolContext,
    req: Omit<ApprovalRequest, 'id' | 'createdAt'>
): Promise<{ ok: true } | { ok: false; text: string }> {
    if (ctx.skipApproval) return { ok: true }
    const decision = await ctx.requestApproval(req)
    const approved = typeof decision === 'boolean' ? decision : decision.approved
    const comment = typeof decision === 'boolean' ? '' : (decision.comment ?? '')
    if (!approved) {
        return { ok: false, text: `人工拒绝了该操作${comment ? `：${comment}` : ''}。请调整方案后重新提议，不要重复提交相同操作。` }
    }
    return { ok: true }
}

const statText = (s: { type: string; value: number; unit: string } | null | undefined): string =>
    s ? `${s.type} ${s.value}${s.unit}` : '（空）'

/** @desc 词条集字段级 diff：逐部位列出主词条 / 副词条变化 */
function planDiffFields(oldPlan: EchoPlan | null, newPlan: EchoPlan): ApprovalDiffField[] {
    const fields: ApprovalDiffField[] = []
    const oldSlots = Array.isArray(oldPlan?.slots) ? oldPlan!.slots : []
    newPlan.slots.forEach((slot, i) => {
        const before = oldSlots[i]
        const label = `${i + 1}号位(cost${slot.cost})`
        const mainTo = statText(slot.mainStat)
        const mainFrom = statText(before?.mainStat)
        if (mainFrom !== mainTo) fields.push({ label: `${label} 主词条`, from: before ? mainFrom : undefined, to: mainTo })
        const subTo = slot.substats.map((s) => `${s.type}${s.value}`).join('、') || '（空）'
        const subFrom = (before?.substats ?? []).map((s) => `${s.type}${s.value}`).join('、') || '（空）'
        if (subFrom !== subTo) fields.push({ label: `${label} 副词条`, from: before ? subFrom : undefined, to: subTo })
    })
    return fields
}

const ZONE_HINT =
    'plan = { slots: [ 5 个部位 ] }；每个部位 { cost: 4|3|1, mainStat: {type,value,unit} | null, substats: [{type,value,unit}] }；' +
    '副主词条由系统按 cost 自动推导（不要自己填）。'

export const SUBSTAT_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'get_substat_spec',
            description: '获取标准词条集的全部规则与白名单：部位数、cost 上限、主词条池（含满级值）、副主词条自动值、副词条白名单与档位、总数要求。写之前必须先调用。',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_substat_sets',
            description: '查询已收录的标准词条集（可按角色名/关键词过滤），返回角色、plan 与备注。',
            parameters: {
                type: 'object',
                properties: {
                    characterName: { type: 'string', description: '精确角色名（可选）' },
                    query: { type: 'string', description: '关键词，匹配角色名或备注（可选）' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'upsert_substat_set',
            description:
                '新增或整份替换某角色的标准词条集（5 部位主词条 + 副词条）。会弹人工审批并逐部位列出 diff。仅已解锁角色可写。',
            parameters: {
                type: 'object',
                properties: {
                    characterName: { type: 'string' },
                    plan: {
                        type: 'object',
                        description: ZONE_HINT,
                        properties: { slots: { type: 'array', items: { type: 'object' } } }
                    },
                    note: { type: 'string', description: '可选备注（为什么是特殊方案）' }
                },
                required: ['characterName', 'plan']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_substat_set',
            description: '删除某个角色的标准词条集。仅管理员可用，需要人工审批。',
            parameters: {
                type: 'object',
                properties: { characterName: { type: 'string' } },
                required: ['characterName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_substat_set_lock',
            description:
                '给某个角色的标准词条集上锁/解锁（条目级编辑锁）。上锁后只有管理员能改这份方案，登录用户保存会被拒；解锁后恢复「登录用户可改」。仅管理员可用，需要人工审批。',
            parameters: {
                type: 'object',
                properties: {
                    characterName: { type: 'string' },
                    locked: { type: 'boolean', description: 'true = 上锁（仅管理员可改），false = 解锁' }
                },
                required: ['characterName', 'locked']
            }
        }
    }
]

export async function executeSubstatTool(
    ctx: SubstatToolContext,
    name: string,
    args: Record<string, unknown>
): Promise<{ text: string }> {
    switch (name) {
        case 'get_substat_spec': {
            return {
                text: JSON.stringify({
                    slotCount: ECHO_SLOT_COUNT,
                    defaultCosts: ECHO_COST_MULTISET,
                    maxTotalCost: ECHO_MAX_TOTAL_COST,
                    substatPerSlot: `${SUBSTAT_MIN_PER_SLOT}-${SUBSTAT_MAX_PER_SLOT}`,
                    substatTotal: SUBSTAT_TOTAL_COUNT,
                    substatTypes: SUBSTAT_TYPES,
                    substatTiers: SUBSTAT_TIERS,
                    mainStatPool: MAIN_STAT_POOL,
                    secondMainStatByCost: SECOND_MAIN_STAT_DEFAULT,
                    rules: [
                        'plan.slots 必须恰好 5 个部位',
                        '每部位 cost 只能是 4/3/1，5 部位 cost 合计 ≤ 12',
                        '主词条只需给 type，数值由系统取满级上限；不在该 cost 池子里的 type 会被拒绝',
                        '副主词条不要填，由 cost 自动推导（4→攻击150 / 3→攻击100 / 1→生命2280）',
                        '副词条 type 必须在白名单内，同部位不可重复，数值会被吸附到最近档位',
                        '5 个部位副词条合计必须恰好 14 条'
                    ]
                })
            }
        }
        case 'get_substat_sets': {
            const supabase = createClient()
            let q = supabase
                .from('standard_substat_sets')
                .select('id, character_name, plan, note, updated_at')
                .order('character_name', { ascending: true })
            const characterName = str(args.characterName)
            const query = str(args.query)
            if (characterName) q = q.eq('character_name', characterName)
            if (query) {
                const escaped = query.replace(/[%_\\]/g, '\\$&')
                q = q.or(`character_name.ilike.%${escaped}%,note.ilike.%${escaped}%`)
            }
            const { data, error } = await q.limit(100)
            if (error) return { text: JSON.stringify({ error: error.message }) }
            return { text: JSON.stringify({ total: data?.length ?? 0, rows: data ?? [] }) }
        }
        case 'upsert_substat_set': {
            const characterName = str(args.characterName)
            if (!characterName) return { text: JSON.stringify({ error: 'characterName 不能为空' }) }
            const lockErr = assertWritable(ctx, characterName)
            if (lockErr) return { text: JSON.stringify({ error: lockErr }) }
            const plan = asRecord(args.plan) as unknown as EchoPlan
            if (!Array.isArray((plan as unknown as { slots?: unknown }).slots)) {
                return { text: JSON.stringify({ error: 'plan 必须是 { slots: [...] }' }) }
            }

            const supabase = createClient()
            const { data: current } = await supabase
                .from('standard_substat_sets')
                .select('plan, note')
                .eq('character_name', characterName)
                .maybeSingle()
            const oldPlan = (current?.plan ?? null) as EchoPlan | null

            const gate = await approve(ctx, {
                toolName: name,
                title: current ? '修改标准词条集' : '新增标准词条集',
                target: `character / ${characterName}`,
                diff: [
                    {
                        kind: current ? 'update' : 'add',
                        name: characterName,
                        detail: current ? '整份替换 5 部位方案' : '新增一份 5 部位方案',
                        fields: planDiffFields(oldPlan, plan)
                    },
                    ...(args.note ? [{ kind: 'info' as const, name: '备注', detail: str(args.note) }] : [])
                ],
                payload: { characterName, plan, note: str(args.note) || null }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }

            const res = await upsertSubstatSet({
                characterName,
                plan,
                note: str(args.note) || null
            })
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, characterName }) }
        }
        case 'delete_substat_set': {
            if (ctx.role !== 'admin') return { text: JSON.stringify({ error: '删除词条集仅管理员可用' }) }
            const characterName = str(args.characterName)
            if (!characterName) return { text: JSON.stringify({ error: 'characterName 不能为空' }) }
            const gate = await approve(ctx, {
                toolName: name,
                title: '删除标准词条集',
                target: `character / ${characterName}`,
                diff: [{ kind: 'delete', name: characterName }],
                payload: { characterName }
            })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }
            const res = await deleteSubstatSet(characterName)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return { text: JSON.stringify({ ok: true, deleted: characterName }) }
        }
        case 'set_substat_set_lock': {
            if (ctx.role !== 'admin') return { text: JSON.stringify({ error: '编辑锁仅管理员可用' }) }
            const characterName = str(args.characterName)
            if (!characterName) return { text: JSON.stringify({ error: 'characterName 不能为空' }) }
            const locked = !!args.locked
            const wasLocked = !!ctx.locks.substatLocks[characterName]
            const gate = ctx.skipApproval
                ? ({ ok: true } as const)
                : await approve(ctx, {
                      toolName: name,
                      title: locked ? '锁定该角色的标准词条集' : '解锁该角色的标准词条集',
                      target: `character / ${characterName}`,
                      diff: [
                          {
                              kind: 'update',
                              name: characterName,
                              fields: [
                                  {
                                      label: '编辑权限',
                                      from: wasLocked ? '仅管理员' : '登录用户',
                                      to: locked ? '仅管理员' : '登录用户'
                                  }
                              ]
                          }
                      ],
                      payload: { characterName, locked }
                  })
            if (!gate.ok) return { text: JSON.stringify({ rejected: true, message: gate.text }) }
            const res = await setSubstatSetLock(characterName, locked)
            if (res.error) return { text: JSON.stringify({ error: res.error }) }
            return {
                text: JSON.stringify({
                    ok: true,
                    characterName,
                    locked,
                    effect: locked ? '该角色的标准词条集现在仅管理员可改' : '该角色的标准词条集恢复为登录用户可改'
                })
            }
        }
        default:
            return { text: JSON.stringify({ error: `未知工具：${name}` }) }
    }
}

export const SUBSTAT_TOOL_NAMES = new Set(SUBSTAT_TOOLS.map((t) => t.function.name))
