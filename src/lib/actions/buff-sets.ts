'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/supabase/admin'
import {
    BUFF_ENTITY_TYPES,
    BUFF_ZONE_MAP,
    BUFF_REF_ZONE_MAP,
    BUFF_SCOPES,
    sanitizeCondition
} from '@/lib/consts/buff-zones'
import type { BuffEntityType, BuffCondition, BuffScope, BuffRefOwner } from '@/lib/types/db'

export interface ActionResult<T = undefined> {
    data?: T
    error?: string
    debug?: string
}

// 仅管理员（保存 / 删除等写操作）
async function withAdmin() {
    const r = await requireAdmin()
    if (!r.ok || !r.supabase) return { supabase: null as never, error: r.error ?? '无权限' }
    return { supabase: r.supabase, error: null as string | null }
}

interface ZoneRefInput {
    targetZoneId?: string
    pct?: number
    threshold?: number
    lower?: number
    upper?: number
    discrete?: boolean
    divisor?: number
    multiplier?: number
    refOwner?: BuffRefOwner
}

interface ZoneInput {
    zoneId: string
    value: number
    ref?: ZoneRefInput | null
    override?: boolean
}

export interface InputBuff {
    entityType: BuffEntityType
    entityName: string
    buffName: string
    scope?: BuffScope
    exclusive?: boolean
    condition?: BuffCondition | null
    zones: ZoneInput[]
}

function sanitizeRef(ref: unknown): ZoneRefInput | undefined {
    if (!ref || typeof ref !== 'object') return undefined
    const r = ref as Record<string, unknown>
    const targetZoneId = typeof r.targetZoneId === 'string' ? r.targetZoneId.trim() : ''
    if (!BUFF_REF_ZONE_MAP.has(targetZoneId)) return undefined
    const pct = typeof r.pct === 'number' && Number.isFinite(r.pct) ? r.pct : 0
    if (!Number.isFinite(pct)) return undefined
    const out: ZoneRefInput = { targetZoneId, pct }
    if (typeof r.threshold === 'number' && Number.isFinite(r.threshold)) out.threshold = r.threshold
    if (typeof r.lower === 'number' && Number.isFinite(r.lower)) out.lower = r.lower
    if (typeof r.upper === 'number' && Number.isFinite(r.upper)) out.upper = r.upper
    if (r.discrete) out.discrete = true
    if (typeof r.divisor === 'number' && Number.isFinite(r.divisor)) out.divisor = r.divisor
    if (typeof r.multiplier === 'number' && Number.isFinite(r.multiplier)) out.multiplier = r.multiplier
    if (r.refOwner === 'self' || r.refOwner === 'owner') out.refOwner = r.refOwner
    return out
}

function sanitizeZones(zones: unknown): ZoneInput[] {
    if (!Array.isArray(zones)) return []
    const out: ZoneInput[] = []
    const seen = new Set<string>()
    for (const z of zones) {
        const zoneId = typeof z?.zoneId === 'string' ? z.zoneId.trim() : ''
        if (!BUFF_ZONE_MAP.has(zoneId) || seen.has(zoneId)) continue
        seen.add(zoneId)
        const value = typeof z?.value === 'number' && Number.isFinite(z.value) ? z.value : 0
        const ref = sanitizeRef(z?.ref)
        out.push({
            zoneId,
            value,
            ...(ref ? { ref } : {}),
            ...(z?.override ? { override: true } : {})
        })
    }
    return out
}

function normalizeScope(scope: unknown): BuffScope {
    return scope && BUFF_SCOPES.includes(scope as BuffScope) ? (scope as BuffScope) : 'team'
}

// 按实体类型约束条件类型：角色仅 chain（共鸣链）、武器仅 refinement（精炼），其它实体不支持条件
// 多字段条件模型：不再按实体类型限制（角色/武器/声骸/套装均可设链/精炼/属性/类型条件）
function sanitizeConditionForEntity(cond: unknown): BuffCondition | null {
    return sanitizeCondition(cond) ?? null
}

export async function upsertBuffSet(input: InputBuff): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const entityType = input.entityType
    if (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number])) {
        return { error: '无效的实体类型' }
    }
    const entityName = input.entityName.trim().slice(0, 60)
    const buffName = input.buffName.trim().slice(0, 80)
    if (!entityName || !buffName) return { error: '实体名与增益名不能为空' }

    const { error } = await supabase.from('buff_sets').upsert(
        {
            entity_type: entityType,
            entity_name: entityName,
            buff_name: buffName,
            scope: normalizeScope(input.scope),
            exclusive: !!input.exclusive,
            condition: sanitizeConditionForEntity(input.condition),
            buff_set: sanitizeZones(input.zones)
        },
        { onConflict: 'entity_type,entity_name,buff_name' }
    )
    if (error) return { error: error.message }
    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return {}
}

export async function deleteBuffPreset(
    entityType: BuffEntityType,
    entityName: string,
    buffName: string
): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const { error } = await supabase
        .from('buff_sets')
        .delete()
        .eq('entity_type', entityType)
        .eq('entity_name', entityName)
        .eq('buff_name', buffName)
    if (error) return { error: error.message }
    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return {}
}

export interface InputEntityBuff {
    buffName: string
    scope?: BuffScope
    exclusive?: boolean
    condition?: BuffCondition | null
    zones: ZoneInput[]
}

export interface UpsertEntityInput {
    entityType: BuffEntityType
    entityName: string
    buffs: InputEntityBuff[]
}

export async function upsertBuffEntity(input: UpsertEntityInput): Promise<ActionResult<{ saved: number }>> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const entityType = input.entityType
    if (!BUFF_ENTITY_TYPES.includes(entityType as (typeof BUFF_ENTITY_TYPES)[number])) {
        return { error: '无效的实体类型' }
    }
    const entityName = input.entityName.trim().slice(0, 60)
    if (!entityName) return { error: '实体名不能为空' }

    // 整体替换：先删除该实体全部行，再写回
    const { error: delErr } = await supabase
        .from('buff_sets')
        .delete()
        .eq('entity_type', entityType)
        .eq('entity_name', entityName)
    if (delErr) return { error: delErr.message }

    const buffs = (input.buffs ?? [])
        .map((b) => ({
            buffName: b.buffName.trim().slice(0, 80),
            scope: normalizeScope(b.scope),
            exclusive: !!b.exclusive,
            condition: sanitizeConditionForEntity(b.condition),
            zones: sanitizeZones(b.zones)
        }))
        .filter((b) => b.buffName && b.zones.length > 0)

    if (buffs.length > 0) {
        const rows = buffs.map((b) => ({
            entity_type: entityType,
            entity_name: entityName,
            buff_name: b.buffName,
            scope: b.scope,
            exclusive: b.exclusive,
            condition: b.condition,
            buff_set: b.zones
        }))
        const { error } = await supabase.from('buff_sets').insert(rows)
        if (error) return { error: error.message }
    }

    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return { data: { saved: buffs.length } }
}

export async function deleteBuffEntity(
    entityType: BuffEntityType,
    entityName: string
): Promise<ActionResult> {
    const auth = await withAdmin()
    if (auth.error || !auth.supabase) return { error: auth.error ?? '无权限' }
    const supabase = auth.supabase

    const { error } = await supabase
        .from('buff_sets')
        .delete()
        .eq('entity_type', entityType)
        .eq('entity_name', entityName)
    if (error) return { error: error.message }
    revalidatePath('/buff-sets')
    revalidatePath('/admin/buff-sets')
    return {}
}